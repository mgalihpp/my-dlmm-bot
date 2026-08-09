import type { ResolvedAgentConfig } from "../../services/Config.js";
import {
	escapeMarkdown,
	tgBold,
	tgCode,
	tgPct,
	tgPoolAddr,
	tgTs,
	tgUsd,
} from "../format.js";
import type { AgentJournalEntry, JournalCandidate } from "./journal.js";
import type { AgentState } from "./state.js";
import type { ActionCounts, TradeStats } from "./stats.js";

export function formatStatus(
	state: AgentState,
	cfg: ResolvedAgentConfig,
	stats: TradeStats | null = null,
): string {
	const opened = state.plans.filter((p) => p.positionAddress != null).length;
	const lines = [
		tgBold(state.enabled ? "🤖 DLMM Agent: ON" : "🤖 DLMM Agent: OFF"),
		`Running: ${state.running ? "yes" : "no"}`,
		`Cycle: ${state.cycle} \\| last: ${tgTs(state.lastCycleAt)}`,
		`LLM status: ${escapeMarkdown(state.llmStatus)}`,
		`Caps: ${escapeMarkdown(`${opened}/${cfg.maxOpenPositions}`)} open`,
		`${escapeMarkdown(`Per-position cap: ${cfg.maxSolPerPosition} SOL`)} \\| total cap: ${escapeMarkdown(String(cfg.maxTotalSol))} SOL`,
		`TP ${escapeMarkdown(String(cfg.tpPct))}% / SL ${escapeMarkdown(String(cfg.slPct))}%`,
		`Notif: ${escapeMarkdown(cfg.notifLevel)}`,
		...(state.cooldowns.length > 0
			? [
					`Cooldowns: ${escapeMarkdown(String(state.cooldowns.length))}`,
					...state.cooldowns
						.slice(0, 3)
						.map(
							(c) =>
								`  • ${escapeMarkdown(c.poolName)} \\(${escapeMarkdown(c.reason)}\\)`,
						),
				]
			: []),
		...(stats && stats.closes > 0
			? [
					`Trades: ${escapeMarkdown(`${stats.closes} closed`)} \\| win ${escapeMarkdown(`${Math.round(stats.winRate ?? 0)}%`)} \\| avg ${escapeMarkdown(`${(stats.avgPnlPct ?? 0).toFixed(2)}%`)}`,
				]
			: []),
		"",
		tgBold("DLMM Agent plans"),
		...state.plans.map(
			(p) =>
				`• ${escapeMarkdown(p.poolName)} ${tgCode(p.pool)} — ${escapeMarkdown(String(p.amountSol))} SOL${p.openedAt ? " ✅" : " ⏳"}`,
		),
	].join("\n");
	return lines;
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

export function formatCycleSummary(
	entries: readonly AgentJournalEntry[],
	degraded: boolean,
): string {
	const last = entries[0];
	if (!last) return "🤖 No DLMM Agent cycle has run yet.";
	const lines = [tgBold(`🤖 DLMM Agent cycle #${last.cycle}`)];
	if (degraded) lines.push("⚠️ LLM degraded — heuristic only");
	for (const c of last.candidates) {
		const sign = c.favorability == null ? "—" : c.favorability.toFixed(2);
		const action = c.action.toUpperCase();
		const executed =
			c.execution === "ok"
				? ` ${escapeMarkdown("[")}${tgCode(c.txSignature ?? "")}${escapeMarkdown("]")}`
				: c.execution === "failed"
					? " ❌FAILED"
					: c.guardrail === "blocked"
						? ` ⛔blocked: ${escapeMarkdown(c.blockedReason ?? "")}`
						: "";
		lines.push(
			`${action} ${escapeMarkdown(c.poolName)} score ${escapeMarkdown(String(c.score))} fav ${escapeMarkdown(sign)}${executed}`,
		);
	}
	return lines.join("\n");
}

/** Live in-cycle status — header + phase lines, edited in place as the cycle runs. */
export function formatLive(cycle: number, lines: readonly string[]): string {
	return [
		tgBold(`🤖 DLMM Agent cycle #${cycle}`),
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
		tgBold(
			`📒 DLMM Agent journal (page ${page + 1}/${totalPages} · ${opts.filter})`,
		),
		`opens ${escapeMarkdown(String(counts.open))} \\| closes ${escapeMarkdown(String(counts.tp + counts.sl + counts.close))} \\| blocked ${escapeMarkdown(String(counts.blocked))}`,
	];
	let any = false;
	for (const e of slice) {
		const cands = e.candidates.filter((c) => journalMatches(c, opts.filter));
		if (cands.length === 0) continue;
		any = true;
		lines.push(`• \\#${e.cycle} ${tgTs(e.ts)}`);
		for (const c of cands) {
			const status =
				c.guardrail === "blocked"
					? `⛔ ${escapeMarkdown(c.blockedReason ?? "")}`
					: c.execution === "ok"
						? `✅ ${tgCode(c.txSignature ?? "")}`
						: c.execution === "failed"
							? "❌ FAILED"
							: "";
			lines.push(
				`  ${escapeMarkdown(c.action.toUpperCase())} ${escapeMarkdown(c.poolName)} ${status}`,
			);
		}
	}
	if (!any) lines.push("No matching entries.");
	return lines.join("\n");
}

export function formatJournal(
	entries: readonly AgentJournalEntry[],
	n: number,
): string {
	const lines = [tgBold(`📒 DLMM Agent journal (last ${n})`)];
	for (const e of entries.slice(0, n)) {
		const opened = e.candidates.filter((c) => c.execution === "ok").length;
		const blocked = e.candidates.filter(
			(c) => c.guardrail === "blocked",
		).length;
		lines.push(
			`• \\#${e.cycle} ${tgTs(e.ts)} ${escapeMarkdown(`llm=${e.llmStatus} opened=${opened} blocked=${blocked}`)}`,
		);
	}
	return lines.join("\n");
}

export function statusDot(state: AgentState): "🟢" | "🟡" | "⚫" {
	if (!state.enabled) return "⚫";
	return state.running ? "🟢" : "🟡";
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
	const headline = neverRan
		? "idle"
		: state.running
			? `cycle ${state.cycle} \\| ${tgTs(state.lastCycleAt)}`
			: `last cycle ${state.cycle} @ ${tgTs(state.lastCycleAt)}`;
	const winLine =
		stats && stats.closes > 0
			? `win ${escapeMarkdown(`${Math.round(stats.winRate ?? 0)}%`)} \\| avg ${escapeMarkdown(`${(stats.avgPnlPct ?? 0).toFixed(2)}%`)}`
			: "no closed trades yet";
	return [
		tgBold("🤖 VEXIS DLMM Agent"),
		`${dot} ${escapeMarkdown(headline)}`,
		`Budget: ${formatBudgetBar(deployed, cfg.maxTotalSol)}`,
		`Deployed ${tgUsd(deployed)} \\| max ${tgUsd(cfg.maxTotalSol)}`,
		winLine,
	].join("\n");
}

/** 10-cell range bar with a ▸ marker at the price's position. */
export function formatRangeBar(
	price: number,
	min: number,
	max: number,
): string {
	if (min >= max) return "range unavailable";
	const width = 10;
	const clamp = Math.min(1, Math.max(0, (price - min) / (max - min)));
	const tick = Math.round(clamp * (width - 1));
	const cells = Array.from({ length: width }, (_, i) =>
		i === tick ? "▸" : "▬",
	);
	const label = price < min ? "below" : price > max ? "above" : "in-range";
	return `${cells.join("")} ${escapeMarkdown(label)}`;
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
	const range =
		o.price != null && o.minPrice != null && o.maxPrice != null
			? formatRangeBar(o.price, o.minPrice, o.maxPrice)
			: escapeMarkdown("range n/a");
	const pnl = o.pnlPct == null ? tgBold("PnL n/a") : `PnL ${tgPct(o.pnlPct)}`;
	const lines = [
		tgBold(`${escapeMarkdown(o.tokenX)}/${escapeMarkdown(o.tokenY)}`) +
			(o.isOutOfRange ? escapeMarkdown(" ⚠️ OOR") : ""),
		tgPoolAddr(o.poolAddress),
		`Position: ${escapeMarkdown(o.positionAddress)}`,
		"",
		pnl,
	];
	if (o.amountSol != null) {
		lines.push(`Amount: ${escapeMarkdown(`${o.amountSol} SOL`)}`);
	}
	lines.push(`Range: ${range}`);
	if (o.feeSol != null) {
		lines.push(`Unclaimed fees: ${tgUsd(o.feeSol)}`);
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
