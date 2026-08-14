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
	maxPriceVsAthPct: number | null;
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
	if (g.maxBundlePct != null) lines.push(`- maxBundlePct=${g.maxBundlePct}%`);
	if (g.maxBotHoldersPct != null)
		lines.push(`- maxBotHoldersPct=${g.maxBotHoldersPct}%`);
	if (g.maxTop10Pct != null) lines.push(`- maxTop10Pct=${g.maxTop10Pct}%`);
	if (g.maxPriceVsAthPct != null)
		lines.push(
			`- maxPriceVsAthPct=${g.maxPriceVsAthPct}% (price as % of 24h high)`,
		);
	if (g.minTokenFeesSol != null)
		lines.push(`- minTokenFeesSol=${g.minTokenFeesSol} SOL`);
	if (g.maxRugScore != null)
		lines.push(
			`- maxRugScore=${g.maxRugScore} (RugCheck 0-2500; only 0-1 is clean, anything above means flagged risk)`,
		);
	lines.push(
		`- capacity: ${g.openPositions}/${g.maxOpenPositions} open positions, deployed ${g.deployedSol.toFixed(2)}/${g.maxTotalSol} SOL cap, max ${g.maxSolPerPosition} SOL per position`,
	);
	if (g.cooldowns.length > 0) {
		lines.push("- cooldown (do not open):");
		for (const c of g.cooldowns) {
			lines.push(`  - ${c.poolName || c.pool} until ${c.until} (${c.reason})`);
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
	positionAgeHours?: number | null;
	feePerTvl24h?: string | null;
	pnlUsd?: string | null;
	unrealizedPnlSol?: string | null;
	amountSol?: number | null;
	openSignals?: string | null;
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
					...(c.fromAthPct != null ? [`fromAthPct=${c.fromAthPct}`] : []),
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
					...(c.priceVsAthPct != null
						? [`priceVsAthPct=${c.priceVsAthPct}`]
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
		"Kandidat pool di bawah sudah lolos screening. Putuskan untuk tiap pool: OPEN (buka posisi sekarang) atau HOLD (skip).",
		"- OPEN kalau fee potential-nya jelas dan risikonya masuk akal, sesuai kapasitas portfolio.",
		"- HOLD kalau ragu. Gak perlu maksa.",
		"Skor heuristic cuma konteks, bukan segalanya. Yang penting: kalau kandidat melanggar threshold guardrails di bawah, jangan OPEN — itu cuma buang waktu, bakal ke-veto juga.",
		"Baca field risikonya: rugScore skor RugCheck 0-2500. Hanya rugScore 0-1 is clean — di atas 1 ke-veto sama maxRugScore, never OPEN it. dexScreenerPaid cuma tanda bayar promosi DexScreener, bukan rugpull — anggap sinyal kecil, timbang bareng rugScore dan fee. isRugpull/isWash/devSoldAll itu hard flag beneran — kalau true, HOLD. priceVsAthPct tinggi = harga udah deket ATH, makin tipis upside-nya. swapCount/uniqueTraders = aktivitas nyata. top10Pct/bundlePct/botHoldersPct makin kecil makin sehat. volatility tinggi = emang meme, jangan panik, timbang fee-nya.",
		'Balas JSON array aja, tanpa markdown: [{"pool":"<pool id persis>","action":"open|hold","rationale":"..."}]',
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
				`- pool=${p.pool} pair=${p.poolName} pnlPct=${p.pnlPct.toFixed(2)}% minPrice=${p.minPrice} maxPrice=${p.maxPrice}${p.poolActivePrice != null ? ` poolActivePrice=${p.poolActivePrice}` : ""}${p.positionAgeHours != null ? ` positionAgeHours=${p.positionAgeHours}` : ""}${p.feePerTvl24h != null ? ` feePerTvl24h=${p.feePerTvl24h}` : ""}${p.pnlUsd != null ? ` pnlUsd=${p.pnlUsd}` : ""}${p.unrealizedPnlSol != null ? ` unrealizedPnlSol=${p.unrealizedPnlSol}` : ""}${p.amountSol != null ? ` amountSol=${p.amountSol}` : ""}${p.openSignals != null ? ` openSignals=${p.openSignals}` : ""}`,
		)
		.join("\n");
	return [
		"Posisi di bawah lagi out-of-range — range bin-nya udah gak nutup harga aktif pool, jadi gak ngasilin fee.",
		"Putuskan tiap posisi: hold (tahan, harga bisa balik masuk range) atau close (zap out ke WSOL).",
		"Timbang: pnlPct, seberapa jauh harga aktif dari range, umur posisi, dan opportunity cost fee-nya. Posisi muda yang deket range → tahan. Posisi tua berjam-jam keluar range, rugi, dan fee-nya rendah → close. openSignals = snapshot sinyal waktu posisi dibuka.",
		'Balas JSON array aja, tanpa markdown: [{"pool":"<pool id persis>","action":"hold|close","rationale":"..."}]',
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
