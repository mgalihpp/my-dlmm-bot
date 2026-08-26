import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { Bot } from "grammy";
import { repoPath } from "../../paths.js";
import type { ResolvedAgentConfig } from "../../services/Config.js";
import { escapeMarkdown, tgBold, tgPct, tgSolAmt } from "../format.js";
import { api, resolveWallet, screenPools } from "../fx.js";
import { MD } from "../utils.js";
import { heuristicScore, rankPools } from "./heuristic.js";
import { readJournalAll } from "./journal.js";
import { logInfo } from "./log.js";
import { loadSignalWeights } from "./signalWeights.js";
import { type AgentState, loadState } from "./state.js";
import {
	type ActionCounts,
	actionCounts,
	pnlPctValue,
	type TradeStats,
	tradeStats,
} from "./stats.js";

export interface BriefingPoolLine {
	poolName: string;
	amountSol: number;
	pnlPct: number | null;
	ageHours: number | null;
	feePerTvl24h: string | null;
}

export interface BriefingMarketLine {
	name: string;
	heuristic: number;
	feeActiveTvlRatio: number;
	volume: number;
	priceVsAthPct: number | null;
	rugScore: number | null;
	holders: number;
	organicScore: number;
	tvl: number;
	volatility: number;
	tokenAgeHours: number | null;
	poolAgeHours: number | null;
}

export interface BriefingData {
	portfolio: readonly BriefingPoolLine[];
	deployedSol: number;
	stats: TradeStats;
	activity: ActionCounts;
	market: readonly BriefingMarketLine[];
}

export interface BriefingCache {
	readonly at: string;
	readonly text: string;
	readonly source: "llm" | "fallback";
}

const DEFAULT_CACHE_FILE = repoPath(".vexis-agent-briefing.json");

export function readBriefingCache(
	file: string = DEFAULT_CACHE_FILE,
): BriefingCache | null {
	if (!existsSync(file)) return null;
	try {
		const value = JSON.parse(readFileSync(file, "utf8")) as Record<
			string,
			unknown
		>;
		if (
			typeof value.at !== "string" ||
			typeof value.text !== "string" ||
			(value.source !== "llm" && value.source !== "fallback")
		) {
			return null;
		}
		return { at: value.at, text: value.text, source: value.source };
	} catch {
		return null;
	}
}

export function writeBriefingCache(
	cache: BriefingCache,
	file: string = DEFAULT_CACHE_FILE,
): void {
	try {
		writeFileSync(file, JSON.stringify(cache, null, 2), "utf8");
	} catch (e) {
		console.warn("[agent] briefing cache write failed:", e);
	}
}

export function buildBriefingPrompt(data: BriefingData): string {
	const portfolioSection =
		data.portfolio.length > 0
			? data.portfolio
					.map(
						(p) =>
							`- ${p.poolName} ${p.amountSol} SOL pnl=${p.pnlPct == null ? "n/a" : `${p.pnlPct.toFixed(2)}%`}${p.ageHours != null ? ` ageHours=${p.ageHours}` : ""}${p.feePerTvl24h != null ? ` feePerTvl24h=${p.feePerTvl24h}` : ""}`,
					)
					.join("\n")
			: "- none";
	const marketSection =
		data.market.length > 0
			? data.market
					.map(
						(m) =>
							`- ${m.name} heuristic=${m.heuristic} feeTvlRatio=${m.feeActiveTvlRatio.toFixed(4)} volume=${m.volume} rugScore=${m.rugScore ?? "n/a"} holders=${m.holders} organic=${m.organicScore} tvl=${m.tvl} volatility=${m.volatility.toFixed(4)}${m.priceVsAthPct != null ? ` fromAthPct=${(100 - m.priceVsAthPct).toFixed(1)}%` : ""}${m.tokenAgeHours != null ? ` tokenAgeHours=${m.tokenAgeHours}` : ""}${m.poolAgeHours != null ? ` poolAgeHours=${m.poolAgeHours}` : ""}`,
					)
					.join("\n")
			: "- none";
	const activitySection = `opens=${data.activity.open} holds=${data.activity.hold} tp=${data.activity.tp} sl=${data.activity.sl} close=${data.activity.close} blocked=${data.activity.blocked} failed=${data.activity.failed}`;
	const statsSection =
		data.stats.closes > 0
			? `closes=${data.stats.closes} winRate=${Math.round(data.stats.winRate ?? 0)}% avg=${(data.stats.avgPnlPct ?? 0).toFixed(2)}% total=${(data.stats.totalPnlPct ?? 0).toFixed(2)}%`
			: "no closed trades yet";
	return [
		"Create a daily summary for the Meteora DLMM LP bot on Solana, max 300 words. Use plain text only, no markdown, emoji, or bold.",
		"Write in natural, direct English. Use available numbers and avoid generic commentary not supported by data.",
		"",
		"Cover the following three points:",
		"1. Portfolio status: open positions, PnL per position, win rate, and deployed SOL vs maximum limit. Flag risks such as out-of-range (OOR) positions, old positions with low fees, and overly concentrated capital.",
		"2. Last 24h activity: positions that were OPENed or CLOSEd, positions hit by TP/SL, actions blocked by guardrails, and any failures.",
		"3. Market conditions: top pools from screening. Mention feeTvlRatio, volume, rugScore, and fromAthPct. fromAthPct is the percentage price is below ATH; a larger number means price is further from its peak.",
		"",
		"In the portfolio section, use ageHours and feePerTvl24h to explain risk when data supports it, especially old OOR positions or low-fee positions.",
		"",
		"Portfolio:",
		portfolioSection,
		"",
		`Deployed: ${data.deployedSol} SOL. Stats: ${statsSection}`,
		"",
		"Last 24h:",
		activitySection,
		"",
		"Top pools:",
		marketSection,
	].join("\n");
}

