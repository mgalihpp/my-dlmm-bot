import { describe, expect, it } from "vitest";
import type { AgentJournalEntry } from "../src/telegram/agent/journal.js";
import type { PerfRecord } from "../src/telegram/agent/signalWeights.js";
import { actionCounts, tradeStats } from "../src/telegram/agent/stats.js";

const perf = (pnls: number[]): PerfRecord[] =>
	pnls.map((pnlPct, i) => ({
		closedAt: `2026-08-08T00:0${i}:00Z`,
		pnlPct,
		signals: {} as PerfRecord["signals"],
	}));

describe("tradeStats", () => {
	it("aggregates wins/losses/win rate/avg/total", () => {
		const s = tradeStats(perf([10, -5, 20, 0]));
		expect(s.closes).toBe(4);
		expect(s.wins).toBe(2);
		expect(s.losses).toBe(1);
		expect(s.winRate).toBeCloseTo(50);
		expect(s.avgPnlPct).toBeCloseTo(6.25);
		expect(s.bestPnl).toBe(20);
		expect(s.worstPnl).toBe(-5);
		expect(s.totalPnlPct).toBe(25);
	});

	it("returns nulls on empty perf", () => {
		const s = tradeStats([]);
		expect(s.closes).toBe(0);
		expect(s.winRate).toBeNull();
		expect(s.avgPnlPct).toBeNull();
	});
});

describe("actionCounts", () => {
	const base = {
		ts: "2026-08-08T00:00:00Z",
		cycle: 1,
		llmStatus: "ok" as const,
	};
	const entry: AgentJournalEntry = {
		...base,
		candidates: [
			{
				pool: "P1",
				poolName: "A/SOL",
				heuristicScore: 80,
				rationale: "r",
				action: "open",
				guardrail: "pass",
				blockedReason: null,
				execution: "ok",
				txSignature: "s",
			},
			{
				pool: "P2",
				poolName: "B/SOL",
				heuristicScore: 0,
				rationale: "dup",
				action: "open",
				guardrail: "blocked",
				blockedReason: "already open",
				execution: null,
				txSignature: null,
			},
			{
				pool: "P3",
				poolName: "C/SOL",
				heuristicScore: 0,
				rationale: "r",
				action: "open",
				guardrail: "pass",
				blockedReason: null,
				execution: "failed",
				txSignature: null,
			},
			{
				pool: "P4",
				poolName: "D/SOL",
				heuristicScore: 0,
				rationale: "r",
				action: "sl",
				guardrail: "pass",
				blockedReason: null,
				execution: "ok",
				txSignature: "s",
			},
		],
	};

	it("counts actions, blocked and failed separately", () => {
		const c = actionCounts([entry]);
		expect(c.open).toBe(2); // one ok + one failed
		expect(c.sl).toBe(1);
		expect(c.blocked).toBe(1); // blocked candidate not double-counted in open
		expect(c.failed).toBe(1);
		expect(c.tp).toBe(0);
		expect(c.close).toBe(0);
		expect(c.hold).toBe(0);
	});

	it("empty journal → all zero", () => {
		expect(actionCounts([])).toEqual({
			open: 0,
			hold: 0,
			tp: 0,
			sl: 0,
			close: 0,
			blocked: 0,
			failed: 0,
		});
	});
});
