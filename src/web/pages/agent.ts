import { Effect } from "effect";
import {
	type AgentJournalEntry,
	type JournalCandidate,
	readJournalAll,
} from "../../telegram/agent/journal.js";
import { type AgentState, loadState } from "../../telegram/agent/state.js";
import { errorBanner, escapeHtml } from "../layout.js";
import {
	type BadgeKind,
	badge,
	solscanUrl,
	sparkline,
	summaryCard,
	table,
	tsLocal,
} from "../templates.js";

export interface AgentStats {
	readonly cycles: number;
	readonly opens: number;
	readonly holds: number;
	readonly blocked: number;
	readonly tpSl: number;
	readonly closes: number;
	readonly failed: number;
	readonly successRate: number;
}

export function agentStats(entries: readonly AgentJournalEntry[]): AgentStats {
	let opens = 0;
	let holds = 0;
	let blocked = 0;
	let tpSl = 0;
	let closes = 0;
	let failed = 0;

	for (const entry of entries) {
		for (const candidate of entry.candidates) {
			switch (candidate.action) {
				case "open":
					opens += 1;
					break;
				case "hold":
					holds += 1;
					break;
				case "tp":
				case "sl":
					tpSl += 1;
					break;
				case "close":
					closes += 1;
					break;
			}
			if (candidate.guardrail === "blocked") blocked += 1;
			if (candidate.execution === "failed") failed += 1;
		}
	}

	const decisions = opens + holds;
	return {
		cycles: entries.length,
		opens,
		holds,
		blocked,
		tpSl,
		closes,
		failed,
		successRate: decisions > 0 ? Math.round((opens / decisions) * 100) : 0,
	};
}

function actionBadge(candidate: JournalCandidate): string {
	let kind: BadgeKind = "neutral";
	if (candidate.action === "open") kind = "ok";
	if (candidate.action === "hold") kind = "warn";
	if (candidate.action === "tp" || candidate.action === "sl") kind = "danger";
	return badge(candidate.action, kind);
}

function guardrailBadge(candidate: JournalCandidate): string {
	return candidate.guardrail === "blocked"
		? badge("blocked", "danger")
		: badge("pass", "ok");
}

function executionText(candidate: JournalCandidate): string {
	if (candidate.execution === "failed") return badge("failed", "danger");
	if (candidate.execution === "ok" && candidate.txSignature) {
		const signature = candidate.txSignature;
		return `<a href="${escapeHtml(solscanUrl(signature))}" target="_blank" rel="noopener" class="mono">${escapeHtml(signature.slice(0, 12))}...</a>`;
	}
	return "-";
}

export function renderAgent(
	journal: readonly AgentJournalEntry[],
	state: AgentState | null,
): string {
	const stats = agentStats(journal);
	const status = state?.running
		? badge("running", "ok")
		: badge("stopped", "neutral");
	const cards = [
		summaryCard("Cycles", String(stats.cycles), `cycle ${state?.cycle ?? 0}`),
		summaryCard(
			"Opens",
			String(stats.opens),
			`${stats.successRate}% decision rate`,
		),
		summaryCard(
			"Holds",
			String(stats.holds),
			`${stats.blocked} guardrail blocks`,
		),
		summaryCard(
			"TP / SL",
			String(stats.tpSl),
			`${stats.failed} failed executions`,
		),
	].join("\n");

	const opensPerCycle = journal.map(
		(entry) =>
			entry.candidates.filter(
				(candidate) =>
					candidate.action === "open" && candidate.execution === "ok",
			).length,
	);
	const trend =
		sparkline(opensPerCycle) === ""
			? ""
			: `<div class="sparkline-card"><div class="sub">SUCCESSFUL OPENS / CYCLE</div>${sparkline(opensPerCycle)}</div>`;

	return `<section>
<div class="section-kicker">AUTOMATION JOURNAL // CYCLE ${state?.cycle ?? 0}</div>
<h1>Agent Log ${status}</h1>
<div class="cards">${cards}</div>
${trend}
<h2>Decision Journal <span class="sub">// ${journal.length} cycles</span></h2>
${journal.length === 0 ? `<div class="empty">No journal entries</div>` : renderJournalTable(journal)}
</section>`;
}

function renderJournalTable(journal: readonly AgentJournalEntry[]): string {
	const rows: string[] = [];
	for (const entry of journal) {
		if (entry.candidates.length === 0) {
			rows.push(
				`<tr><td>#${entry.cycle}</td><td>${escapeHtml(tsLocal(entry.ts))}</td><td colspan="4">no candidates</td></tr>`,
			);
			continue;
		}

		for (const candidate of entry.candidates) {
			const reason = candidate.blockedReason
				? `<div class="sub">${escapeHtml(candidate.blockedReason)}</div>`
				: "";
			rows.push(`<tr>
<td class="mono">#${entry.cycle}</td>
<td class="mono">${escapeHtml(tsLocal(entry.ts))}</td>
<td>${escapeHtml(candidate.poolName || candidate.pool)}</td>
<td>${actionBadge(candidate)}</td>
<td>${guardrailBadge(candidate)}${reason}</td>
<td>${executionText(candidate)}</td>
</tr>`);
		}
	}

	return table(
		["Cycle", "Time", "Pool", "Action", "Guardrail", "Execution"],
		rows,
	);
}

export const agentContent: Effect.Effect<string, never> = Effect.sync(() => {
	try {
		return renderAgent(readJournalAll(), loadState());
	} catch (error) {
		return errorBanner(error instanceof Error ? error.message : String(error));
	}
});
