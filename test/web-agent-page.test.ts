import { describe, expect, it } from "vitest";
import type {
	AgentJournalEntry,
	JournalCandidate,
} from "../src/telegram/agent/journal.js";
import type { AgentState } from "../src/telegram/agent/state.js";
import {
	agentStats,
	journalRows,
	paginate,
	parseJournalFilter,
	renderAgent,
	timelineGroups,
} from "../src/web/pages/agent.js";

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

describe("agentStats", () => {
	it("aggregates cycles and actions", () => {
		const entries = [
			mkEntry(1, [
				mkCandidate({ action: "open" }),
				mkCandidate({ action: "hold" }),
				mkCandidate({
					action: "open",
					guardrail: "blocked",
					blockedReason: "cooldown",
				}),
				mkCandidate({ action: "open", execution: "failed" }),
			]),
			mkEntry(2, [
				mkCandidate({ action: "tp" }),
				mkCandidate({ action: "sl" }),
			]),
		];
		expect(agentStats(entries)).toEqual({
			cycles: 2,
			opens: 3,
			holds: 1,
			blocked: 1,
			tp: 1,
			sl: 1,
			closes: 0,
			failed: 1,
			successRate: 75,
		});
	});

	it("handles empty journal", () => {
		expect(agentStats([])).toEqual({
			cycles: 0,
			opens: 0,
			holds: 0,
			blocked: 0,
			tp: 0,
			sl: 0,
			closes: 0,
			failed: 0,
			successRate: 0,
		});
	});
});

describe("journalRows", () => {
	it("filters by action and returns newest cycle first", () => {
		const entries = [
			mkEntry(1, [
				mkCandidate({ action: "tp" }),
				mkCandidate({ action: "open" }),
			]),
			mkEntry(2, [mkCandidate({ action: "sl" })]),
			mkEntry(3, [mkCandidate({ action: "open" })]),
		];
		const rows = journalRows(entries, "tp");
		expect(rows).toHaveLength(1);
		expect(rows[0].cycle).toBe(1);
		expect(rows[0].candidate?.action).toBe("tp");

		const all = journalRows(entries, "all");
		expect(all.map((row) => row.cycle)).toEqual([3, 2, 1, 1]);
	});

	it("filters by blocked guardrail", () => {
		const entries = [
			mkEntry(1, [
				mkCandidate({
					action: "open",
					guardrail: "blocked",
					blockedReason: "x",
				}),
				mkCandidate({ action: "open" }),
			]),
		];
		const rows = journalRows(entries, "blocked");
		expect(rows).toHaveLength(1);
		expect(rows[0].candidate?.guardrail).toBe("blocked");
	});

	it("includes empty cycles only for all filter", () => {
		const entries = [
			mkEntry(1, []),
			mkEntry(2, [mkCandidate({ action: "tp" })]),
		];
		expect(journalRows(entries, "all").map((row) => row.cycle)).toEqual([2, 1]);
		expect(journalRows(entries, "tp")).toHaveLength(1);
	});
});

describe("paginate", () => {
	it("slices pages and clamps out-of-range pages", () => {
		const rows = Array.from({ length: 45 }, (_, i) => i);
		const first = paginate(rows, 1, 20);
		expect(first.rows).toHaveLength(20);
		expect(first.pages).toBe(3);
		expect(first.total).toBe(45);
		const last = paginate(rows, 99, 20);
		expect(last.page).toBe(3);
		expect(last.rows).toHaveLength(5);
	});
});

describe("parseJournalFilter", () => {
	it("defaults invalid or missing input to all", () => {
		expect(parseJournalFilter(null)).toBe("all");
		expect(parseJournalFilter("bogus")).toBe("all");
		expect(parseJournalFilter("tp")).toBe("tp");
		expect(parseJournalFilter("blocked")).toBe("blocked");
	});
});

describe("renderAgent", () => {
	it("renders stats cards and journal table", () => {
		const html = renderAgent([mkEntry(1, [mkCandidate()])], mkState(), {
			action: "all",
			page: 1,
		});
		expect(html).toContain("Cycles");
		expect(html).toContain('class="agent-banner"');
		expect(html).toContain('class="stats-grid agent-stats"');
		expect(html).toContain("Decision context");
		expect(html).toContain("DECISIONS / CYCLE");
		expect(html).toContain(">1<");
		expect(html).toContain("Token/SOL");
		expect(html).toContain(">open<");
		expect(html).toContain(">pass<");
		expect(html).toContain('href="https://solscan.io/tx/sig1"');
	});

	it("shows blocked reason and failed execution", () => {
		const html = renderAgent(
			[
				mkEntry(1, [
					mkCandidate({
						action: "open",
						guardrail: "blocked",
						blockedReason: "pool cooldown <x>",
						execution: null,
						txSignature: null,
					}),
				]),
			],
			null,
			{ action: "all", page: 1 },
		);
		expect(html).toContain("pool cooldown &lt;x&gt;");
		expect(html).toContain(">blocked<");
	});

	it("empty journal shows empty state", () => {
		const html = renderAgent([], null, { action: "all", page: 1 });
		expect(html).toContain("No journal entries");
	});

	it("renders tp and sl stat cards", () => {
		const html = renderAgent(
			[
				mkEntry(1, [mkCandidate({ action: "tp" })]),
				mkEntry(2, [mkCandidate({ action: "sl" })]),
			],
			null,
			{ action: "all", page: 1 },
		);
		expect(html).toContain("Take profit");
		expect(html).toContain("Stop loss");
		expect(html).toContain("<strong>1</strong>");
	});

	it("does not render the successful-opens sparkline card", () => {
		const html = renderAgent(
			[
				mkEntry(1, [mkCandidate({ action: "open" })]),
				mkEntry(2, [mkCandidate({ action: "hold" })]),
			],
			null,
			{ action: "all", page: 1 },
		);
		expect(html).not.toContain("SUCCESSFUL OPENS / CYCLE");
	});

	it("escapes journal pool names", () => {
		const html = renderAgent(
			[mkEntry(1, [mkCandidate({ poolName: "<b>x</b>" })])],
			null,
			{ action: "all", page: 1 },
		);
		expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
	});
});

describe("timelineGroups", () => {
	it("groups consecutive rows by cycle in order", () => {
		const entries = [
			mkEntry(1, [mkCandidate({ action: "tp" }), mkCandidate({ action: "open" })]),
			mkEntry(2, [mkCandidate({ action: "sl" })]),
			mkEntry(3, []),
		];
		const groups = timelineGroups(journalRows(entries, "all"));
		expect(groups.map((g) => g.cycle)).toEqual([3, 2, 1]);
		expect(groups[2].rows).toHaveLength(2);
		expect(groups[0].rows[0].candidate).toBeNull();
	});
	it("preserves llmStatus per group", () => {
		const entries = [
			{ ts: "2026-08-12T10:00:00.000Z", cycle: 1, llmStatus: "failed" as const, candidates: [mkCandidate({ action: "open" })] },
		];
		const groups = timelineGroups(journalRows(entries, "all"));
		expect(groups[0].llmStatus).toBe("failed");
	});
	it("returns empty for empty rows", () => {
		expect(timelineGroups([])).toEqual([]);
	});
});
