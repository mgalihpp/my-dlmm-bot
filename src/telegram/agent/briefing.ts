import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { Bot } from "grammy";
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
}

export interface BriefingMarketLine {
	name: string;
	heuristic: number;
	feeActiveTvlRatio: number;
	volume: number;
	priceVsAthPct: number | null;
}

export interface BriefingData {
	portfolio: readonly BriefingPoolLine[];
	deployedSol: number;
	stats: TradeStats;
	activity: ActionCounts;
	market: readonly BriefingMarketLine[];
}

export function buildBriefingPrompt(data: BriefingData): string {
	const portfolioSection =
		data.portfolio.length > 0
			? data.portfolio
					.map(
						(p) =>
							`- ${p.poolName} ${p.amountSol} SOL pnl=${p.pnlPct == null ? "n/a" : `${p.pnlPct.toFixed(2)}%`}`,
					)
					.join("\n")
			: "- none";
	const marketSection =
		data.market.length > 0
			? data.market
					.map(
						(m) =>
							`- ${m.name} heuristic=${m.heuristic} feeTvlRatio=${m.feeActiveTvlRatio.toFixed(4)} volume=${m.volume}${m.priceVsAthPct != null ? ` priceVsAthPct=${m.priceVsAthPct}` : ""}`,
					)
					.join("\n")
			: "- none";
	const activitySection = `opens=${data.activity.open} holds=${data.activity.hold} tp=${data.activity.tp} sl=${data.activity.sl} close=${data.activity.close} blocked=${data.activity.blocked} failed=${data.activity.failed}`;
	const statsSection =
		data.stats.closes > 0
			? `closes=${data.stats.closes} winRate=${Math.round(data.stats.winRate ?? 0)}% avg=${(data.stats.avgPnlPct ?? 0).toFixed(2)}% total=${(data.stats.totalPnlPct ?? 0).toFixed(2)}%`
			: "no closed trades yet";
	return [
		"You are a portfolio manager for a Solana DLMM liquidity bot. Write a concise daily briefing under 300 words. Plain text only — no markdown, no emoji, no bold. Cover:",
		"1. Portfolio health: open positions, their PnL, win rate, deployed SOL vs max.",
		"2. Last 24h activity: what opened, closed, hit TP/SL, was blocked or failed.",
		"3. Market snapshot: notable top screened pools by heuristic, fees, volume.",
		"Language: Indonesian. Be specific, no filler. Flag risks: out-of-range positions, losing trades, concentrated capital, blocked opens.",
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

const DAY_MS = 24 * 3_600_000;

/** Wallet PnL fetch yang gagal di-skip; posisi pending (no positionAddress) tidak muncul di daftar tapi tetap dihitung deployed. */
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

/** Core briefing: collect → LLM → send, fallback data mentah saat LLM gagal. Read-only. */
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
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await bot.api
			.sendMessage(chatId, `✖ Briefing failed: ${msg}`, MD)
			.catch(() => {});
	}
}
