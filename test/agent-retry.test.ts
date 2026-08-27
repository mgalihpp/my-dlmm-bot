import type { Bot } from "grammy";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/telegram/fx.js", () => ({
	resolveWallet: vi.fn(async () => "wallet"),
	api: {
		openPortfolio: vi.fn(async () => ({
			total: { balancesSol: 0 },
			totalPositions: 0,
			pools: [],
		})),
	},
	screenPools: vi.fn(),
	dlmm: {
		quotePositionCost: vi.fn(async () => ({ nonRefundableCost: 0 })),
		createPosition: vi.fn(async () => ({
			signatures: ["sig"],
			positions: ["pos1"],
		})),
	},
	getConfigSync: vi.fn(() => ({})),
}));

vi.mock("../src/services/Config.js", async (importActual) => {
	const actual = (await importActual()) as Record<string, unknown>;
	return {
		...actual,
		resolveCreatePresetFrom: vi.fn(() => ({ strategy: "bidask", range: 10 })),
	};
});

vi.mock("../src/telegram/agent/state.js", () => ({
	saveState: vi.fn(),
	loadState: vi.fn(),
}));

vi.mock("../src/telegram/agent/notify.js", () => ({
	notify: vi.fn(async () => {}),
	notifyKeyboard: vi.fn(() => ({})),
}));

vi.mock("../src/telegram/agent/journal.js", () => ({
	appendJournal: vi.fn(),
}));

vi.mock("../src/telegram/agent/format.js", () => ({
	formatAction: vi.fn(() => "action"),
}));

import type { ScreenedPool } from "../src/domain/screened.js";
import type { ScreenResult } from "../src/lib/screening.js";
import { resolveAgentConfigFrom } from "../src/services/Config.js";
import {
	findFailedCandidate,
	type RuntimeAgent,
	retryOpen,
} from "../src/telegram/agent/engine.js";
import type { JournalCandidate } from "../src/telegram/agent/journal.js";
import type { AgentState } from "../src/telegram/agent/state.js";
import { screenPools } from "../src/telegram/fx.js";

const baseState = (): AgentState => ({
	enabled: false,
	running: false,
	lastCycleAt: null,
	llmStatus: "ok",
	cycle: 0,
	plans: [],
	executions: [],
	cooldowns: [],
	oorSince: {},
});

const cand: JournalCandidate = {
	pool: "poolA",
	poolName: "A/SOL",
	heuristicScore: 1,
	rationale: null,
	action: "open",
	guardrail: "pass",
	blockedReason: null,
	execution: "failed",
	txSignature: null,
};

const cfg = resolveAgentConfigFrom(
	{
		agent: {
			maxSolPerPosition: 0.5,
			maxTotalSol: 4,
			maxOpenPositions: 4,
			txCooldownMs: 300_000,
			tpPct: 25,
			slPct: -10,
		},
	},
	{},
);

const bot = {} as unknown as Bot;
const chatId = "chat";

const screened = (pool: string, baseMint: string): ScreenResult => ({
	pools: [{ pool, baseMint } as unknown as ScreenedPool],
	total: 0,
});

afterEach(() => {
	vi.mocked(screenPools).mockReset();
});

describe("findFailedCandidate", () => {
	const entries = [
		{
			ts: "2026-01-01T00:00:00Z",
			cycle: 1,
			llmStatus: "ok" as const,
			candidates: [
				{
					pool: "poolA",
					poolName: "A",
					heuristicScore: 1,
					rationale: null,
					action: "open" as const,
					guardrail: "pass" as const,
					blockedReason: null,
					execution: "failed" as const,
					txSignature: null,
				},
				{
					pool: "poolB",
					poolName: "B",
					heuristicScore: 5,
					rationale: null,
					action: "open" as const,
					guardrail: "pass" as const,
					blockedReason: null,
					execution: "ok" as const,
					txSignature: "sig",
				},
			],
		},
		{
			ts: "2026-01-01T00:01:00Z",
			cycle: 2,
			llmStatus: "ok" as const,
			candidates: [
				{
					pool: "poolA",
					poolName: "A",
					heuristicScore: 10,
					rationale: null,
					action: "open" as const,
					guardrail: "pass" as const,
					blockedReason: null,
					execution: "failed" as const,
					txSignature: null,
				},
			],
		},
	];

	it("returns the newest failed candidate for the pool", () => {
		const c = findFailedCandidate("poolA", entries);
		expect(c?.heuristicScore).toBe(10);
	});

	it("ignores successful candidates and other pools", () => {
		expect(findFailedCandidate("poolB", entries)).toBeNull();
		expect(findFailedCandidate("poolX", entries)).toBeNull();
	});
});

describe("retryOpen baseMint capture", () => {
	it("records the token baseMint on the opened plan (enables token-level cooldown)", async () => {
		vi.mocked(screenPools).mockResolvedValue(screened("poolA", "MINT123"));
		const rt = { state: baseState() } as unknown as RuntimeAgent;
		const out = await retryOpen(rt, bot, chatId, cfg, cand);
		expect(out).toContain("OPEN");
		expect(rt.state.plans).toHaveLength(1);
		expect(rt.state.plans[0].baseMint).toBe("MINT123");
	});

	it("falls back to null baseMint when screening is unavailable", async () => {
		vi.mocked(screenPools).mockRejectedValue(new Error("no screen"));
		const rt = { state: baseState() } as unknown as RuntimeAgent;
		const out = await retryOpen(rt, bot, chatId, cfg, cand);
		expect(out).toContain("OPEN");
		expect(rt.state.plans[0].baseMint).toBeNull();
	});
});
