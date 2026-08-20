import { describe, expect, it } from "vitest";
import type { AgentJournalEntry } from "../src/telegram/agent/journal.js";
import type { PerfRecord } from "../src/telegram/agent/signalWeights.js";
import {
	buildAnalytics,
	cumulativePnl,
	filterByRange,
	financialBuckets,
	operationalDaily,
	operationalPerCycle,
	parseRange,
	pnlDistribution,
} from "../src/shared/agent-analytics.js";

const entry = (
	ts: string,
	cycle: number,
	candidates: AgentJournalEntry["candidates"],
	llmStatus: AgentJournalEntry["llmStatus"] = "ok",
): AgentJournalEntry => ({ ts, cycle, llmStatus, candidates });

describe("parseRange", () => {
	it("defaults to 30d", () => {
		expect(parseRange(null)).toBe("30d");
		expect(parseRange("invalid")).toBe("30d");
	});
	it("parses valid ranges", () => {
		expect(parseRange("7d")).toBe("7d");
		expect(parseRange("all")).toBe("all");
	});
});

describe("operationalPerCycle", () => {
	it("counts actions and computes successRate", () => {
		const entries: AgentJournalEntry[] = [
			entry("2026-08-19T10:00:00.000Z", 10, [
				{ pool: "A", poolName: "SOL/USDC", heuristicScore: 0.9, rationale: "ok", action: "open", guardrail: "pass", blockedReason: null, execution: "ok", txSignature: "sig1" },
				{ pool: "B", poolName: "", heuristicScore: 0.1, rationale: null, action: "hold", guardrail: "pass", blockedReason: null, execution: null, txSignature: null },
				{ pool: "C", poolName: "", heuristicScore: 0.5, rationale: null, action: "open", guardrail: "blocked", blockedReason: "rug", execution: null, txSignature: null },
			]),
		];
		const res = operationalPerCycle(entries);
		expect(res[0].opens).toBe(2);
		expect(res[0].holds).toBe(1);
		expect(res[0].blocked).toBe(1);
		expect(res[0].successRate).toBe(67);
		expect(res[0].llmStatus).toBe("ok");
	});
	it("caps at 100 cycles", () => {
		const entries = Array.from({ length: 150 }, (_, i) =>
			entry(`2026-08-19T10:00:00.00${i % 10}Z`, i, [
				{ pool: "A", poolName: "", heuristicScore: 1, rationale: null, action: "open", guardrail: "pass", blockedReason: null, execution: "ok", txSignature: "s" },
			]),
		);
		expect(operationalPerCycle(entries)).toHaveLength(100);
	});
});

describe("operationalDaily", () => {
	it("groups by date and averages rates", () => {
		const perCycle = [
			{ cycle: 1, ts: "2026-08-18T10:00:00Z", date: "2026-08-18", opens: 1, holds: 1, blocked: 0, failed: 0, tp: 0, sl: 0, closes: 0, llmStatus: "ok" as const, successRate: 50 },
			{ cycle: 2, ts: "2026-08-18T15:00:00Z", date: "2026-08-18", opens: 2, holds: 0, blocked: 1, failed: 0, tp: 0, sl: 0, closes: 0, llmStatus: "failed" as const, successRate: 100 },
			{ cycle: 3, ts: "2026-08-19T10:00:00Z", date: "2026-08-19", opens: 0, holds: 2, blocked: 0, failed: 1, tp: 0, sl: 0, closes: 0, llmStatus: "ok" as const, successRate: 0 },
		];
		const daily = operationalDaily(perCycle);
		expect(daily).toHaveLength(2);
		expect(daily[0].cycles).toBe(2);
		expect(daily[0].blockedRate).toBe(50);
		expect(daily[0].llmFailRate).toBe(50);
		expect(daily[1].execFailRate).toBe(100);
	});
});

describe("filterByRange", () => {
	it("7d excludes old entries", () => {
		const now = Date.parse("2026-08-20T00:00:00Z");
		const journal = [
			entry("2026-08-10T00:00:00Z", 1, []),
			entry("2026-08-19T00:00:00Z", 2, []),
		];
		const perf: PerfRecord[] = [
			{ closedAt: "2026-08-10T00:00:00Z", pnlPct: 1, signals: {} as never },
			{ closedAt: "2026-08-19T00:00:00Z", pnlPct: 2, signals: {} as never },
		];
		const filtered = filterByRange(journal, perf, "7d", now);
		expect(filtered.journal).toHaveLength(1);
		expect(filtered.perf).toHaveLength(1);
	});
	it("all keeps everything", () => {
		const journal = [entry("2026-01-01T00:00:00Z", 1, [])];
		const filtered = filterByRange(journal, [], "all", Date.now());
		expect(filtered.journal).toHaveLength(1);
	});
});

