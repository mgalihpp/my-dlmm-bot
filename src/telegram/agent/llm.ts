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
	tvl?: number | null;
	activeTvl?: number | null;
	mcap?: number | null;
	volatility?: number | null;
	binStep?: number | null;
	baseFeePct?: number | null;
	fee?: number | null;
	openPositions?: number | null;
	tokenAgeHours?: number | null;
	price?: number | null;
	priceChangePct?: number | null;
	volumeChangePct?: number | null;
	fromAthPct?: number | null;
	poolAgeHours?: number | null;
	swapCount?: number | null;
	uniqueTraders?: number | null;
	priceTrend?: string | null;
	lpLockedPct?: number | null;
	isRugpull?: boolean | null;
	isWash?: boolean | null;
	devSoldAll?: boolean | null;
	dexScreenerPaid?: boolean | null;
}

export interface CooldownEntry {
	pool: string;
	poolName: string;
	until: string;
	reason: string;
}

export interface GuardrailContext {
	maxBundlePct: number | null;
	maxBotHoldersPct: number | null;
	maxTop10Pct: number | null;
	minFromAthPct: number | null;
	minTokenFeesSol: number | null;
	maxRugScore: number | null;
	maxTotalSol: number;
	maxOpenPositions: number;
	maxSolPerPosition: number;
	deployedSol: number;
	openPositions: number;
	cooldowns: readonly CooldownEntry[];
}

export function buildGuardrailSection(g: GuardrailContext): string {
	const lines = [
		"Guardrail thresholds (hard veto — opens breaching any of these are rejected by the bot):",
	];
	if (g.maxBundlePct != null)
		lines.push(
			`- maxBundlePct=${g.maxBundlePct}% (bundlePct above this → reject)`,
		);
	if (g.maxBotHoldersPct != null)
		lines.push(
			`- maxBotHoldersPct=${g.maxBotHoldersPct}% (botHoldersPct above this → reject)`,
		);
	if (g.maxTop10Pct != null)
		lines.push(
			`- maxTop10Pct=${g.maxTop10Pct}% (top10Pct above this → reject)`,
		);
	if (g.minFromAthPct != null)
		lines.push(
			`- minFromAthPct=${g.minFromAthPct}% (fromAthPct below this = price less than ${g.minFromAthPct}% under its 24h high → reject)`,
		);
	if (g.minTokenFeesSol != null)
		lines.push(
			`- minTokenFeesSol=${g.minTokenFeesSol} SOL (globalFeesSol below this → reject)`,
		);
	if (g.maxRugScore != null)
		lines.push(
			`- maxRugScore=${g.maxRugScore} (RugCheck 0-2500; pass ≤250, review ≤1250, blocked >1250 → reject)`,
		);
	lines.push(
		`- capacity: ${g.openPositions}/${g.maxOpenPositions} open positions, deployed ${g.deployedSol.toFixed(2)}/${g.maxTotalSol} SOL cap, max ${g.maxSolPerPosition} SOL per position`,
	);
	if (g.cooldowns.length > 0) {
		lines.push(
			"- cooldown (do not open, per-pool — other pools are NOT in cooldown):",
		);
		for (const c of g.cooldowns) {
			lines.push(
				`  - ${c.poolName || c.pool} (pool=${c.pool}) until ${c.until} (${c.reason})`,
			);
		}
	} else {
		lines.push("- cooldown: none");
	}
	return lines.join("\n");
}

export type PositionAction = "hold" | "close";

