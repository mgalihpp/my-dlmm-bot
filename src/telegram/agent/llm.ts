import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { ResolvedAgentConfig } from "../../services/Config.js";
import { logInfo } from "./log.js";

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

export function isLlmTimeout(e: unknown): boolean {
	const msg = e instanceof Error ? e.message : String(e);
	return /timeout|timed out|abort/i.test(msg);
}

export function describeLlmFailure(e: unknown, timeoutMs: number): string {
	if (isLlmTimeout(e)) {
		return `LLM request timed out after ${timeoutMs}ms. Increase agent.llm.timeoutMs in vexis.config.json (e.g. 300000).`;
	}
	return e instanceof Error ? e.message : String(e);
}

export const LLM_MISSING_KEY_MESSAGE =
	"LLM API key is not configured — set agent.llm.apiKey in vexis.config.json or OPENAI_API_KEY";
const LLM_EMPTY_RESPONSE_MESSAGE = "LLM returned an empty response";
const LLM_UNPARSEABLE_RESPONSE_MESSAGE =
	"LLM returned an unparseable response — expected a JSON array";

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
		"Risk field notes: rugScore is RugCheck's 0-2500 score, lower = lower rug-pull risk, but no score (not even 1) means zero risk — meme tokens can still go to zero. priceVsAthPct is % of ATH. top10Pct/bundlePct/botHoldersPct are percentages, lower is better.",
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
}): Promise<{
	decisions: LlmOpenDecision[] | null;
	failed: boolean;
	errorMessage?: string;
}> {
	const { cfg } = opts;
	if (!cfg.llm.apiKey)
		return {
			decisions: null,
			failed: true,
			errorMessage: LLM_MISSING_KEY_MESSAGE,
		};
	// no candidates is a normal state, not an LLM failure
	if (opts.candidates.length === 0) return { decisions: [], failed: false };
	const provider = createOpenAICompatible({
		name: "vexis-llm",
		baseURL: cfg.llm.baseUrl,
		apiKey: cfg.llm.apiKey,
	});
	const prompt = buildOpenDecisionPrompt(
		opts.candidates,
		opts.weightsSummary,
		opts.portfolioContext,
	);
	logInfo("LLM open-decision request:", {
		model: cfg.llm.model,
		candidates: opts.candidates.length,
		prompt,
	});
	try {
		const { text } = await generateText({
			model: provider(cfg.llm.model),
			messages: [{ role: "user", content: prompt }],
			temperature: 0,
			maxRetries: 1,
			timeout: cfg.llm.timeoutMs,
		});
		logInfo("LLM open-decision raw response:", text);
		if (!text)
			return {
				decisions: null,
				failed: true,
				errorMessage: LLM_EMPTY_RESPONSE_MESSAGE,
			};
		const decisions = parseOpenDecisionResponse(text);
		if (decisions === null)
			return {
				decisions: null,
				failed: true,
				errorMessage: LLM_UNPARSEABLE_RESPONSE_MESSAGE,
			};
		return { decisions, failed: false };
	} catch (e) {
		// timeout / network: skip cycle, no trades
		const message = describeLlmFailure(e, cfg.llm.timeoutMs);
		console.error("[agent] LLM request failed:", message);
		return { decisions: null, failed: true, errorMessage: message };
	}
}

export function buildPositionPrompt(positions: readonly OorPosition[]): string {
	const table = positions
		.map(
			(p) =>
				`- pool=${p.pool} pair=${p.poolName} pnlPct=${p.pnlPct.toFixed(2)}% minPrice=${p.minPrice} maxPrice=${p.maxPrice}${p.poolActivePrice != null ? ` poolActivePrice=${p.poolActivePrice}` : ""}`,
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

export function parsePositionResponse(
	content: string,
): PositionDecision[] | null {
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
}): Promise<{
	decisions: PositionDecision[];
	degraded: boolean;
	errorMessage?: string;
}> {
	const { cfg } = opts;
	if (!cfg.llm.apiKey)
		return {
			decisions: [],
			degraded: true,
			errorMessage: LLM_MISSING_KEY_MESSAGE,
		};
	if (opts.positions.length === 0) return { decisions: [], degraded: false };
	const provider = createOpenAICompatible({
		name: "vexis-llm",
		baseURL: cfg.llm.baseUrl,
		apiKey: cfg.llm.apiKey,
	});
	const prompt = buildPositionPrompt(opts.positions);
	logInfo("LLM OOR position request:", {
		model: cfg.llm.model,
		positions: opts.positions.length,
		prompt,
	});
	try {
		const { text } = await generateText({
			model: provider(cfg.llm.model),
			messages: [{ role: "user", content: prompt }],
			temperature: 0,
			maxRetries: 1,
			timeout: cfg.llm.timeoutMs,
		});
		logInfo("LLM OOR position raw response:", text);
		if (!text)
			return {
				decisions: [],
				degraded: true,
				errorMessage: LLM_EMPTY_RESPONSE_MESSAGE,
			};
		const decisions = parsePositionResponse(text);
		if (decisions === null)
			return {
				decisions: [],
				degraded: true,
				errorMessage: LLM_UNPARSEABLE_RESPONSE_MESSAGE,
			};
		return { decisions, degraded: false };
	} catch (e) {
		const message = describeLlmFailure(e, cfg.llm.timeoutMs);
		console.error("[agent] OOR LLM request failed:", message);
		return { decisions: [], degraded: true, errorMessage: message };
	}
}
