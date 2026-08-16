import { describe, expect, it } from "vitest";
import type {
	AgentJournalEntry,
	JournalCandidate,
} from "../src/telegram/agent/journal.js";
import type { AgentState } from "../src/telegram/agent/state.js";
import { buildAgentPayload } from "../src/web-react/app/lib/server/agent.server.js";

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

const mkState = (): AgentState => ({
	enabled: true,
	running: true,
	lastCycleAt: "2026-08-12T10:00:00.000Z",
	llmStatus: "ok",
	cycle: 42,
	plans: [],
	executions: [],
	cooldowns: [],
});

describe("buildAgentPayload", () => {
	it("assembles stats, filter, pagination and chart from fixture journal", () => {
		const journal = [
			mkEntry(1, [mkCandidate({ action: "open" })]),
			mkEntry(2, [
				mkCandidate({ action: "tp" }),
				mkCandidate({ action: "sl" }),
			]),
			mkEntry(3, [
				mkCandidate({ action: "open", guardrail: "blocked", execution: null }),
			]),
		];
		const payload = buildAgentPayload(
			journal,
			mkState(),
			{
				text: "ringkasan",
				source: "llm",
			},
			"all",
			1,
		);

		expect(payload.ok).toBe(true);
		expect(payload.filter).toBe("all");
		expect(payload.stats?.cycles).toBe(3);
		expect(payload.stats?.opens).toBe(2);
		expect(payload.stats?.blocked).toBe(1);
		expect(payload.total).toBe(4);
		expect(payload.page).toBe(1);
		expect(payload.pages).toBe(1);
		expect(payload.state?.running).toBe(true);
		expect(payload.narrative?.text).toBe("ringkasan");
		expect(payload.groups).toHaveLength(3);
		expect(payload.chart?.[2]).toEqual({
			cycle: 3,
			open: 0,
			tp: 0,
			sl: 0,
			close: 0,
		});
	});

	it("filters by action and clamps out-of-range pages", () => {
		const journal = Array.from({ length: 45 }, (_, i) =>
			mkEntry(i + 1, [mkCandidate({ action: i % 3 === 0 ? "tp" : "open" })]),
		);
		const payload = buildAgentPayload(
			journal,
			mkState(),
			{ text: "x", source: "fallback" },
			"tp",
			99,
		);
		expect(payload.filter).toBe("tp");
		expect(payload.total).toBe(15);
		expect(payload.pages).toBe(1);
		expect(payload.page).toBe(1);
		expect(payload.groups).toHaveLength(15);
	});

	it("parses invalid filter as all and handles empty journal", () => {
		const payload = buildAgentPayload(
			[],
			mkState(),
			{ text: "", source: "fallback" },
			"bogus",
			1,
		);
		expect(payload.filter).toBe("all");
		expect(payload.ok).toBe(true);
		expect(payload.total).toBe(0);
		expect(payload.groups).toEqual([]);
		expect(payload.chart).toEqual([]);
		expect(payload.stats?.cycles).toBe(0);
	});
});
