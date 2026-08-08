import { describe, expect, it } from "vitest";
import type { ResolvedAgentConfig } from "../src/services/Config.js";
import {
	formatCycleSummary,
	formatLive,
	formatStatus,
} from "../src/telegram/agent/format.js";
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
	risks: {
		enabled: true,
		minTokenFeesSol: 30,
		maxBundlePct: 30,
		maxBotHoldersPct: 30,
		maxTop10Pct: 60,
		maxPriceVsAthPct: 80,
		blockWash: true,
		blockRugpull: true,
		blockDexScreenerPaid: true,
		blockDevSoldAll: true,
	},
	darwin: {
		enabled: true,
		windowDays: 60,
		recalcEvery: 5,
		boostFactor: 1.05,
		decayFactor: 0.95,
		weightFloor: 0.3,
		weightCeiling: 2.5,
		minSamples: 10,
	},
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
					baseMint: null,
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

describe("formatLive", () => {
	it("renders cycle header with phase lines", () => {
		const out = formatLive(7, ["🔎 6 pools screened", "🧠 LLM: 2 signals"]);
		expect(out).toContain("\\#7");
		expect(out).toContain("🔎 6 pools screened");
		expect(out).toContain("🧠 LLM: 2 signals");
	});
	it("escapes MarkdownV2 reserved characters", () => {
		const out = formatLive(1, ["blocked: pool (risk) +3%"]);
		expect(out).toContain("\\(");
		expect(out).toContain("\\)");
		expect(out).toContain("\\+");
	});
});
