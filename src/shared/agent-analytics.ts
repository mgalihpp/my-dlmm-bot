import type { AgentJournalEntry } from "../telegram/agent/journal.js";
import type {
	LlmStatus,
	PerfRecord,
	SignalName,
} from "../telegram/agent/signalWeights.js";
import { computeLift, SIGNAL_NAMES } from "../telegram/agent/signalWeights.js";

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";

const RANGES: readonly AnalyticsRange[] = ["7d", "30d", "90d", "all"];

export function parseRange(raw: string | null | undefined): AnalyticsRange {
	return raw !== null &&
		raw !== undefined &&
		(RANGES as readonly string[]).includes(raw)
		? (raw as AnalyticsRange)
		: "30d";
}

export interface OperationalPoint {
	readonly cycle: number;
	readonly ts: string;
	readonly date: string;
	readonly opens: number;
	readonly holds: number;
	readonly blocked: number;
	readonly failed: number;
	readonly tp: number;
	readonly sl: number;
	readonly closes: number;
	readonly llmStatus: LlmStatus;
	readonly successRate: number;
}

export interface OperationalDaily {
	readonly date: string;
	readonly cycles: number;
	readonly blockedRate: number;
	readonly llmFailRate: number;
	readonly execFailRate: number;
	readonly avgSuccessRate: number;
}

export interface FinancialBucket {
	readonly label: string;
	readonly date: string;
	readonly closes: number;
	readonly wins: number;
	readonly losses: number;
	readonly winRate: number | null;
	readonly avgPnl: number | null;
	readonly totalPnl: number | null;
	readonly best: number | null;
	readonly worst: number | null;
}

export interface CumulativePoint {
	readonly label: string;
	readonly date: string;
	readonly cumPnl: number;
}

export interface DistributionBucket {
	readonly bucket: string;
	readonly count: number;
}

export interface AnalyticsPayload {
	readonly operational: {
		readonly perCycle: readonly OperationalPoint[];
		readonly daily: readonly OperationalDaily[];
	};
	readonly financial: {
		readonly buckets: readonly FinancialBucket[];
		readonly cumulative: readonly CumulativePoint[];
		readonly distribution: readonly DistributionBucket[];
	};
	readonly signals: {
		readonly weights: Record<SignalName, number>;
		readonly lifts: readonly {
			signal: SignalName;
			lift: number;
			weight: number;
		}[];
		readonly perfCount: number;
		readonly minSamples: number;
	};
}

const DAY_MS = 86_400_000;
const MAX_CYCLES = 100;
const MIN_SAMPLES = 20;

function localDate(iso: string): string {
	try {
		return new Date(iso).toLocaleDateString("en-CA");
	} catch {
		return "1970-01-01";
	}
}

function getMonday(d: Date): Date {
	const day = d.getUTCDay();
	const diff = (day === 0 ? -6 : 1) - day;
	const m = new Date(d);
	m.setUTCDate(d.getUTCDate() + diff);
	m.setUTCHours(0, 0, 0, 0);
	return m;
}

function weekLabel(monday: Date): string {
	const month = monday.toLocaleString("en-US", { month: "short" });
	return `W${monday.toLocaleString("en-US", { week: "numeric" })} ${month}`;
}

export function operationalPerCycle(
	entries: readonly AgentJournalEntry[],
): OperationalPoint[] {
	const out: OperationalPoint[] = [];
	for (const e of entries) {
		let opens = 0;
		let holds = 0;
		let blocked = 0;
		let failed = 0;
		let tp = 0;
		let sl = 0;
		let closes = 0;
		for (const c of e.candidates) {
			if (c.guardrail === "blocked") blocked += 1;
			if (c.execution === "failed") failed += 1;
			switch (c.action) {
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
		}
		const decisions = opens + holds;
		const successRate =
			decisions > 0 ? Math.round((opens / decisions) * 100) : 0;
		out.push({
			cycle: e.cycle,
			ts: e.ts,
			date: localDate(e.ts),
			opens,
			holds,
			blocked,
			failed,
			tp,
			sl,
			closes,
			llmStatus: e.llmStatus,
			successRate,
		});
	}
	return out.slice(-MAX_CYCLES);
}

export function operationalDaily(
	perCycle: readonly OperationalPoint[],
): OperationalDaily[] {
	const map = new Map<string, OperationalPoint[]>();
	for (const p of perCycle) {
		const arr = map.get(p.date) ?? [];
		arr.push(p);
		map.set(p.date, arr);
	}
	return [...map.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, pts]) => ({
			date,
			cycles: pts.length,
			blockedRate: Math.round(
				(pts.filter((x) => x.blocked > 0).length / pts.length) * 100,
			),
			llmFailRate: Math.round(
				(pts.filter((x) => x.llmStatus === "failed").length / pts.length) * 100,
			),
			execFailRate: Math.round(
				(pts.filter((x) => x.failed > 0).length / pts.length) * 100,
			),
			avgSuccessRate: Math.round(
				pts.reduce((a, b) => a + b.successRate, 0) / pts.length,
			),
		}));
}

