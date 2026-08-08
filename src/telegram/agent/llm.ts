import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { ResolvedAgentConfig } from "../../services/Config.js";

export interface LlmCandidate {
	pool: string;
	pair: string;
	heuristic: number;
	feeActiveTvlRatio: number;
	organicScore: number;
	holders: number;
	volume: number;
	priceVsAthPct?: number | null;
	rugScore?: number | null;
	top10Pct?: number | null;
	bundlePct?: number | null;
	botHoldersPct?: number | null;
	globalFeesSol?: number | null;
	activePositions?: number | null;
}

export interface LlmSignal {
	pool: string;
	favorability: number;
	rationale: string;
}

export type PositionAction = "hold" | "close";

export interface OorPosition {
	pool: string;
	poolName: string;
	pnlPct: number;
	minPrice: string;
	maxPrice: string;
	poolActivePrice: string | null;
}

export interface PositionDecision {
	pool: string;
	action: PositionAction;
	rationale: string;
}

const clampFav = (v: unknown): number | null => {
	if (typeof v !== "number" || !Number.isFinite(v)) return null;
	return Math.max(-1, Math.min(1, v));
};

export function buildPrompt(
	candidates: readonly LlmCandidate[],
	weightsSummary?: string,
): string {
	const table = candidates
		.map(
			(c) =>
				`- pool=${c.pool} pair=${c.pair} heuristic=${c.heuristic} feeTvlRatio=${c.feeActiveTvlRatio.toFixed(4)} organic=${c.organicScore} holders=${c.holders} volume=${c.volume}${c.priceVsAthPct != null ? ` priceVsAthPct=${c.priceVsAthPct}` : ""}${c.rugScore != null ? ` rugScore=${c.rugScore}` : ""}${c.top10Pct != null ? ` top10Pct=${c.top10Pct}` : ""}${c.bundlePct != null ? ` bundlePct=${c.bundlePct}` : ""}${c.botHoldersPct != null ? ` botHoldersPct=${c.botHoldersPct}` : ""}${c.globalFeesSol != null ? ` globalFeesSol=${c.globalFeesSol}` : ""}${c.activePositions != null ? ` activePositions=${c.activePositions}` : ""}`,
		)
		.join("\n");
	return [
		"You are a market advisor for a DLMM liquidity bot. For each pool, output a `favorability` score between -1 (strongly avoid) and +1 (strongly favorable), plus a one-line rationale.",
		'Reply with a JSON array only, never markdown: [{"pool":"<exact pool id>","favorability":0.5,"rationale":"..."}]',
		"",
		"Candidates:",
		table,
		...(weightsSummary ? ["", weightsSummary] : []),
	].join("\n");
}

export function parseLlmResponse(content: string): LlmSignal[] {
	const cleaned = content
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "");
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		return [];
	}
	const arr = Array.isArray(parsed)
		? parsed
		: (parsed as { candidates?: unknown }).candidates;
	if (!Array.isArray(arr)) return [];
	const out: LlmSignal[] = [];
	for (const item of arr) {
		const o = item as {
			pool?: unknown;
			favorability?: unknown;
			rationale?: unknown;
		};
		if (typeof o.pool !== "string" || o.pool === "") continue;
		const fav = clampFav(o.favorability);
		if (fav === null) continue;
		out.push({
			pool: o.pool,
			favorability: fav,
			rationale: typeof o.rationale === "string" ? o.rationale : "",
		});
	}
	return out;
}

export async function requestSignals(opts: {
	cfg: ResolvedAgentConfig;
	candidates: readonly LlmCandidate[];
	weightsSummary?: string;
}): Promise<{ signals: LlmSignal[]; degraded: boolean }> {
	const { cfg } = opts;
	if (!cfg.llm.apiKey) return { signals: [], degraded: true };
	// no candidates is a normal state, not an LLM failure
	if (opts.candidates.length === 0) return { signals: [], degraded: false };
	const provider = createOpenAICompatible({
		name: "vexis-llm",
		baseURL: cfg.llm.baseUrl,
		apiKey: cfg.llm.apiKey,
	});
	try {
		const { text } = await generateText({
			model: provider(cfg.llm.model),
			messages: [
				{
					role: "user",
					content: buildPrompt(opts.candidates, opts.weightsSummary),
				},
			],
			temperature: 0,
			maxRetries: 1,
			timeout: cfg.llm.timeoutMs,
		});
		if (!text) return { signals: [], degraded: true };
		return { signals: parseLlmResponse(text), degraded: false };
	} catch (e) {
		// timeout / network: degrade to heuristic-only
		console.error(
			"[agent] LLM request failed:",
			e instanceof Error ? e.message : String(e),
		);
		return { signals: [], degraded: true };
	}
}

export function buildPositionPrompt(positions: readonly OorPosition[]): string {
	const table = positions
		.map(
			(p) =>
				`- pool=${p.pool} pair=${p.poolName} pnlPct=${p.pnlPct} minPrice=${p.minPrice} maxPrice=${p.maxPrice}${p.poolActivePrice != null ? ` poolActivePrice=${p.poolActivePrice}` : ""}`,
		)
		.join("\n");
	return [
		"You manage DLMM liquidity positions. Each position below is out of range — its bin range no longer covers the pool's active price, so it earns no fees.",
		"Decide for each position: `hold` (keep, price may re-enter range) or `close` (zap out to WSOL). Weigh pnlPct and how far the active price sits from the range.",
		'Reply with a JSON array only, never markdown: [{"pool":"<exact pool id>","action":"hold|close","rationale":"..."}]',
		"",
		"Positions:",
		table,
	].join("\n");
}

export function parsePositionResponse(content: string): PositionDecision[] {
	const cleaned = content
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "");
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		return [];
	}
	const arr = Array.isArray(parsed)
		? parsed
		: (parsed as { decisions?: unknown }).decisions;
	if (!Array.isArray(arr)) return [];
	const out: PositionDecision[] = [];
	for (const item of arr) {
		const o = item as { pool?: unknown; action?: unknown; rationale?: unknown };
		if (typeof o.pool !== "string" || o.pool === "") continue;
		out.push({
			pool: o.pool,
			action: o.action === "close" ? "close" : "hold",
			rationale: typeof o.rationale === "string" ? o.rationale : "",
		});
	}
	return out;
}

export async function requestPositionDecisions(opts: {
	cfg: ResolvedAgentConfig;
	positions: readonly OorPosition[];
}): Promise<{ decisions: PositionDecision[]; degraded: boolean }> {
	const { cfg } = opts;
	if (!cfg.llm.apiKey) return { decisions: [], degraded: true };
	if (opts.positions.length === 0) return { decisions: [], degraded: false };
	const provider = createOpenAICompatible({
		name: "vexis-llm",
		baseURL: cfg.llm.baseUrl,
		apiKey: cfg.llm.apiKey,
	});
	try {
		const { text } = await generateText({
			model: provider(cfg.llm.model),
			messages: [
				{ role: "user", content: buildPositionPrompt(opts.positions) },
			],
			temperature: 0,
			maxRetries: 1,
			timeout: cfg.llm.timeoutMs,
		});
		if (!text) return { decisions: [], degraded: true };
		return { decisions: parsePositionResponse(text), degraded: false };
	} catch (e) {
		console.error(
			"[agent] OOR LLM request failed:",
			e instanceof Error ? e.message : String(e),
		);
		return { decisions: [], degraded: true };
	}
}
