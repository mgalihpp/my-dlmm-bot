import {
	type AgentJournalEntry,
	type JournalCandidate,
	readJournalAll,
} from "../../telegram/agent/journal.js";
import {
	type AgentState,
	type LlmStatus,
	loadState,
} from "../../telegram/agent/state.js";
import type { NarrativeResult } from "../agent-narrative.js";
import { narrativeSnapshot } from "../agent-narrative.js";
import { barChart, CHART_COLORS } from "../charts.js";
import { errorBanner, escapeHtml } from "../layout.js";
import {
	type BadgeKind,
	badge,
	solscanUrl,
	statsGrid,
	summaryCard,
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
	readonly llmStatus: LlmStatus;
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
				rows.push({
					cycle: entry.cycle,
					ts: entry.ts,
					llmStatus: entry.llmStatus,
					candidate: null,
				});
			continue;
		}
		for (const candidate of entry.candidates) {
			const matches =
				filter === "all" ||
				(filter === "blocked"
					? candidate.guardrail === "blocked"
					: candidate.action === filter);
			if (matches)
				rows.push({
					cycle: entry.cycle,
					ts: entry.ts,
					llmStatus: entry.llmStatus,
					candidate,
				});
		}
	}
	rows.reverse();
	return rows;
}

export interface TimelineGroup {
	readonly cycle: number;
	readonly ts: string;
	readonly llmStatus: LlmStatus;
	readonly rows: readonly JournalRow[];
}

export function timelineGroups(rows: readonly JournalRow[]): TimelineGroup[] {
	const groups: TimelineGroup[] = [];
	for (const row of rows) {
		const last = groups[groups.length - 1];
		if (last !== undefined && last.cycle === row.cycle) {
			groups[groups.length - 1] = {
				...last,
				rows: [...last.rows, row],
			};
		} else {
			groups.push({
				cycle: row.cycle,
				ts: row.ts,
				llmStatus: row.llmStatus,
				rows: [row],
			});
		}
	}
	return groups;
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
	if (candidate.action === "open") kind = "pass";
	if (candidate.action === "hold") kind = "hold";
	if (candidate.action === "tp") kind = "pass";
	if (candidate.action === "sl") kind = "blocked";
	if (candidate.action === "close") kind = "blocked";
	return badge(candidate.action, kind);
}

function guardrailBadge(candidate: JournalCandidate): string {
	return candidate.guardrail === "blocked"
		? badge("blocked", "blocked")
		: badge("pass", "pass");
}

function executionText(candidate: JournalCandidate): string {
	if (candidate.execution === "failed") return badge("failed", "blocked");
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
	narrative: NarrativeResult | null = null,
): string {
	const stats = agentStats(journal);
	const lastActivity = state?.lastCycleAt ?? journal.at(-1)?.ts ?? null;
	const status = state?.running ? "Agent is running" : "Agent is stopped";
	const cards = [
		summaryCard("Cycles", String(stats.cycles), `cycle ${state?.cycle ?? 0}`),
		summaryCard(
			"Opens",
			String(stats.opens),
			`${stats.successRate}% of decisions`,
		),
		summaryCard("Blocked", String(stats.blocked), "guardrail prevented"),
		summaryCard("Success rate", `${stats.successRate}%`, "open decision rate"),
		summaryCard("Take profit", String(stats.tp), "target hit"),
		summaryCard("Stop loss", String(stats.sl), "risk cut"),
	];

	const rows = journalRows(journal, opts.action);
	const paged = paginate(rows, opts.page, JOURNAL_PAGE_SIZE);

	return `<section>
${sectionHead(
	`AUTOMATION JOURNAL / CYCLE ${state?.cycle ?? 0}`,
	`${rows.length} entries / filter ${opts.action}`,
)}
<div class="agent-banner"><div class="agent-status"><span class="pulse ${state?.running ? "active" : ""}"></span><div><span class="eyebrow">AUTOMATION ENGINE</span><h2>${status}</h2><p class="muted">${lastActivity ? `Last cycle completed ${tsLocal(lastActivity)}` : "No cycles recorded yet"}</p></div></div><span class="badge ${state?.running ? "pass" : "neutral"}">${state?.running ? "LIVE" : "STOPPED"}</span></div>
${statsGrid(cards, "agent-stats")}
<div class="grid-two">${briefingPanel(stats, journal, narrative)}${cycleChart(journal)}</div>
<h2>Decision Journal <span class="sub">// ${rows.length} entries</span></h2>
${journalFilterForm(opts.action)}
${journal.length === 0 ? `<div class="empty">No journal entries</div>` : renderJournalTimeline(timelineGroups(paged.rows))}
${paginationLinks(opts.action, paged)}
</section>`;
}

