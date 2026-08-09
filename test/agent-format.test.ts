import { describe, expect, it } from "vitest";
import type { ResolvedAgentConfig } from "../src/services/Config.js";
import {
	formatAction,
	formatBudgetBar,
	formatConfigQuick,
	formatCycleSummary,
	formatDashboardHeader,
	formatError,
	formatJournalPage,
	formatLive,
	formatPortfolio,
	formatPositionCard,
	formatRangeBar,
	formatStatus,
	journalPageCount,
	statusDot,
} from "../src/telegram/agent/format.js";
import type { AgentJournalEntry } from "../src/telegram/agent/journal.js";
import type { PerfRecord } from "../src/telegram/agent/signalWeights.js";
import type { AgentState } from "../src/telegram/agent/state.js";
import { actionCounts, tradeStats } from "../src/telegram/agent/stats.js";

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
	poolCooldownMs: 24 * 3_600_000,
	notifLevel: "normal",
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
			cooldowns: [],
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

describe("formatAction", () => {
	it("renders an executed open with tx signature", () => {
		const out = formatAction({
			action: "open",
			poolName: "A/SOL",
			amountSol: 0.5,
			reason: "strong fees",
			txSignature: "abc123def456",
		});
		expect(out).toContain("OPEN");
		expect(out).toContain("A/SOL");
		expect(out).toContain("0\\.5");
		expect(out).toContain("abc123def456");
	});
	it("renders a failed close", () => {
		const out = formatAction({
			action: "sl",
			poolName: "B/SOL",
			failed: true,
		});
		expect(out).toContain("FAILED");
		expect(out).toContain("SL");
	});
	it("escapes MarkdownV2 in pool names", () => {
		const out = formatAction({
			action: "close",
			poolName: "C/D (fee+3%)",
			failed: true,
		});
		expect(out).toContain("\\(");
		expect(out).toContain("\\+");
	});
});

describe("formatError", () => {
	it("renders scope and message", () => {
		const out = formatError("cycle", new Error("boom"));
		expect(out).toContain("cycle");
		expect(out).toContain("boom");
	});
});

describe("formatStatus stats", () => {
	it("adds notif level and trade stats when provided", () => {
		const s: AgentState = {
			enabled: true,
			running: false,
			lastCycleAt: null,
			llmStatus: "ok",
			cycle: 3,
			plans: [],
			executions: [],
			cooldowns: [
				{
					pool: "P1",
					poolName: "A/SOL",
					baseMint: null,
					until: "2099-01-01T00:00:00Z",
					reason: "closed (OOR)",
				},
			],
		};
		const stats = tradeStats([
			{
				closedAt: "2026-08-08T00:00:00Z",
				pnlPct: 10,
				signals: {} as PerfRecord["signals"],
			},
		]);
		const out = formatStatus(s, { ...cfg, notifLevel: "verbose" }, stats);
		expect(out).toContain("verbose");
		expect(out).toContain("Cooldowns: 1");
		expect(out).toContain("win 100%");
	});
});

describe("formatPortfolio", () => {
	it("renders rows, deployed and trade stats", () => {
		const stats = tradeStats([
			{
				closedAt: "2026-08-08T00:00:00Z",
				pnlPct: 10,
				signals: {} as PerfRecord["signals"],
			},
		]);
		const out = formatPortfolio(
			[
				{ poolName: "A/SOL", amountSol: 0.5, pnlPct: 3.2, outOfRange: false },
				{ poolName: "B/SOL", amountSol: 1, pnlPct: null, outOfRange: true },
			],
			1.5,
			stats,
		);
		expect(out).toContain("A/SOL");
		expect(out).toContain("B/SOL");
		expect(out).toContain("1\\.5 SOL");
		expect(out).toContain("n/a");
		expect(out).toContain("OOR");
	});
	it("renders empty state", () => {
		const out = formatPortfolio([], 0, tradeStats([]));
		expect(out).toContain("No open positions");
	});
});

