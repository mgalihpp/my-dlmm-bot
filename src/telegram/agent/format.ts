import type { ResolvedAgentConfig } from "../../services/Config.js";
import {
	escapeMarkdown,
	tgBold,
	tgCode,
	tgPct,
	tgPoolAddr,
	tgSol,
	tgTs,
	tgUsd,
} from "../format.js";
import type { AgentJournalEntry, JournalCandidate } from "./journal.js";
import { delayToNextBoundary } from "./schedule.js";
import type { AgentState } from "./state.js";
import type { ActionCounts, TradeStats } from "./stats.js";

export function formatStatus(
	state: AgentState,
	cfg: ResolvedAgentConfig,
	stats: TradeStats | null = null,
	nowMs: number = Date.now(),
): string {
	const opened = state.plans.filter((p) => p.positionAddress != null).length;
	const deployed = state.plans.reduce((s, p) => s + (p.amountSol ?? 0), 0);
	const lines: string[] = [
		formatDashboardHeader(state, cfg, deployed, stats),
		`Open     ${formatBudgetBar(opened, cfg.maxOpenPositions)}`,
		`TP ${escapeMarkdown(String(cfg.tpPct))}% \\| SL ${escapeMarkdown(String(cfg.slPct))}% \\| notif ${escapeMarkdown(cfg.notifLevel)}`,
		...(state.llmStatus === "ok"
			? []
			: [`LLM: ${escapeMarkdown(state.llmStatus)}`]),
	];
	if (state.enabled) {
		lines.push(...formatSchedule(state, cfg, nowMs));
	} else {
		lines.push("🛑 Agent stopped — run `/agent start`");
	}
	if (state.cooldowns.length > 0) {
		lines.push(
			`Cooldowns: ${escapeMarkdown(String(state.cooldowns.length))}`,
			...state.cooldowns
				.slice(0, 3)
				.map(
					(c) =>
						`  • ${escapeMarkdown(c.poolName)} \\(${escapeMarkdown(c.reason)}\\)`,
				),
		);
	}
	if (state.plans.length > 0) {
		lines.push("", tgBold("📦 OPEN POSITIONS"));
		state.plans.forEach((p, i) => {
			const stateMarker = p.openedAt ? "▢" : "⏳";
			lines.push(
				`${i + 1}\\. ${escapeMarkdown(p.poolName)} ${tgSol(p.amountSol)} ${stateMarker}`,
			);
		});
	}
	return lines.join("\n");
}

export function formatAction(msg: {
	action: JournalCandidate["action"];
	poolName: string;
	amountSol?: number;
	pnlPct?: number | null;
	reason?: string | null;
	txSignature?: string | null;
	failed?: boolean;
}): string {
	const header = msg.failed
		? `❌ ${escapeMarkdown(msg.action.toUpperCase())} ${escapeMarkdown(msg.poolName)} FAILED`
		: `✅ ${escapeMarkdown(msg.action.toUpperCase())} ${escapeMarkdown(msg.poolName)}`;
	const lines = [header];
	if (msg.amountSol != null) {
		lines.push(`  ${escapeMarkdown(`${msg.amountSol} SOL`)}`);
	}
	if (msg.pnlPct != null) {
		lines.push(`  PnL: ${tgPct(msg.pnlPct)}`);
	}
	if (msg.reason) {
		lines.push(`  ${escapeMarkdown(msg.reason)}`);
	}
	if (msg.txSignature) {
		lines.push(`  ${tgCode(msg.txSignature)}`);
	}
	return lines.join("\n");
}

export function formatError(scope: string, err: unknown): string {
	const msg = err instanceof Error ? err.message : String(err);
	return `${tgBold(`❌ DLMM Agent ${escapeMarkdown(scope)} failed`)}\n${escapeMarkdown(msg)}`;
}

const ACT_ICON: Record<JournalCandidate["action"], string> = {
	open: "🚀",
	tp: "🎯",
	sl: "🛑",
	close: "📉",
	hold: "➖",
};

