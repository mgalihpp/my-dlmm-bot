import { describe, expect, it } from "vitest";
import type { ResolvedAgentConfig } from "../src/services/Config.js";
import { formatCycleSummary, formatStatus } from "../src/telegram/agent/format.js";
import type { AgentJournalEntry } from "../src/telegram/agent/journal.js";
import type { AgentState } from "../src/telegram/agent/state.js";

const cfg: ResolvedAgentConfig = {
	enabled: true,
	intervalMinutes: 15,
	maxCandidates: 4,
	minCandidate: 70,
	maxSolPerPosition: 0.5,
	maxTotalSol: 3,
	maxOpenPositions: 4,
	txCooldownMs: 300_000,
	tpPct: 25,
	slPct: -10,
	llm: { baseUrl: "", model: "m", apiKey: "", timeoutMs: 1000 },
};

describe("formatStatus", () => {
	it("shows caps and open plans", () => {
		const s: AgentState = {
			enabled: true,
			running: false,
			lastCycleAt: "2026-08-08T00:00:00Z",
			llmStatus: "ok",
			cycle: 2,
			plans: [
				{
					pool: "P1",
					poolName: "A/SOL",
					amountSol: 0.5,
					positionAddress: null,
					openedAt: null,
				},
			],
			executions: [],
		};
		expect(formatStatus(s, cfg)).toContain("0/4");
		expect(formatStatus(s, cfg)).toContain("A/SOL");
	});
});

describe("formatCycleSummary", () => {
	it("renders blocks and degraded", () => {
		const entry: AgentJournalEntry = {
			ts: "2026-08-08T00:00:00Z",
			cycle: 3,
			llmStatus: "ok",
			candidates: [
				{
					pool: "P1",
					poolName: "A/SOL",
					heuristicScore: 80,
					favorability: 0.5,
					rationale: "ok",
					score: 81,
					action: "open",
					guardrail: "pass",
					blockedReason: null,
					execution: "ok",
					txSignature: "sig",
				},
			],
		};
		const text = formatCycleSummary([entry], false);
		expect(text).toContain("A/SOL");
		expect(text).toContain("sig");
	});
});