describe("journal page", () => {
	const entry = (cycle: number): AgentJournalEntry => ({
		ts: "2026-08-08T00:00:00Z",
		cycle,
		llmStatus: "ok",
		candidates: [
			{
				pool: `P${cycle}`,
				poolName: `Pool ${cycle}`,
				heuristicScore: 80,
				favorability: 0.5,
				rationale: "r",
				score: 81,
				action: "open",
				guardrail: "pass",
				blockedReason: null,
				execution: "ok",
				txSignature: "sig",
			},
		],
	});
	const entries = [entry(1), entry(2), entry(3), entry(4), entry(5), entry(6)];
	const counts = actionCounts(entries);

	it("journalPageCount computes pages", () => {
		expect(journalPageCount(6, 5)).toBe(2);
		expect(journalPageCount(0, 5)).toBe(1);
	});

	it("paginates newest-first with header", () => {
		const out = formatJournalPage(
			entries,
			{ page: 0, pageSize: 5, filter: "all" },
			counts,
		);
		expect(out).toContain("page 1/2");
		expect(out).toContain("Pool 6");
		expect(out).not.toContain("Pool 1");
	});
	it("second page shows older entries", () => {
		const out = formatJournalPage(
			entries,
			{ page: 1, pageSize: 5, filter: "all" },
			counts,
		);
		expect(out).toContain("Pool 1");
		expect(out).not.toContain("Pool 6");
	});
});

const baseState = (over: Partial<AgentState> = {}): AgentState => ({
	enabled: true,
	running: true,
	lastCycleAt: "2026-08-08T00:00:00Z",
	llmStatus: "ok",
	cycle: 3,
	plans: [],
	executions: [],
	cooldowns: [],
	...over,
});

describe("statusDot", () => {
	it("maps states to health dots", () => {
		expect(statusDot(baseState())).toBe("🟢");
		expect(statusDot(baseState({ running: false }))).toBe("🟡");
		expect(statusDot(baseState({ enabled: false }))).toBe("⚫");
	});
});

describe("formatBudgetBar", () => {
	it("draws ten cells plus an escaped percent", () => {
		expect(formatBudgetBar(1, 4)).toContain("25%");
	});
	it("clamps above 100%", () => {
		expect(formatBudgetBar(5, 4)).toContain("100%");
	});
});

describe("formatDashboardHeader", () => {
	it("renders dot, budget and deployed", () => {
		const out = formatDashboardHeader(baseState(), cfg, 1.5, null);
		expect(out).toContain("VEXIS");
		expect(out).toContain("🟢");
		expect(out).toContain("1\\.5");
	});
	it("renders idle for a fresh disabled state", () => {
		const out = formatDashboardHeader(
			baseState({
				enabled: false,
				running: false,
				lastCycleAt: null,
				cycle: 0,
			}),
			cfg,
			0,
			null,
		);
		expect(out).toContain("⚫");
		expect(out).toContain("idle");
	});
});

describe("formatRangeBar", () => {
	it("flags in-range / below / above", () => {
		expect(formatRangeBar(1, 0.5, 2)).toContain("in\\-range");
		expect(formatRangeBar(0.2, 0.5, 2)).toContain("below");
		expect(formatRangeBar(5, 0.5, 2)).toContain("above");
	});
	it("guards inverted ranges", () => {
		expect(formatRangeBar(1, 5, 2)).toContain("unavailable");
	});
});

describe("formatPositionCard", () => {
	it("renders a full position card", () => {
		const out = formatPositionCard({
			tokenX: "SOL",
			tokenY: "JUP",
			poolAddress: "ABC",
			positionAddress: "POS1",
			amountSol: 1,
			pnlPct: 12.4,
			isOutOfRange: false,
			price: 1.5,
			minPrice: 0.5,
			maxPrice: 2,
			feeSol: 0.02,
		});
		expect(out).toContain("SOL/JUP");
		expect(out).toContain("12\\.40%");
		expect(out).toContain("0\\.02");
		expect(out).toContain("in\\-range");
		expect(out).toContain("meteora");
	});
	it("handles missing data", () => {
		const out = formatPositionCard({
			tokenX: "SOL",
			tokenY: "USDC",
			poolAddress: "ABC",
			positionAddress: "POS1",
			amountSol: null,
			pnlPct: null,
			isOutOfRange: null,
			price: null,
			minPrice: null,
			maxPrice: null,
			feeSol: null,
		});
		expect(out).toContain("n/a");
	});
});

describe("formatConfigQuick", () => {
	it("renders budget, TP/SL and notif level", () => {
		const out = formatConfigQuick(cfg);
		expect(out).toContain("3 ◎");
		expect(out).toContain("25%");
		expect(out).toContain("normal");
	});
});