export interface OorPosition {
	pool: string;
	poolName: string;
	pnlPct: number;
	minPrice: string;
	maxPrice: string;
	poolActivePrice: string | null;
	distancePct?: number | null;
	positionAgeHours?: number | null;
	feePerTvl24h?: string | null;
	pnlUsd?: string | null;
	unrealizedPnlSol?: string | null;
	amountSol?: number | null;
	openSignals?: string | null;
	/** Hours continuously OOR to the right (price > max). 0 when just entered, null if not tracked. Reset to 0 when back in-range. */
	oorDurationHours?: number | null;
	/** True when the position is in-range but stale (old + low fees). Used to differentiate LLM prompt section. */
	isStale?: boolean;
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
	guardrailsSection?: string,
): string {
	const table = candidates
		.map((c) => {
			const parts = [
				`pool=${c.pool}`,
				`pair=${c.pair}`,
				`heuristic=${c.heuristic}`,
				`feeTvlRatio=${c.feeActiveTvlRatio.toFixed(4)}`,
				`organic=${c.organicScore}`,
				`holders=${c.holders}`,
				`volume=${c.volume}`,
			];
			return parts
				.concat(
					...(c.tvl != null ? [`tvl=${c.tvl}`] : []),
					...(c.activeTvl != null ? [`activeTvl=${c.activeTvl}`] : []),
					...(c.mcap != null ? [`mcap=${c.mcap}`] : []),
					...(c.fee != null ? [`fee=${c.fee}`] : []),
					...(c.volatility != null
						? [`volatility=${c.volatility.toFixed(4)}`]
						: []),
					...(c.binStep != null ? [`binStep=${c.binStep}`] : []),
					...(c.baseFeePct != null ? [`baseFeePct=${c.baseFeePct}`] : []),
					...(c.price != null ? [`price=${c.price}`] : []),
					...(c.priceChangePct != null
						? [`priceChangePct=${c.priceChangePct}`]
						: []),
					...(c.volumeChangePct != null
						? [`volumeChangePct=${c.volumeChangePct}`]
						: []),
					...(c.fromAthPct != null
						? [`fromAthPct=${(c.fromAthPct * 100).toFixed(1)}%`]
						: c.priceVsAthPct != null
							? [`fromAthPct=${(100 - c.priceVsAthPct).toFixed(1)}%`]
							: []),
					...(c.tokenAgeHours != null
						? [`tokenAgeHours=${c.tokenAgeHours}`]
						: []),
					...(c.poolAgeHours != null ? [`poolAgeHours=${c.poolAgeHours}`] : []),
					...(c.swapCount != null ? [`swapCount=${c.swapCount}`] : []),
					...(c.uniqueTraders != null
						? [`uniqueTraders=${c.uniqueTraders}`]
						: []),
					...(c.priceTrend != null ? [`priceTrend=${c.priceTrend}`] : []),
					...(c.lpLockedPct != null ? [`lpLockedPct=${c.lpLockedPct}`] : []),
					...(c.isRugpull != null ? [`isRugpull=${c.isRugpull}`] : []),
					...(c.isWash != null ? [`isWash=${c.isWash}`] : []),
					...(c.devSoldAll != null ? [`devSoldAll=${c.devSoldAll}`] : []),
					...(c.dexScreenerPaid != null
						? [`dexScreenerPaid=${c.dexScreenerPaid}`]
						: []),
					...(c.rugScore != null ? [`rugScore=${c.rugScore}`] : []),
					...(c.top10Pct != null ? [`top10Pct=${c.top10Pct}`] : []),
					...(c.bundlePct != null ? [`bundlePct=${c.bundlePct}`] : []),
					...(c.botHoldersPct != null
						? [`botHoldersPct=${c.botHoldersPct}`]
						: []),
					...(c.globalFeesSol != null
						? [`globalFeesSol=${c.globalFeesSol}`]
						: []),
					...(c.activePositions != null
						? [`activePositions=${c.activePositions}`]
						: []),
				)
				.join(" ");
		})
		.join("\n");
	return [
		"You help manage LP positions for the Meteora DLMM bot (Solana). All pools below have passed deterministic screening. For each pool, choose OPEN (open a position now) or HOLD (do not open).",
		"",
		"DLMM considerations:",
		"- Liquidity is stored in price bins. A position only earns fees when the pool's active price is inside the position range.",
		"- feeTvlRatio is pool fees per unit of active TVL and is the primary efficiency metric. Higher means more capital-efficient.",
		"- binStep is the price distance between bins. Small values mean tighter bins, large values are better for volatile assets.",
		"- High volatility is common for meme coins and can generate higher fees, but also increases the risk of going out of range and stopping fee generation.",
		"",
		"How to read the data:",
		"- feeTvlRatio: higher means higher fees per unit of active liquidity.",
		"- organicScore: higher means more organic activity and less bot influence.",
		"- holders, volume, swapCount, uniqueTraders: indicators of real activity. High swapCount with low uniqueTraders may indicate wash trading or bot activity.",
		"- rugScore (RugCheck 0-2500): ≤250 pass, 250-1250 review, >1250 blocked. Values above maxRugScore will be rejected by guardrails, so never choose OPEN for those pools.",
		"- dexScreenerPaid: only indicates paid DexScreener promotion. It is not a rug signal and not a reason to reject a pool.",
		"- fromAthPct: percentage price is below ATH or 24h high. Larger means further from peak. Guardrails reject values below minFromAthPct.",
		"- globalFeesSol: total pool fees. Guardrails reject values below minTokenFeesSol.",
		"- activeTvl/tvl: active vs total liquidity comparison. activeTvl shows liquidity actually used for swaps.",
		"",
		"Rules:",
		"1. Do not choose OPEN for pools violating guardrails. The bot will reject them.",
		"2. Prioritize strong feeTvlRatio, controlled risk, and real activity.",
		"3. Choose OPEN only when fee potential is clear and risk is reasonable. When in doubt, choose HOLD. HOLD is the safe decision.",
		"",
		'Reply with a plain JSON array, no markdown, one object per pool: [{"pool":"<exact pool id>","action":"open|hold","rationale":"1 specific sentence, must mention real numbers from data (e.g. feeTvlRatio=0.08, rugScore=2, bundlePct=45%)"}]',
		...(guardrailsSection ? ["", guardrailsSection] : []),
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
	guardrails?: string;
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
		opts.guardrails,
	);
	logInfo("LLM open-decision request:", {
		model: cfg.llm.model,
		candidates: opts.candidates.length,
		prompt,
	});
	try {
		const result = await generateText({
			model: provider(cfg.llm.model),
			messages: [{ role: "user", content: prompt }],
			temperature: 0,
			maxRetries: 1,
			timeout: cfg.llm.timeoutMs,
			providerOptions: { vexisLlm: { thinking: { type: "disabled" } } },
		});
		const { text, usage } = result;
		logInfo("LLM open-decision usage:", {
			input: usage.inputTokens,
			output: usage.outputTokens,
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

/** Threshold after which OOR-right duration is considered long and LLM should lean to CLOSE. */
export const OOR_DURATION_THRESHOLD_HOURS = 0.5;

export function buildPositionPrompt(positions: readonly OorPosition[]): string {
	const hasStale = positions.some((p) => p.isStale);
	const hasOor = positions.some((p) => !p.isStale);
	const table = positions
		.map((p) => {
			const distance =
				p.distancePct != null
					? ` distance=${p.distancePct > 0 ? `+${p.distancePct.toFixed(1)}%` : `${p.distancePct.toFixed(1)}%`} (${p.poolActivePrice != null && Number(p.maxPrice) !== 0 ? (Number(p.poolActivePrice) / Number(p.maxPrice)).toFixed(2) : "?"}x maxPrice)`
					: "";
			const oorDur =
				p.oorDurationHours != null
					? ` oorDurationHours=${p.oorDurationHours.toFixed(1)}`
					: "";
			const staleTag = p.isStale ? " STALE(in-range, low yield)" : "";
			return `- pool=${p.pool} pair=${p.poolName} pnlPct=${p.pnlPct.toFixed(2)}% minPrice=${p.minPrice} maxPrice=${p.maxPrice}${p.poolActivePrice != null ? ` poolActivePrice=${p.poolActivePrice}` : ""}${distance}${oorDur}${p.positionAgeHours != null ? ` positionAgeHours=${p.positionAgeHours}` : ""}${p.feePerTvl24h != null ? ` feePerTvl24h=${p.feePerTvl24h}` : ""}${p.pnlUsd != null ? ` pnlUsd=${p.pnlUsd}` : ""}${p.unrealizedPnlSol != null ? ` unrealizedPnlSol=${p.unrealizedPnlSol}` : ""}${p.amountSol != null ? ` amountSol=${p.amountSol}` : ""}${p.openSignals != null ? ` openSignals=${p.openSignals}` : ""}${staleTag}`;
		})
		.join("\n");
	const intro =
		hasStale && hasOor
			? "The DLMM positions below need review: some are out-of-range (OOR) and some are stale in-range (old with low fees)."
			: hasStale
				? "The DLMM positions below are in-range but stale (old with low fees). They still earn fees but capital efficiency is low — consider whether closing and redeploying would be more productive."
				: "The DLMM positions below are out-of-range (OOR). The pool's active price has left the position range, so the position earns no fees until price returns inside the range.";
	const staleSection = hasStale
		? [
				"- STALE in-range (marked STALE): position is still in-range but positionAgeHours is large and feePerTvl24h is low — capital is idle/low-yield. Prefer CLOSE when feePerTvl24h is very low and ageHours > threshold, especially if pnlPct is near 0 or negative and amountSol blocks new opens (maxOpenPositions/maxTotalSol). Mention ageHours and feePerTvl24h in rationale. Do NOT close if pnlPct is deeply negative and fees have not covered slippage/rent — prefer HOLD unless redeploy has clearly better yield.",
			]
		: [];
	return [
		intro,
		"",
		"Considerations:",
		"- LP positions only earn fees when the pool's active price is inside the position range.",
		"- When price exits the range, the position stays open but earns no fees.",
		"- OOR to the right (poolActivePrice > maxPrice): position becomes full SOL, idle with no fees and no token upside. If distance >15-20% above maxPrice (poolActivePrice >1.2x maxPrice), especially when positionAgeHours >12h or feePerTvl24h is low, prefer CLOSE so capital can be redeployed. Distance >50% is almost always worth closing regardless of age.",
		"- OOR to the left (poolActivePrice < minPrice): position becomes full meme token. If pnlPct is negative, losses may keep growing -> worth CLOSE. If pnlPct is positive, consider CLOSE to lock profit. Large distance (>15-20% below minPrice) + old age -> CLOSE.",
		"- Positions that are still new (<6h) and close distance (<10% from range) can be HELD as price may still revert.",
		"- Consider positionAgeHours and feePerTvl24h. Old OOR positions with low fees are more worth closing. Mention distance, pnlPct, and ageHours in the rationale.",
		"- openSignals is a snapshot of signals at open time and is only used as context.",
		`- oorDurationHours = how long the position has been continuously OOR to the right (resets to 0 when back in-range). If oorDurationHours > ${OOR_DURATION_THRESHOLD_HOURS}h, the position has been idle on the right for a while — strongly recommend CLOSE so capital is not idle, unless there is a strong reason to hold. Mention oorDurationHours in rationale when >${OOR_DURATION_THRESHOLD_HOURS}h.`,
		...staleSection,
		"",
		`Reply with a plain JSON array, no markdown: [{"pool":"<exact pool id>","action":"hold|close","rationale":"1 specific sentence, mention numbers (e.g. distance +108% 2.08x maxPrice, pnlPct=-8%, ageHours=50, oorDurationHours=${OOR_DURATION_THRESHOLD_HOURS + 2})"}]`,
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
		const result = await generateText({
			model: provider(cfg.llm.model),
			messages: [{ role: "user", content: prompt }],
			temperature: 0,
			maxRetries: 1,
			timeout: cfg.llm.timeoutMs,
			providerOptions: { vexisLlm: { thinking: { type: "disabled" } } },
		});
		const { text, usage } = result;
		logInfo("LLM OOR position usage:", {
			input: usage.inputTokens,
			output: usage.outputTokens,
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
