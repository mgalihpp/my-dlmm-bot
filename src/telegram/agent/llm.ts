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
	if (!cfg.llm.apiKey || opts.candidates.length === 0) {
		return { signals: [], degraded: true };
	}
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