export function formatBriefing(text: string, now: Date = new Date()): string {
	const dateLabel = escapeMarkdown(now.toISOString().slice(0, 10));
	return [
		`${tgBold("📋 Daily briefing")} · ${dateLabel}`,
		"━━━━━━━━━━━━",
		escapeMarkdown(text),
	].join("\n");
}

export function formatBriefingFallback(
	data: BriefingData,
	now: Date = new Date(),
): string {
	const lines = [
		`${tgBold("📋 Daily briefing")} · ${escapeMarkdown(now.toISOString().slice(0, 10))}`,
		"━━━━━━━━━━━━",
		tgBold(`📦 Portfolio (${data.portfolio.length} open)`),
	];
	if (data.portfolio.length === 0) {
		lines.push(escapeMarkdown("No open positions."));
	} else {
		for (const p of data.portfolio) {
			lines.push(
				`${escapeMarkdown(`• ${p.poolName}`)} ${tgSolAmt(p.amountSol)}${p.pnlPct == null ? escapeMarkdown(" · PnL n/a") : ` · PnL ${tgPct(p.pnlPct)}`}`,
			);
		}
	}
	lines.push(`Deployed ${tgSolAmt(data.deployedSol)}`);
	if (data.stats.closes > 0) {
		lines.push(
			`Trades: ${escapeMarkdown(String(data.stats.closes))} closed \\| win ${escapeMarkdown(String(Math.round(data.stats.winRate ?? 0)))}% \\| avg ${escapeMarkdown(`${(data.stats.avgPnlPct ?? 0).toFixed(2)}%`)}`,
		);
	}
	lines.push(
		"━━━━━━━━━━━━",
		tgBold("📒 Last 24h"),
		`🚀 ${escapeMarkdown(String(data.activity.open))} open \\| 🎯 ${escapeMarkdown(String(data.activity.tp + data.activity.sl + data.activity.close))} tp/sl/close \\| ⛔ ${escapeMarkdown(String(data.activity.blocked))} blocked \\| ❌ ${escapeMarkdown(String(data.activity.failed))} failed`,
		"━━━━━━━━━━━━",
		tgBold("📈 Top pools"),
	);
	if (data.market.length === 0) {
		lines.push(escapeMarkdown("No pools screened."));
	} else {
		for (const m of data.market) {
			lines.push(
				`${escapeMarkdown(`• ${m.name}`)} — heuristic ${escapeMarkdown(String(m.heuristic))} \\| fee/TVL ${escapeMarkdown(m.feeActiveTvlRatio.toFixed(4))}${m.priceVsAthPct != null ? ` \\| ATH ${escapeMarkdown(`${m.priceVsAthPct}%`)}` : ""}`,
			);
		}
	}
	return lines.join("\n");
}

export function briefingFallbackText(data: BriefingData): string {
	const portfolio =
		data.portfolio.length === 0
			? "No open positions."
			: data.portfolio
					.map(
						(p) =>
							`${p.poolName}: ${p.amountSol} SOL, PnL ${p.pnlPct == null ? "n/a" : `${p.pnlPct.toFixed(2)}%`}`,
					)
					.join("; ");
	const market =
		data.market.length === 0
			? "No pools screened."
			: data.market
					.map(
						(m) =>
							`${m.name}: heuristic ${m.heuristic}, fee/TVL ${m.feeActiveTvlRatio.toFixed(4)}${m.priceVsAthPct != null ? `, ATH ${m.priceVsAthPct}%` : ""}`,
					)
					.join("; ");
	return `Portfolio (${data.portfolio.length} open): ${portfolio}\nDeployed ${data.deployedSol} SOL.\nLast 24h: ${data.activity.open} open, ${data.activity.tp + data.activity.sl + data.activity.close} TP/SL/close, ${data.activity.blocked} blocked, ${data.activity.failed} failed.\nTop pools: ${market}`;
}

