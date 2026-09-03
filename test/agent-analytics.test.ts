import { describe, expect, it } from "vitest";
import {
	blockedBreakdown,
	normalizeBlockedReason,
	scoreSummary,
} from "../src/shared/agent-journal.js";
import type {
	AgentJournalEntry,
	JournalCandidate,
} from "../src/telegram/agent/journal.js";

const mkCandidate = (
	over: Partial<JournalCandidate> = {},
): JournalCandidate => ({
	pool: "poolA",
	poolName: "Token/SOL",
	heuristicScore: 80,
	rationale: "solid",
	action: "open",
	guardrail: "pass",
	blockedReason: null,
	execution: "ok",
	txSignature: "sig1",
	...over,
});

const mkEntry = (
	cycle: number,
	candidates: JournalCandidate[],
): AgentJournalEntry => ({
	ts: "2026-08-12T10:00:00.000Z",
	cycle,
	llmStatus: "ok",
	candidates,
});

describe("normalizeBlockedReason", () => {
	it("masks numbers and trailing detail into stable buckets", () => {
		expect(normalizeBlockedReason("rugScore 1200 > 800")).toBe(
			"rugScore # > #",
		);
		expect(normalizeBlockedReason("rugScore 900 > 800")).toBe("rugScore # > #");
		expect(normalizeBlockedReason("bundle 45.20% > 30.00%")).toBe(
			"bundle # > #",
		);
		expect(
			normalizeBlockedReason("cooldown until 1725000000000 (rugScore # > #)"),
		).toBe("cooldown until #");
		expect(normalizeBlockedReason("already 3 open positions")).toBe(
			"already # open positions",
		);
	});
});

describe("blockedBreakdown", () => {
	it("groups by normalized reason and counts others beyond topN", () => {
		const journal = [
			mkEntry(1, [
				mkCandidate({
					guardrail: "blocked",
					execution: null,
					txSignature: null,
					blockedReason: "rugScore 1200 > 800",
				}),
				mkCandidate({
					guardrail: "blocked",
					execution: null,
					txSignature: null,
					blockedReason: "rugScore 900 > 800",
				}),
				mkCandidate({
					guardrail: "blocked",
					execution: null,
					txSignature: null,
					blockedReason: "already 2 open positions",
				}),
			]),
			mkEntry(2, [mkCandidate({ action: "open" })]),
		];
		const full = blockedBreakdown(journal);
		expect(full.total).toBe(3);
		expect(full.groups[0]).toEqual({
			reason: "rugScore # > #",
			count: 2,
		});
		expect(full.others).toBe(0);

		const top1 = blockedBreakdown(journal, 1);
		expect(top1.groups).toHaveLength(1);
		expect(top1.others).toBe(1);
	});

	it("handles empty journal", () => {
		expect(blockedBreakdown([])).toEqual({
			groups: [],
			others: 0,
			total: 0,
		});
	});
});

describe("scoreSummary", () => {
	it("averages per outcome and buckets the distribution", () => {
		const journal = [
			mkEntry(1, [
				mkCandidate({ action: "open", heuristicScore: 90 }),
				mkCandidate({ action: "open", heuristicScore: 80 }),
				mkCandidate({ action: "hold", heuristicScore: 60 }),
				mkCandidate({
					action: "open",
					guardrail: "blocked",
					execution: null,
					txSignature: null,
					blockedReason: "x",
					heuristicScore: 40,
				}),
				mkCandidate({ action: "hold", heuristicScore: 0 }),
			]),
		];
		const summary = scoreSummary(journal);
		expect(summary.scored).toBe(4);
		expect(summary.avgOpen).toBe(85);
		expect(summary.avgHold).toBe(60);
		expect(summary.avgBlocked).toBe(40);
		expect(summary.bands).toEqual([
			{ label: "<50", count: 1 },
			{ label: "50–69", count: 1 },
			{ label: "70–84", count: 1 },
			{ label: "85+", count: 1 },
		]);
	});

	it("returns nulls for empty journal", () => {
		expect(scoreSummary([])).toEqual({
			scored: 0,
			avgOpen: null,
			avgHold: null,
			avgBlocked: null,
			bands: [
				{ label: "<50", count: 0 },
				{ label: "50–69", count: 0 },
				{ label: "70–84", count: 0 },
				{ label: "85+", count: 0 },
			],
		});
	});
});