export function financialBuckets(
	perf: readonly PerfRecord[],
	range: AnalyticsRange,
): FinancialBucket[] {
	const sorted = [...perf].sort(
		(a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt),
	);
	const weekly = range === "90d" || range === "all";
	const buckets = new Map<string, PerfRecord[]>();
	for (const p of sorted) {
		const d = new Date(p.closedAt);
		const key = weekly ? getMonday(d).toISOString() : localDate(p.closedAt);
		const arr = buckets.get(key) ?? [];
		arr.push(p);
		buckets.set(key, arr);
	}
	return [...buckets.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, records]) => {
			const d = new Date(key);
			const pnls = records.map((r) => r.pnlPct);
			const wins = pnls.filter((p) => p > 0).length;
			const losses = pnls.filter((p) => p < 0).length;
			const total = pnls.reduce((a, b) => a + b, 0);
			return {
				label: weekly
					? weekLabel(getMonday(d))
					: localDate(records[0].closedAt),
				date: key,
				closes: pnls.length,
				wins,
				losses,
				winRate:
					pnls.length > 0 ? Math.round((wins / pnls.length) * 100) : null,
				avgPnl:
					pnls.length > 0
						? Math.round((total / pnls.length) * 100) / 100
						: null,
				totalPnl: pnls.length > 0 ? Math.round(total * 100) / 100 : null,
				best: pnls.length > 0 ? Math.max(...pnls) : null,
				worst: pnls.length > 0 ? Math.min(...pnls) : null,
			};
		});
}

export function cumulativePnl(
	buckets: readonly FinancialBucket[],
): CumulativePoint[] {
	let cum = 0;
	return buckets.map((b) => {
		cum += b.totalPnl ?? 0;
		return {
			label: b.label,
			date: b.date,
			cumPnl: Math.round(cum * 100) / 100,
		};
	});
}

const DISTRIBUTION_BUCKETS = [
	"<-10",
	"-10_-5",
	"-5_-2",
	"-2_0",
	"0_2",
	"2_5",
	"5_10",
	">10",
] as const;

export function pnlDistribution(
	perf: readonly PerfRecord[],
): readonly DistributionBucket[] {
	const counts = DISTRIBUTION_BUCKETS.map((bucket) => ({ bucket, count: 0 }));
	for (const p of perf) {
		const v = p.pnlPct;
		const idx =
			v < -10
				? 0
				: v < -5
					? 1
					: v < -2
						? 2
						: v < 0
							? 3
							: v < 2
								? 4
								: v < 5
									? 5
									: v < 10
										? 6
										: 7;
		counts[idx].count += 1;
	}
	return counts;
}

export function filterByRange(
	journal: readonly AgentJournalEntry[],
	perf: readonly PerfRecord[],
	range: AnalyticsRange,
	nowMs: number,
): { journal: readonly AgentJournalEntry[]; perf: readonly PerfRecord[] } {
	if (range === "all") return { journal, perf };
	const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
	const cutoff = nowMs - days * DAY_MS;
	return {
		journal: journal.filter((j) => {
			const t = Date.parse(j.ts);
			return Number.isNaN(t) ? false : t >= cutoff;
		}),
		perf: perf.filter((p) => {
			const t = Date.parse(p.closedAt);
			return Number.isNaN(t) ? false : t >= cutoff;
		}),
	};
}

export function buildAnalytics(input: {
	journal: readonly AgentJournalEntry[];
	perf: readonly PerfRecord[];
	weights: Record<SignalName, number>;
	range: AnalyticsRange;
	nowMs: number;
}): AnalyticsPayload {
	const filtered = filterByRange(
		input.journal,
		input.perf,
		input.range,
		input.nowMs,
	);
	const perCycle = operationalPerCycle(filtered.journal);
	const daily = operationalDaily(perCycle);
	const buckets = financialBuckets(filtered.perf, input.range);
	const cumulative = cumulativePnl(buckets);
	const distribution = pnlDistribution(filtered.perf);
	const lifts =
		filtered.perf.length >= MIN_SAMPLES
			? SIGNAL_NAMES.map((s) => {
					const lift = computeLift(
						s,
						filtered.perf.filter((p) => p.pnlPct > 0),
						filtered.perf.filter((p) => p.pnlPct <= 0),
						MIN_SAMPLES,
					);
					return lift == null
						? null
						: {
								signal: s,
								lift: Math.round(lift * 1000) / 1000,
								weight: input.weights[s] ?? 1,
							};
				})
					.filter(
						(x): x is { signal: SignalName; lift: number; weight: number } =>
							x !== null,
					)
					.sort((a, b) => b.lift - a.lift)
			: [];
	return {
		operational: { perCycle, daily },
		financial: { buckets, cumulative, distribution },
		signals: {
			weights: input.weights,
			lifts,
			perfCount: filtered.perf.length,
			minSamples: MIN_SAMPLES,
		},
	};
}