describe("financialBuckets", () => {
	it("buckets daily for 7d and weekly for 90d", () => {
		const perf: PerfRecord[] = [
			{ closedAt: "2026-08-18T10:00:00Z", pnlPct: 5, signals: {} as never },
			{ closedAt: "2026-08-18T15:00:00Z", pnlPct: -2, signals: {} as never },
			{ closedAt: "2026-08-25T10:00:00Z", pnlPct: 3, signals: {} as never },
		];
		const daily = financialBuckets(perf, "7d");
		expect(daily[0].closes).toBe(2);
		expect(daily[0].wins).toBe(1);
		expect(daily[0].avgPnl).toBeCloseTo(1.5);
		expect(daily[0].totalPnl).toBeCloseTo(3);
		expect(daily[0].best).toBe(5);
		expect(daily[0].worst).toBe(-2);
		const weekly = financialBuckets(perf, "90d");
		expect(weekly.length).toBeLessThanOrEqual(2);
	});
	it("returns empty winRate when no closes in bucket", () => {
		const perf: PerfRecord[] = [];
		expect(financialBuckets(perf, "30d")).toEqual([]);
	});
});

describe("cumulativePnl", () => {
	it("computes running sum", () => {
		const buckets = [
			{ label: "a", date: "d1", closes: 1, wins: 1, losses: 0, winRate: 100, avgPnl: 5, totalPnl: 5, best: 5, worst: 5 },
			{ label: "b", date: "d2", closes: 1, wins: 0, losses: 1, winRate: 0, avgPnl: -2, totalPnl: -2, best: -2, worst: -2 },
		];
		const cum = cumulativePnl(buckets);
		expect(cum[0].cumPnl).toBe(5);
		expect(cum[1].cumPnl).toBe(3);
	});
});

describe("pnlDistribution", () => {
	it("places values in 8 fixed buckets", () => {
		const perf: PerfRecord[] = [
			{ closedAt: "2026-08-18T10:00:00Z", pnlPct: -12, signals: {} as never },
			{ closedAt: "2026-08-18T11:00:00Z", pnlPct: -3, signals: {} as never },
			{ closedAt: "2026-08-18T12:00:00Z", pnlPct: 0, signals: {} as never },
			{ closedAt: "2026-08-18T13:00:00Z", pnlPct: 7, signals: {} as never },
		];
		const dist = pnlDistribution(perf);
		expect(dist).toHaveLength(8);
		expect(dist.find((d) => d.bucket === "<-10")?.count).toBe(1);
		expect(dist.find((d) => d.bucket === "-5_-2")?.count).toBe(1);
		expect(dist.find((d) => d.bucket === "0_2")?.count).toBe(1);
		expect(dist.find((d) => d.bucket === "5_10")?.count).toBe(1);
	});
});

describe("buildAnalytics", () => {
	it("returns empty payload for empty inputs", () => {
		const a = buildAnalytics({ journal: [], perf: [], weights: {} as never, range: "30d", nowMs: Date.now() });
		expect(a.operational.perCycle).toEqual([]);
		expect(a.financial.distribution).toHaveLength(8);
		expect(a.signals.lifts).toEqual([]);
		expect(a.signals.perfCount).toBe(0);
	});
	it("computes lifts when enough samples", () => {
		const now = Date.parse("2026-08-20T00:00:00Z");
		const perf: PerfRecord[] = [];
		for (let i = 0; i < 12; i++) {
			perf.push({ closedAt: new Date(now - i * 86_400_000).toISOString(), pnlPct: 5, signals: { organicScore: 90 } as never });
		}
		for (let i = 0; i < 12; i++) {
			perf.push({ closedAt: new Date(now - (12 + i) * 86_400_000).toISOString(), pnlPct: -5, signals: { organicScore: 30 } as never });
		}
		const a = buildAnalytics({ journal: [], perf, weights: {} as never, range: "all", nowMs: now });
		expect(a.signals.perfCount).toBe(24);
		expect(a.signals.lifts.length).toBeGreaterThan(0);
		expect(a.signals.lifts[0].signal).toBe("organicScore");
	});
});