export function formatCycleSummary(
	entries: readonly AgentJournalEntry[],
	degraded: boolean,
): string {
	const last = entries[0];
	if (!last) return "🤖 No DLMM Agent cycle has run yet.";
	const opened = last.candidates.filter((c) => c.execution === "ok").length;
	const blocked = last.candidates.filter(
		(c) => c.guardrail === "blocked",
	).length;
	const lines: string[] = [
		tgBold(`🤖 VEXIS DLMM Agent · cycle #${last.cycle}`),
		`${tgTs(last.ts)} \\| opened ${escapeMarkdown(String(opened))} \\| blocked ${escapeMarkdown(String(blocked))}`,
		"━━━━━━━━━━━━",
	];
	if (degraded) lines.push("⚠️ LLM degraded — heuristic only");
	for (const c of last.candidates) {
		const icon = ACT_ICON[c.action] ?? "•";
		const status =
			c.execution === "ok"
				? `✅ ${tgCode(c.txSignature ?? "")}`
				: c.execution === "failed"
					? "❌ FAILED"
					: c.guardrail === "blocked"
						? `⛔ blocked: ${escapeMarkdown(c.blockedReason ?? "")}`
						: c.action === "hold"
							? "held"
							: "";
		lines.push(
			`${icon} ${escapeMarkdown(c.action.toUpperCase())} ${escapeMarkdown(c.poolName)}${status ? ` \\| ${status}` : ""}`,
		);
	}
	return lines.join("\n");
}

/** Live in-cycle status — header + phase lines, edited in place as the cycle runs. */
export function formatLive(cycle: number, lines: readonly string[]): string {
	return [
		tgBold(`🤖 VEXIS DLMM Agent · cycle #${cycle}`),
		"━━━━━━━━━━━━",
		...lines.map((l) => escapeMarkdown(l)),
	].join("\n");
}

export interface PortfolioRow {
	poolName: string;
	amountSol: number;
	pnlPct: number | null;
	outOfRange: boolean | null;
}

export function formatPortfolio(
	rows: readonly PortfolioRow[],
	deployedSol: number,
	stats: TradeStats,
): string {
	const lines = [tgBold(`📊 DLMM Agent portfolio (${rows.length})`)];
	if (rows.length === 0) {
		lines.push("No open positions.");
	} else {
		lines.push("");
		for (const r of rows) {
			const oor = r.outOfRange ? " ⚠️ OOR" : "";
			const pnl =
				r.pnlPct == null ? escapeMarkdown("PnL n/a") : `PnL ${tgPct(r.pnlPct)}`;
			lines.push(
				`${tgBold(r.poolName)}${escapeMarkdown(oor)}`,
				`  ${escapeMarkdown(`${r.amountSol} SOL`)} \\| ${pnl}`,
				"",
			);
		}
	}
	lines.push(`Deployed: ${escapeMarkdown(`${deployedSol} SOL`)}`);
	if (stats.closes > 0) {
		lines.push(
			`Trades: ${escapeMarkdown(`${stats.closes} closed`)} \\| win ${escapeMarkdown(`${Math.round(stats.winRate ?? 0)}%`)} \\| avg ${escapeMarkdown(`${(stats.avgPnlPct ?? 0).toFixed(2)}%`)}`,
		);
	}
	return lines.join("\n");
}

export type JournalFilter = "all" | "opens" | "closes" | "blocked";

export function journalPageCount(entryCount: number, pageSize: number): number {
	return Math.max(1, Math.ceil(entryCount / pageSize));
}

function journalMatches(c: JournalCandidate, filter: JournalFilter): boolean {
	switch (filter) {
		case "all":
			return true;
		case "opens":
			return c.execution === "ok";
		case "closes":
			return c.action === "tp" || c.action === "sl" || c.action === "close";
		case "blocked":
			return c.guardrail === "blocked";
	}
}

