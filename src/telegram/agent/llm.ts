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

export interface LlmOpenDecision {
	pool: string;
	action: "open" | "hold";
	rationale: string;
}

export function buildOpenDecisionPrompt(
	candidates: readonly LlmCandidate[],
	weightsSummary?: string,
	portfolioContext?: string,
): string {
	const table = candidates
		.map(
			(c) =>
				`- pool=${c.pool} pair=${c.pair} heuristic=${c.heuristic} feeTvlRatio=${c.feeActiveTvlRatio.toFixed(4)} organic=${c.organicScore} holders=${c.holders} volume=${c.volume}${c.priceVsAthPct != null ? ` priceVsAthPct=${c.priceVsAthPct}` : ""}${c.rugScore != null ? ` rugScore=${c.rugScore}` : ""}${c.top10Pct != null ? ` top10Pct=${c.top10Pct}` : ""}${c.bundlePct != null ? ` bundlePct=${c.bundlePct}` : ""}${c.botHoldersPct != null ? ` botHoldersPct=${c.botHoldersPct}` : ""}${c.globalFeesSol != null ? ` globalFeesSol=${c.globalFeesSol}` : ""}${c.activePositions != null ? ` activePositions=${c.activePositions}` : ""}`,
		)
		.join("\n");
	return [
		"You are a portfolio manager for a DLMM liquidity bot. Candidate pools below passed deterministic screening.",
		"Decide for EACH whether to OPEN a new position now or HOLD.",
		"- OPEN = strong fee potential, acceptable risk, fits portfolio context",
		"- HOLD = wait or avoid",
		"Use the heuristic score as context, not the only factor. Weigh risk fields.",
		'Reply with a JSON array only, never markdown: [{"pool":"<exact pool id>","action":"open|hold","rationale":"..."}]',
		"",
		"Candidates:",
		table,
		...(weightsSummary ? ["", weightsSummary] : []),
		...(portfolioContext ? ["", portfolioContext] : []),
	].join("\n");
}

/** Returns null when the body is not parseable as a JSON array — caller skips the cycle. */
export function parseOpenDecisionResponse(
	content: string,
): LlmOpenDecision[] | null {
	const cleaned = content
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "");
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		return null;
	}
	const arr = Array.isArray(parsed)
		? parsed
		: (parsed as { decisions?: unknown }).decisions;
	if (!Array.isArray(arr)) return null;
	const out: LlmOpenDecision[] = [];
	for (const item of arr) {
		const o = item as { pool?: unknown; action?: unknown; rationale?: unknown };
		if (typeof o.pool !== "string" || o.pool === "") continue;
		out.push({
			pool: o.pool,
			action: o.action === "open" ? "open" : "hold",
			rationale: typeof o.rationale === "string" ? o.rationale : "",
		});
	}
	return out;
}

export async function requestOpenDecisions(opts: {
	cfg: ResolvedAgentConfig;
	candidates: readonly LlmCandidate[];
	weightsSummary?: string;
	portfolioContext?: string;
}): Promise<{ decisions: LlmOpenDecision[] | null; failed: boolean }> {
	const { cfg } = opts;
	if (!cfg.llm.apiKey) return { decisions: null, failed: true };
	// no candidates is a normal state, not an LLM failure
	if (opts.candidates.length === 0) return { decisions: [], failed: false };
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
					content: buildOpenDecisionPrompt(
						opts.candidates,
						opts.weightsSummary,
						opts.portfolioContext,
					),
				},
			],
			temperature: 0,
			maxRetries: 1,
			timeout: cfg.llm.timeoutMs,
		});
		if (!text) return { decisions: null, failed: true };
		const decisions = parseOpenDecisionResponse(text);
		if (decisions === null) return { decisions: null, failed: true };
		return { decisions, failed: false };
	} catch (e) {
		// timeout / network: skip cycle, no trades
		console.error(
			"[agent] LLM request failed:",
			e instanceof Error ? e.message : String(e),
		);
		return { decisions: null, failed: true };
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
