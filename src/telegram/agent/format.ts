import type { ResolvedAgentConfig } from "../../services/Config.js";
import { escapeMarkdown, tgBold, tgCode, tgPct, tgTs } from "../format.js";
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
		tgBold(state.enabled ? "🤖 Agent: ON" : "🤖 Agent: OFF"),
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
		tgBold("Agent plans"),
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
	return `${tgBold(`❌ Agent ${escapeMarkdown(scope)} failed`)}\n${escapeMarkdown(msg)}`;
}

export function formatCycleSummary(
	entries: readonly AgentJournalEntry[],
	degraded: boolean,
): string {
	const last = entries[0];
	if (!last) return "🤖 No agent cycle has run yet.";
	const lines = [tgBold(`🤖 Agent cycle #${last.cycle}`)];
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
		tgBold(`🤖 Agent cycle #${cycle}`),
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
	const lines = [tgBold(`📊 Agent portfolio (${rows.length})`)];
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
			`📒 Agent journal (page ${page + 1}/${totalPages} · ${opts.filter})`,
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
	const lines = [tgBold(`📒 Agent journal (last ${n})`)];
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
