import {
	type AgentJournalEntry,
	type JournalCandidate,
} from "../../telegram/agent/journal.js";
import { type LlmStatus } from "../../telegram/agent/state.js";

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
