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
			`- maxRugScore=${g.maxRugScore} (RugCheck 0-2500; 0-1 = clean, above → reject)`,
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
		"Kamu membantu mengelola posisi LP bot di pool Meteora DLMM (Solana). Semua pool di bawah sudah lolos screening deterministik. Untuk setiap pool, pilih OPEN (buka posisi sekarang) atau HOLD (jangan buka posisi).",
		"",
		"Hal DLMM yang perlu dipertimbangkan:",
		"- Likuiditas disimpan dalam bin harga. Posisi hanya menghasilkan fee saat harga aktif pool berada di dalam range posisi.",
		"- feeTvlRatio adalah fee pool per unit active TVL dan menjadi ukuran utama efisiensi. Nilai yang lebih besar berarti modal bekerja lebih efisien.",
		"- binStep adalah jarak harga antarbin. Nilai kecil membuat bin lebih rapat, sedangkan nilai besar lebih sesuai untuk aset yang volatil.",
		"- Volatilitas tinggi umum terjadi pada meme coin dan dapat menghasilkan fee lebih besar, tetapi juga meningkatkan risiko posisi keluar dari range dan berhenti menghasilkan fee.",
		"",
		"Cara membaca data:",
		"- feeTvlRatio: nilai lebih besar berarti fee per unit likuiditas aktif lebih tinggi.",
		"- organicScore: nilai lebih besar berarti aktivitas lebih organik dan lebih sedikit dipengaruhi bot.",
		"- holders, volume, swapCount, uniqueTraders: indikator aktivitas nyata. swapCount tinggi dengan uniqueTraders rendah dapat menunjukkan wash trading atau aktivitas bot.",
		"- top10Pct, bundlePct, botHoldersPct: nilai lebih kecil umumnya lebih sehat.",
		"- rugScore (RugCheck 0-2500): nilai 0-1 tergolong bersih. Nilai di atas maxRugScore akan ditolak guardrail, jadi jangan pernah memilih OPEN untuk pool tersebut.",
		"- isRugpull, isWash, atau devSoldAll: jika bernilai true, pilih HOLD.",
		"- dexScreenerPaid: hanya menunjukkan bahwa promosi DexScreener dibayar. Ini bukan sinyal rugpull dan bukan alasan untuk menolak pool.",
		"- fromAthPct: persentase harga di bawah ATH atau 24h-high. Nilai lebih besar berarti harga lebih jauh dari puncak. Guardrail menolak nilai di bawah minFromAthPct.",
		"- globalFeesSol: total fee pool. Guardrail menolak nilai di bawah minTokenFeesSol.",
		"- activeTvl/tvl: perbandingan likuiditas aktif dengan total likuiditas. activeTvl menunjukkan likuiditas yang benar-benar digunakan untuk swap.",
		"",
		"Aturan:",
		"1. Jangan pilih OPEN untuk pool yang melanggar guardrail. Bot akan menolaknya.",
		"2. Utamakan feeTvlRatio yang kuat, risiko yang terkendali, dan aktivitas nyata.",
		"3. Pilih OPEN hanya jika potensi fee terlihat jelas dan risikonya masuk akal. Jika ragu, pilih HOLD. HOLD adalah keputusan yang aman.",
		"",
		'Balas JSON array polos, tanpa markdown, satu objek per pool: [{"pool":"<id pool persis>","action":"open|hold","rationale":"1 kalimat spesifik, wajib sebut angka nyata dari data (mis. feeTvlRatio=0.08, rugScore=2, bundlePct=45%)"}]',
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

export function buildPositionPrompt(positions: readonly OorPosition[]): string {
	const table = positions
		.map(
			(p) =>
				`- pool=${p.pool} pair=${p.poolName} pnlPct=${p.pnlPct.toFixed(2)}% minPrice=${p.minPrice} maxPrice=${p.maxPrice}${p.poolActivePrice != null ? ` poolActivePrice=${p.poolActivePrice}` : ""}${p.positionAgeHours != null ? ` positionAgeHours=${p.positionAgeHours}` : ""}${p.feePerTvl24h != null ? ` feePerTvl24h=${p.feePerTvl24h}` : ""}${p.pnlUsd != null ? ` pnlUsd=${p.pnlUsd}` : ""}${p.unrealizedPnlSol != null ? ` unrealizedPnlSol=${p.unrealizedPnlSol}` : ""}${p.amountSol != null ? ` amountSol=${p.amountSol}` : ""}${p.openSignals != null ? ` openSignals=${p.openSignals}` : ""}`,
		)
		.join("\n");
	return [
		"Posisi DLMM di bawah sedang out-of-range (OOR). Harga aktif pool sudah keluar dari range posisi, sehingga posisi tidak menghasilkan fee sampai harga kembali ke dalam range.",
		"",
		"Hal yang perlu dipertimbangkan:",
		"- Posisi LP hanya menghasilkan fee saat harga aktif pool berada di dalam range posisi.",
		"- Saat harga keluar dari range, posisi tetap terbuka tetapi tidak menghasilkan fee.",
		"- OOR ke kanan (poolActivePrice > maxPrice): harga naik melewati range, sehingga posisi menjadi full SOL dan tidak lagi mengikuti kenaikan token. Jika harga sudah jauh dan tidak kunjung kembali, posisi dapat ditutup agar modal bisa digunakan di tempat lain.",
		"- OOR ke kiri (poolActivePrice < minPrice): harga turun melewati range, sehingga posisi menjadi full token meme. Jika pnlPct negatif, kerugian dapat terus bertambah dan posisi layak ditutup. Jika pnlPct positif, posisi ikut naik dan dapat ditutup untuk mengunci keuntungan.",
		"- Posisi yang masih baru dan berada dekat dengan range dapat dipertahankan karena harga masih mungkin kembali dan fee kembali berjalan.",
		"- Pertimbangkan positionAgeHours dan feePerTvl24h. Posisi lama yang sudah lama OOR dan menghasilkan fee rendah lebih layak ditutup.",
		"- openSignals adalah snapshot sinyal saat posisi dibuka dan hanya digunakan sebagai konteks.",
		"",
		'Balas JSON array polos, tanpa markdown: [{"pool":"<id pool persis>","action":"hold|close","rationale":"1 kalimat spesifik, sebut angka (mis. poolActivePrice 3x maxPrice, pnlPct=-8%, ageHours=50)"}]',
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