export function formatJournalPage(
	entries: readonly AgentJournalEntry[],
	opts: { page: number; pageSize: number; filter: JournalFilter },
	counts: ActionCounts,
): string {
	const newestFirst = [...entries].reverse();
	const totalPages = journalPageCount(newestFirst.length, opts.pageSize);
	const page = Math.min(Math.max(0, opts.page), totalPages - 1);
	const slice = newestFirst.slice(
		page * opts.pageSize,
		(page + 1) * opts.pageSize,
	);
	const lines = [
		tgBold(`📒 DLMM Agent journal · page ${page + 1}/${totalPages}`),
		`${escapeMarkdown(opts.filter)} filter \\| 🚀 ${escapeMarkdown(String(counts.open))} \\| 🎯${escapeMarkdown(String(counts.tp + counts.sl + counts.close))} \\| ⛔ ${escapeMarkdown(String(counts.blocked))}`,
		"━━━━━━━━━━━━",
	];
	let any = false;
	for (const e of slice) {
		const cands = e.candidates.filter((c) => journalMatches(c, opts.filter));
		if (cands.length === 0) continue;
		any = true;
		lines.push(
			`${tgBold(`#${e.cycle}`)} ${tgTs(e.ts)} \\| llm ${escapeMarkdown(e.llmStatus)}`,
		);
		for (const c of cands) {
			const icon = ACT_ICON[c.action] ?? "•";
			const status =
				c.guardrail === "blocked"
					? `⛔ ${escapeMarkdown(c.blockedReason ?? "")}`
					: c.execution === "ok"
						? `✅ ${tgCode(c.txSignature ?? "")}`
						: c.execution === "failed"
							? "❌ FAILED"
							: "";
			lines.push(
				`${icon} ${escapeMarkdown(c.action.toUpperCase())} ${escapeMarkdown(c.poolName)}${status ? ` ${status}` : ""}`,
			);
		}
	}
	if (!any) lines.push("No matching entries.");
	return lines.join("\n");
}

export function statusDot(state: AgentState): "🟢" | "🟡" | "⚫" {
	if (!state.enabled) return "⚫";
	return state.running ? "🟢" : "🟡";
}