const DAY_MS = 24 * 3_600_000;

/** Wallet PnL fetches that fail are skipped; pending positions (no positionAddress) don't appear in the list but are still counted as deployed. */
export async function collectBriefingData(
	state: AgentState,
	wallet: string,
	nowMs: number = Date.now(),
): Promise<BriefingData> {
	const portfolio: BriefingPoolLine[] = [];
	let deployedSol = 0;
	for (const plan of state.plans) {
		deployedSol += plan.amountSol ?? 0;
		if (!plan.positionAddress) continue;
		try {
			const pdata = await api.positionPnl(plan.pool, wallet, "open");
			const pos = pdata.positions.find(
				(pp) => pp.positionAddress === plan.positionAddress,
			);
			if (!pos || pos.isClosed) continue;
			portfolio.push({
				poolName: plan.poolName,
				amountSol: plan.amountSol,
				pnlPct: pnlPctValue(pos),
				ageHours:
					plan.openedAt != null
						? Math.floor((Date.now() - Date.parse(plan.openedAt)) / 3_600_000)
						: null,
				feePerTvl24h: pos.feePerTvl24h,
			});
		} catch {
			// positionPnl failed for this pool → skip
		}
	}
	const cutoff = nowMs - DAY_MS;
	const activityEntries = readJournalAll().filter(
		(e) => Date.parse(e.ts) >= cutoff,
	);
	const sw = loadSignalWeights();
	const market: BriefingMarketLine[] = [];
	try {
		const screen = await screenPools();
		const top = rankPools(screen.pools, {
			minCandidate: 0,
			maxCandidates: 5,
			weights: sw.weights,
		});
		for (const p of top) {
			market.push({
				name: p.name,
				heuristic: heuristicScore(p, sw.weights),
				feeActiveTvlRatio: p.feeActiveTvlRatio,
				volume: p.volume,
				priceVsAthPct: p.priceVsAthPct ?? null,
				rugScore: p.rugScore ?? null,
				holders: p.holders,
				organicScore: p.organicScore,
				tvl: p.tvl,
				volatility: p.volatility,
				tokenAgeHours: p.tokenAgeHours ?? null,
				poolAgeHours: p.poolAgeHours ?? null,
			});
		}
	} catch {
		// screening failed → market section empty
	}
	return {
		portfolio,
		deployedSol,
		stats: tradeStats(sw.perf),
		activity: actionCounts(activityEntries),
		market,
	};
}

export async function requestBriefing(
	cfg: ResolvedAgentConfig,
	data: BriefingData,
): Promise<{ text: string | null; failed: boolean }> {
	if (!cfg.llm.apiKey) return { text: null, failed: true };
	const provider = createOpenAICompatible({
		name: "vexis-llm",
		baseURL: cfg.llm.baseUrl,
		apiKey: cfg.llm.apiKey,
	});
	const prompt = buildBriefingPrompt(data);
	logInfo("LLM briefing request:", {
		model: cfg.llm.model,
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
		logInfo("LLM briefing raw response:", text);
		if (!text) return { text: null, failed: true };
		return { text, failed: false };
	} catch (e) {
		console.error(
			"[agent] briefing LLM request failed:",
			e instanceof Error ? e.message : String(e),
		);
		return { text: null, failed: true };
	}
}

/** Core briefing: collect → LLM → send, fallback to raw data when LLM fails. Read-only. */
export async function runBriefing(
	bot: Bot,
	chatId: string,
	cfg: ResolvedAgentConfig,
): Promise<void> {
	try {
		const wallet = await resolveWallet();
		const data = await collectBriefingData(loadState(), wallet);
		const { text, failed } = await requestBriefing(cfg, data);
		const msg = failed ? formatBriefingFallback(data) : formatBriefing(text!);
		await bot.api.sendMessage(chatId, msg, MD);
		writeBriefingCache({
			at: new Date().toISOString(),
			text: failed ? briefingFallbackText(data) : text!,
			source: failed ? "fallback" : "llm",
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await bot.api
			.sendMessage(chatId, `✖ Briefing failed: ${msg}`, MD)
			.catch(() => {});
	}
}
