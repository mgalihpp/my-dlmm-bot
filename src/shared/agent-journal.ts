import type {
	AgentJournalEntry,
	JournalCandidate,
} from "../telegram/agent/journal.js";
import type { LlmStatus } from "../telegram/agent/state.js";

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

export interface BlockedReasonGroup {
	readonly reason: string;
	readonly count: number;
}

export interface BlockedBreakdown {
	readonly groups: readonly BlockedReasonGroup[];
	readonly others: number;
	readonly total: number;
}

/** Collapse free-form blocked reasons into stable buckets by masking numbers, timestamps, and trailing detail. */
export function normalizeBlockedReason(reason: string): string {
	const normalized = reason
		.replace(/\d{4}-\d{2}-\d{2}T[^\s)]*/g, "#")
		.replace(/\(.*\)$/, "")
		.replace(/-?\d[\d.,]*%?/g, "#")
		.replace(/\s+/g, " ")
		.trim();
	return normalized.length > 64 ? `${normalized.slice(0, 64)}…` : normalized;
}

export function blockedBreakdown(
	entries: readonly AgentJournalEntry[],
	topN = 5,
): BlockedBreakdown {
	const counts = new Map<string, number>();
	let total = 0;
	for (const entry of entries) {
		for (const candidate of entry.candidates) {
			if (candidate.guardrail !== "blocked") continue;
			total += 1;
			const key = normalizeBlockedReason(candidate.blockedReason ?? "unknown");
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	const sorted = [...counts.entries()]
		.map(([reason, count]) => ({ reason, count }))
		.sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1));
	return {
		groups: sorted.slice(0, topN),
		others: sorted.slice(topN).reduce((n, g) => n + g.count, 0),
		total,
	};
}

export interface ScoreBand {
	readonly label: string;
	readonly count: number;
}

export interface ScoreSummary {
	readonly scored: number;
	readonly avgOpen: number | null;
	readonly avgHold: number | null;
	readonly avgBlocked: number | null;
	readonly bands: readonly ScoreBand[];
}

const SCORE_BANDS: { label: string; min: number; max: number }[] = [
	{ label: "<50", min: Number.NEGATIVE_INFINITY, max: 49 },
	{ label: "50–69", min: 50, max: 69 },
	{ label: "70–84", min: 70, max: 84 },
	{ label: "85+", min: 85, max: Number.POSITIVE_INFINITY },
];

function avg(values: number[]): number | null {
	if (values.length === 0) return null;
	return Math.round(values.reduce((n, v) => n + v, 0) / values.length);
}

/** Heuristic score signal: average score per outcome plus distribution bands. Scores of 0 mean unscored and are skipped, matching the journal UI. */
export function scoreSummary(
	entries: readonly AgentJournalEntry[],
): ScoreSummary {
	const opens: number[] = [];
	const holds: number[] = [];
	const blocked: number[] = [];
	const bands = SCORE_BANDS.map((b) => ({ ...b, count: 0 }));
	let scored = 0;
	for (const entry of entries) {
		for (const candidate of entry.candidates) {
			const score = candidate.heuristicScore;
			if (!(score > 0)) continue;
			scored += 1;
			if (candidate.guardrail === "blocked") blocked.push(score);
			else if (candidate.action === "open") opens.push(score);
			else if (candidate.action === "hold") holds.push(score);
			const band = bands.find((b) => score >= b.min && score <= b.max);
			if (band) band.count += 1;
		}
	}
	return {
		scored,
		avgOpen: avg(opens),
		avgHold: avg(holds),
		avgBlocked: avg(blocked),
		bands: bands.map(({ label, count }) => ({ label, count })),
	};
}
