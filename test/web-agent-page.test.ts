import { describe, expect, it } from "vitest";
import type {
	AgentJournalEntry,
	JournalCandidate,
} from "../src/telegram/agent/journal.js";
import type { AgentState } from "../src/telegram/agent/state.js";
import { agentStats, renderAgent } from "../src/web/pages/agent.js";

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
			tpSl: 2,
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
			tpSl: 0,
			closes: 0,
			failed: 0,
			successRate: 0,
		});
	});
});

describe("renderAgent", () => {
	it("renders stats cards and journal table", () => {
		const html = renderAgent([mkEntry(1, [mkCandidate()])], mkState());
		expect(html).toContain("Cycles");
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
		);
		expect(html).toContain("pool cooldown &lt;x&gt;");
		expect(html).toContain(">blocked<");
	});

	it("empty journal shows empty state", () => {
		const html = renderAgent([], null);
		expect(html).toContain("No journal entries");
	});

	it("renders sparkline when 2+ cycles", () => {
		const html = renderAgent(
			[
				mkEntry(1, [mkCandidate({ action: "open" })]),
				mkEntry(2, [mkCandidate({ action: "hold" })]),
			],
			null,
		);
		expect(html).toContain("<svg");
	});

	it("escapes journal pool names", () => {
		const html = renderAgent(
			[mkEntry(1, [mkCandidate({ poolName: "<b>x</b>" })])],
			null,
		);
		expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
	});
});