/** Format a duration in ms as `3m`, `2h 5m`, `1d`. */
export function fmtDuration(ms: number): string {
	if (ms < 0) ms = 0;
	const min = Math.floor(ms / 60_000);
	const days = Math.floor(min / 1440);
	const hours = Math.floor((min % 1440) / 60);
	const mins = min % 60;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${mins}m`;
	return `${mins}m`;
}

/** Next-run schedule for cycle, TP/SL and OOR checks, all wall-clock aligned. */
export function formatSchedule(
	state: AgentState,
	cfg: ResolvedAgentConfig,
	nowMs: number,
): string[] {
	if (state.running) return ["🟢 running now — schedule after this cycle"];
	const cycleMs = Math.max(cfg.txCooldownMs, 60_000);
	const next = {
		Cycle: delayToNextBoundary(cycleMs, nowMs),
		"TP/SL": delayToNextBoundary(60_000, nowMs),
		OOR: delayToNextBoundary(cfg.intervalMinutes * 60_000, nowMs),
	};
	return Object.entries(next).map(
		([label, ms]) =>
			`⏰ next ${label} check ${escapeMarkdown(fmtDuration(ms))}`,
	);
}

/** Ten-cell budget bar: `██████░░░░ 60%` (percent escaped). */
export function formatBudgetBar(deployed: number, max: number): string {
	const pct =
		max > 0 ? Math.min(100, Math.max(0, (deployed / max) * 100)) : 100;
	const filled = Math.round((pct / 100) * 10);
	return `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${escapeMarkdown(`${Math.round(pct)}%`)}`;
}

export function formatDashboardHeader(
	state: AgentState,
	cfg: ResolvedAgentConfig,
	deployed: number,
	stats: TradeStats | null,
): string {
	const dot = statusDot(state);
	const neverRan = !state.enabled && state.cycle === 0 && !state.lastCycleAt;
	const statusWord = state.running
		? "Online"
		: state.enabled
			? "Idle"
			: "Stopped";
	const lastTime = tgTs(state.lastCycleAt).split(" ").pop() ?? "\\-";
	const headline = neverRan
		? "idle"
		: `${escapeMarkdown(statusWord)} · cycle ${escapeMarkdown(
				String(state.cycle).padStart(2, "0"),
			)} · run last ${escapeMarkdown(lastTime)}`;
	const winLine =
		stats && stats.closes > 0
			? `win ${escapeMarkdown(`${Math.round(stats.winRate ?? 0)}%`)} \\(${escapeMarkdown(String(stats.closes))}\\) \\| avg ${escapeMarkdown(`${(stats.avgPnlPct ?? 0).toFixed(2)}%`)}`
			: "no closed trades yet";
	return [
		tgBold("🤖 VEXIS DLMM Agent"),
		`${dot} ${headline}`,
		`Budget: ${formatBudgetBar(deployed, cfg.maxTotalSol)}`,
		`Deployed ${tgUsd(deployed)} \\| max ${tgUsd(cfg.maxTotalSol)}`,
		winLine,
	].join("\n");
}

/** 20-cell range bar: filled `▰` up to the price tick, `▱` after. */
export function formatRangeBar(
	price: number,
	min: number,
	max: number,
): string {
	if (min >= max) return "range unavailable";
	const width = 20;
	const clamp = Math.min(1, Math.max(0, (price - min) / (max - min)));
	const tick = Math.round(clamp * width);
	const cells = `${"▰".repeat(tick)}${"▱".repeat(width - tick)}`;
	const label = price < min ? "below" : price > max ? "above" : "in-range";
	return `${cells} ${escapeMarkdown(label)}`;
}

export interface PositionCard {
	tokenX: string;
	tokenY: string;
	poolAddress: string;
	positionAddress: string;
	amountSol: number | null;
	pnlPct: number | null;
	isOutOfRange: boolean | null;
	price: number | null;
	minPrice: number | null;
	maxPrice: number | null;
	feeSol: number | null;
}

export function formatPositionCard(o: PositionCard): string {
	const rangeOk = o.price != null && o.minPrice != null && o.maxPrice != null;
	const range = rangeOk
		? formatRangeBar(o.price!, o.minPrice!, o.maxPrice!)
		: escapeMarkdown("range n/a");
	const pnl =
		o.pnlPct == null
			? tgBold("PnL n/a")
			: `PnL ${tgPct(o.pnlPct)}${
					o.amountSol != null
						? ` \\(${escapeMarkdown(`+${((o.amountSol * o.pnlPct) / 100).toFixed(3)} ◎`)}\\)`
						: ""
				}`;
	const marker = o.isOutOfRange ? "▼" : "▲";
	const lines = [
		tgBold(`${escapeMarkdown(o.tokenX)}/${escapeMarkdown(o.tokenY)}`) +
			(o.isOutOfRange ? escapeMarkdown(" ⚠️ OOR") : ""),
		tgPoolAddr(o.poolAddress),
		"",
		pnl,
	];
	if (o.amountSol != null) {
		lines.push(`Amount: ${tgSol(o.amountSol)}`);
	}
	lines.push(`Range: ${range}`);
	if (rangeOk && o.price! < o.minPrice!) {
		lines.push(`${escapeMarkdown("▼ below range")}`);
	} else if (rangeOk && o.price! > o.maxPrice!) {
		lines.push(`${escapeMarkdown("▲ above range")}`);
	} else if (rangeOk) {
		lines.push(
			`${escapeMarkdown(marker)} in range · fees ${tgUsd(o.feeSol ?? 0)} unclaimed`,
		);
	}
	return lines.join("\n");
}

export function formatConfigQuick(cfg: ResolvedAgentConfig): string {
	return [
		tgBold("⚙️ DLMM Agent Config"),
		`Budget max ${escapeMarkdown(`${cfg.maxTotalSol} ◎`)} \\| slot ${escapeMarkdown(`${cfg.maxSolPerPosition} ◎`)}`,
		`TP ${escapeMarkdown(`${cfg.tpPct}%`)} \\| SL ${escapeMarkdown(`${cfg.slPct}%`)}`,
		`Max open ${escapeMarkdown(String(cfg.maxOpenPositions))} \\| candidates ${escapeMarkdown(String(cfg.maxCandidates))}`,
		`Notif level ${escapeMarkdown(cfg.notifLevel)}`,
		`Guardrails ${escapeMarkdown(cfg.risks.enabled === false ? "off" : "on")}`,
	].join("\n");
}
