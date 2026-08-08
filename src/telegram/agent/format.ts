import type { ResolvedAgentConfig } from "../../services/Config.js";
import { escapeMarkdown, tgBold, tgCode, tgTs } from "../format.js";
import type { AgentJournalEntry } from "./journal.js";
import type { AgentState } from "./state.js";

export function formatStatus(
	state: AgentState,
	cfg: ResolvedAgentConfig,
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
		"",
		tgBold("Agent plans"),
		...state.plans.map(
			(p) =>
				`• ${escapeMarkdown(p.poolName)} ${tgCode(p.pool)} — ${escapeMarkdown(String(p.amountSol))} SOL${p.openedAt ? " ✅" : " ⏳"}`,
		),
	].join("\n");
	return lines;
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