function sectionHead(kicker: string, sub: string): string {
	return `<div class="section-head"><div><p class="kicker">${escapeHtml(kicker)}</p><p class="muted">${escapeHtml(sub)}</p></div></div>`;
}

function briefingPanel(
	stats: AgentStats,
	journal: readonly AgentJournalEntry[],
	narrative: NarrativeResult | null,
): string {
	const empty = journal.length === 0;
	const copy =
		narrative !== null
			? narrative.text
			: empty
				? "No decision cycles have been recorded yet."
				: `${stats.opens} open decisions across ${stats.cycles} cycles. ${stats.blocked} candidates were stopped by guardrails before execution.`;
	const sourceBadge =
		narrative === null
			? ""
			: narrative.source === "llm"
				? badge("GENERATED", "pass")
				: badge("FALLBACK", "neutral");
	return `<div id="agent-narrative" class="panel" hx-get="/partials/agent/narrative" hx-trigger="load" hx-swap="outerHTML"><div class="panel-head"><div><span class="eyebrow">LATEST RUN</span><b>Decision context</b></div>${badge(journal.length > 0 ? "DATA READY" : "NO DATA", journal.length > 0 ? "pass" : "neutral")}</div><p class="briefing">${escapeHtml(copy)}</p><div class="briefing-tags">${sourceBadge}${badge(`${stats.blocked} BLOCKED`, stats.blocked > 0 ? "review" : "neutral")}<span class="muted small">Read-only journal analysis</span></div></div>`;
}

/** Panel fragment served by /partials/agent/narrative after the LLM completes. */
export function renderAgentNarrativePanel(
	journal: readonly AgentJournalEntry[],
	narrative: NarrativeResult,
): string {
	return briefingPanel(agentStats(journal), journal, narrative);
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
	return `<div class="panel"><div class="panel-head"><div><span class="eyebrow">DECISIONS / CYCLE</span><b>Last ${recent.length} cycles</b></div><span class="muted small">Successful executions</span></div>${barChart(
		recent.map((entry) => `#${entry.cycle}`),
		[
			{ name: "open", color: CHART_COLORS.profit, values: count("open") },
			{ name: "tp", color: CHART_COLORS.gold, values: count("tp") },
			{ name: "sl", color: CHART_COLORS.loss, values: count("sl") },
			{ name: "close", color: CHART_COLORS.blue, values: count("close") },
		],
	)}</div>`;
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

function renderJournalTimeline(groups: readonly TimelineGroup[]): string {
	return `<div class="timeline">${groups
		.map((group) => {
			const llmMarker =
				group.llmStatus === "failed" ? badge("LLM FAILED", "blocked") : "";
			const body = group.rows
				.map((row) =>
					row.candidate === null
						? `<div class="timeline-empty">no candidates</div>`
						: renderTimelineEntry(row),
				)
				.join("\n");
			return `<div class="timeline-cycle"><div class="timeline-head"><span class="mono">#${group.cycle}</span>${llmMarker}<span class="muted small">${escapeHtml(tsLocal(group.ts))}</span></div>${body}</div>`;
		})
		.join("\n")}</div>`;
}

function renderTimelineEntry(row: JournalRow): string {
	const candidate = row.candidate;
	if (candidate === null) return "";
	const rationale = candidate.rationale
		? `<p class="timeline-rationale">${escapeHtml(candidate.rationale)}</p>`
		: "";
	const reason = candidate.blockedReason
		? `<div class="sub">${escapeHtml(candidate.blockedReason)}</div>`
		: "";
	return `<div class="timeline-entry"><div class="timeline-entry-head"><span class="timeline-pool">${escapeHtml(candidate.poolName || candidate.pool)}</span>${actionBadge(candidate)}${guardrailBadge(candidate)}${executionText(candidate)}</div>${rationale}${reason}</div>`;
}

export const agentContent = (opts?: {
	readonly action?: string | null;
	readonly page?: number;
	readonly narrativeFile?: string;
}): string => {
	try {
		const journal = readJournalAll();
		const state = loadState();
		const narrative = narrativeSnapshot(
			journal,
			Date.now(),
			opts?.narrativeFile,
		);
		return renderAgent(
			journal,
			state,
			{
				action: parseJournalFilter(opts?.action),
				page: opts?.page ?? 1,
			},
			narrative,
		);
	} catch (error) {
		return errorBanner(error instanceof Error ? error.message : String(error));
	}
};
