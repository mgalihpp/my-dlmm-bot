import { Effect } from "effect";
import {
	type AgentJournalEntry,
	type JournalCandidate,
	readJournalAll,
} from "../../telegram/agent/journal.js";
import { type AgentState, loadState } from "../../telegram/agent/state.js";
import { barChart, CHART_COLORS } from "../charts.js";
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
	readonly tp: number;
	readonly sl: number;
	readonly closes: number;
	readonly failed: number;
	readonly successRate: number;
}

export function agentStats(entries: readonly AgentJournalEntry[]): AgentStats {
	let opens = 0;
	let holds = 0;
	let blocked = 0;
	let tp = 0;
	let sl = 0;
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
					tp += 1;
					break;
				case "sl":
					sl += 1;
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
		tp,
		sl,
		closes,
		failed,
		successRate: decisions > 0 ? Math.round((opens / decisions) * 100) : 0,
	};
}

export const JOURNAL_FILTERS = [
	"all",
	"open",
	"hold",
	"tp",
	"sl",
	"close",
	"blocked",
] as const;

export type JournalFilter = (typeof JOURNAL_FILTERS)[number];

export function parseJournalFilter(
	raw: string | null | undefined,
): JournalFilter {
	return raw !== null &&
		raw !== undefined &&
		(JOURNAL_FILTERS as readonly string[]).includes(raw)
		? (raw as JournalFilter)
		: "all";
}

export const JOURNAL_PAGE_SIZE = 20;

export interface JournalRow {
	readonly cycle: number;
	readonly ts: string;
	readonly candidate: JournalCandidate | null;
}

export function journalRows(
	journal: readonly AgentJournalEntry[],
	filter: JournalFilter,
): JournalRow[] {
	const rows: JournalRow[] = [];
	for (const entry of journal) {
		if (entry.candidates.length === 0) {
			if (filter === "all")
				rows.push({ cycle: entry.cycle, ts: entry.ts, candidate: null });
			continue;
		}
		for (const candidate of entry.candidates) {
			const matches =
				filter === "all" ||
				(filter === "blocked"
					? candidate.guardrail === "blocked"
					: candidate.action === filter);
			if (matches) rows.push({ cycle: entry.cycle, ts: entry.ts, candidate });
		}
	}
	rows.reverse();
	return rows;
}

export function paginate<T>(
	rows: readonly T[],
	page: number,
	pageSize: number,
): { rows: readonly T[]; total: number; page: number; pages: number } {
	const total = rows.length;
	const pages = Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.min(Math.max(1, page), pages);
	return {
		rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
		total,
		page: safePage,
		pages,
	};
}

function actionBadge(candidate: JournalCandidate): string {
	let kind: BadgeKind = "neutral";
	if (candidate.action === "open") kind = "ok";
	if (candidate.action === "hold") kind = "warn";
	if (candidate.action === "tp") kind = "neutral";
	if (candidate.action === "sl") kind = "danger";
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

export interface AgentViewOptions {
	readonly action: JournalFilter;
	readonly page: number;
}

export function renderAgent(
	journal: readonly AgentJournalEntry[],
	state: AgentState | null,
	opts: AgentViewOptions,
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
		summaryCard("TP", String(stats.tp), `${stats.failed} failed executions`),
		summaryCard("SL", String(stats.sl), "stop-loss hits"),
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

	const rows = journalRows(journal, opts.action);
	const paged = paginate(rows, opts.page, JOURNAL_PAGE_SIZE);

	return `<section>
<div class="section-kicker">AUTOMATION JOURNAL // CYCLE ${state?.cycle ?? 0}</div>
<h1>Agent Log ${status}</h1>
<div class="cards">${cards}</div>
${trend}
${cycleChart(journal)}
<h2>Decision Journal <span class="sub">// ${rows.length} entries</span></h2>
${journalFilterForm(opts.action)}
${journal.length === 0 ? `<div class="empty">No journal entries</div>` : renderJournalTable(paged.rows)}
${paginationLinks(opts.action, paged)}
</section>`;
}

function cycleChart(journal: readonly AgentJournalEntry[]): string {
	const recent = journal.slice(-12);
	if (recent.length === 0) return "";
	const count = (action: "open" | "tp" | "sl" | "close") =>
		recent.map(
			(entry) =>
				entry.candidates.filter(
					(candidate) =>
						candidate.action === action && candidate.execution === "ok",
				).length,
		);
	return `<div class="sub">DECISIONS / CYCLE // LAST ${recent.length}</div>${barChart(
		recent.map((entry) => `#${entry.cycle}`),
		[
			{ name: "open", color: CHART_COLORS.acid, values: count("open") },
			{ name: "tp", color: CHART_COLORS.gold, values: count("tp") },
			{ name: "sl", color: CHART_COLORS.coral, values: count("sl") },
			{ name: "close", color: CHART_COLORS.blue, values: count("close") },
		],
	)}`;
}

function journalFilterForm(action: JournalFilter): string {
	const options = JOURNAL_FILTERS.map(
		(item) =>
			`<option value="${item}"${item === action ? " selected" : ""}>${item}</option>`,
	).join("\n");
	return `<form class="filter" method="get" action="/agent">
<label for="action">Action</label>
<select id="action" name="action">${options}</select>
<button type="submit">Filter</button>
</form>`;
}

function paginationLinks(
	action: JournalFilter,
	paged: {
		total: number;
		page: number;
		pages: number;
		rows: readonly JournalRow[];
	},
): string {
	if (paged.total === 0) return "";
	const from = (paged.page - 1) * JOURNAL_PAGE_SIZE + 1;
	const to = from + paged.rows.length - 1;
	const query = action === "all" ? "" : `&action=${action}`;
	const prev =
		paged.page > 1
			? `<a href="/agent?page=${paged.page - 1}${query}">‹ prev</a>`
			: `<a class="disabled">‹ prev</a>`;
	const next =
		paged.page < paged.pages
			? `<a href="/agent?page=${paged.page + 1}${query}">next ›</a>`
			: `<a class="disabled">next ›</a>`;
	return `<div class="pagination">${prev}<span>showing ${from}–${to} of ${paged.total}</span>${next}</div>`;
}

function renderJournalTable(rows: readonly JournalRow[]): string {
	const body = rows
		.map((row) => {
			if (row.candidate === null) {
				return `<tr><td class="mono">#${row.cycle}</td><td class="mono">${escapeHtml(tsLocal(row.ts))}</td><td colspan="4">no candidates</td></tr>`;
			}
			const reason = row.candidate.blockedReason
				? `<div class="sub">${escapeHtml(row.candidate.blockedReason)}</div>`
				: "";
			return `<tr>
<td class="mono">#${row.cycle}</td>
<td class="mono">${escapeHtml(tsLocal(row.ts))}</td>
<td>${escapeHtml(row.candidate.poolName || row.candidate.pool)}</td>
<td>${actionBadge(row.candidate)}</td>
<td>${guardrailBadge(row.candidate)}${reason}</td>
<td>${executionText(row.candidate)}</td>
</tr>`;
		})
		.join("\n");
	return table(
		["Cycle", "Time", "Pool", "Action", "Guardrail", "Execution"],
		[body],
	);
}

export const agentContent = (opts?: {
	readonly action?: string | null;
	readonly page?: number;
}): Effect.Effect<string, never> =>
	Effect.sync(() => {
		try {
			return renderAgent(readJournalAll(), loadState(), {
				action: parseJournalFilter(opts?.action),
				page: opts?.page ?? 1,
			});
		} catch (error) {
			return errorBanner(
				error instanceof Error ? error.message : String(error),
			);
		}
	});
