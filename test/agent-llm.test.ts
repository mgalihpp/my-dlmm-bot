import { generateText } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedAgentConfig } from "../src/services/Config.js";
import {
	buildOpenDecisionPrompt,
	buildPositionPrompt,
	describeLlmFailure,
	isLlmTimeout,
	parseOpenDecisionResponse,
	parsePositionResponse,
	requestOpenDecisions,
	requestPositionDecisions,
} from "../src/telegram/agent/llm.js";

vi.mock("ai", () => ({ generateText: vi.fn() }));

const llmCfg: ResolvedAgentConfig = {
	enabled: true,
	intervalMinutes: 15,
	maxCandidates: 5,
	minCandidate: 70,
	maxSolPerPosition: 0.5,
	maxTotalSol: 3,
	maxOpenPositions: 4,
	txCooldownMs: 300_000,
	poolCooldownMs: 24 * 3_600_000,
	tpPct: 25,
	slPct: -10,
	notifLevel: "normal",
	llm: {
		baseUrl: "http://localhost",
		model: "m",
		apiKey: "k",
		timeoutMs: 1000,
	},
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

const candidates = [
	{
		pool: "PoolA",
		pair: "AAA/SOL",
		heuristic: 90,
		feeActiveTvlRatio: 0.2,
		organicScore: 95,
		holders: 4000,
		volume: 300000,
	},
];

describe("buildOpenDecisionPrompt", () => {
	it("includes candidates, open/hold instruction and portfolio context", () => {
		const prompt = buildOpenDecisionPrompt(
			candidates,
			undefined,
			"3/5 open positions, deployed 4.5/10 SOL cap",
		);
		expect(prompt).toContain("PoolA");
		expect(prompt).toContain("90");
		expect(prompt).toContain("OPEN");
		expect(prompt).toContain("3/5 open positions");
		expect(prompt).not.toContain("favorability");
	});

	it("appends signal weights summary when provided", () => {
		const prompt = buildOpenDecisionPrompt(
			candidates,
			"Signal weights (Darwinian, learned from PnL):\n- volume: 1.50",
		);
		expect(prompt).toContain("Darwinian");
	});

	it("includes optional risk fields when present", () => {
		const prompt = buildOpenDecisionPrompt([
			{
				pool: "Pool111",
				pair: "FOO/SOL",
				heuristic: 80,
				feeActiveTvlRatio: 0.05,
				organicScore: 70,
				holders: 1000,
				volume: 50000,
				priceVsAthPct: 60,
				rugScore: 1500,
				top10Pct: 40,
			},
		]);
		expect(prompt).toContain("rugScore=1500");
		expect(prompt).toContain("priceVsAthPct=60");
		expect(prompt).toContain("0-2500");
		expect(prompt).toContain("lower = lower rug-pull risk");
		expect(prompt).toContain("meme tokens can still go to zero");
	});
});

describe("parseOpenDecisionResponse", () => {
	it("parses a plain JSON array", () => {
		const out = parseOpenDecisionResponse(
			JSON.stringify([{ pool: "PoolA", action: "open", rationale: "strong" }]),
		);
		expect(out).toEqual([
			{ pool: "PoolA", action: "open", rationale: "strong" },
		]);
	});

	it("strips markdown code fences", () => {
		const body =
			"```json\n" +
			JSON.stringify([{ pool: "PoolA", action: "hold", rationale: "meh" }]) +
			"\n```";
		const out = parseOpenDecisionResponse(body);
		expect(out).toEqual([{ pool: "PoolA", action: "hold", rationale: "meh" }]);
	});

	it("treats invalid action as hold and skips missing pool", () => {
		const out = parseOpenDecisionResponse(
			JSON.stringify([
				{ pool: "PoolA", action: "sell", rationale: "x" },
				{ pool: "PoolB", action: "open", rationale: "y" },
				{ action: "open" },
			]),
		);
		expect(out).toEqual([
			{ pool: "PoolA", action: "hold", rationale: "x" },
			{ pool: "PoolB", action: "open", rationale: "y" },
		]);
	});

	it("accepts an empty array (LLM said open nothing)", () => {
		expect(parseOpenDecisionResponse("[]")).toEqual([]);
	});

	it("accepts an object with a decisions key", () => {
		const out = parseOpenDecisionResponse(
			JSON.stringify({
				decisions: [{ pool: "PoolA", action: "open", rationale: "r" }],
			}),
		);
		expect(out).toEqual([{ pool: "PoolA", action: "open", rationale: "r" }]);
	});

	it("returns null on garbage (malformed → skip cycle)", () => {
		expect(parseOpenDecisionResponse("not json at all")).toBeNull();
		expect(parseOpenDecisionResponse('{"foo":1}')).toBeNull();
	});
});

describe("buildPositionPrompt", () => {
	it("renders pnlPct with explicit percent suffix so the LLM does not misread it as a fraction", () => {
		const prompt = buildPositionPrompt([
			{
				pool: "PoolA",
				poolName: "AAA/SOL",
				pnlPct: 0.14,
				minPrice: "1",
				maxPrice: "2",
				poolActivePrice: "3",
			},
		]);
		expect(prompt).toContain("pnlPct=0.14%");
	});

	it("renders negative pnlPct with percent suffix and sign intact", () => {
		const prompt = buildPositionPrompt([
			{
				pool: "PoolA",
				poolName: "AAA/SOL",
				pnlPct: -2.5,
				minPrice: "1",
				maxPrice: "2",
				poolActivePrice: "3",
			},
		]);
		expect(prompt).toContain("pnlPct=-2.50%");
	});
});

describe("isLlmTimeout", () => {
	it("detects abort/timeout errors", () => {
		expect(
			isLlmTimeout(new Error("The operation was aborted due to timeout")),
		).toBe(true);
		expect(isLlmTimeout(new Error("Request timed out after 120000ms"))).toBe(
			true,
		);
	});

	it("does not flag other errors", () => {
		expect(isLlmTimeout(new Error("401 Unauthorized"))).toBe(false);
		expect(isLlmTimeout(new Error("ECONNREFUSED"))).toBe(false);
	});
});

describe("describeLlmFailure", () => {
	it("advises raising agent.llm.timeoutMs on timeout", () => {
		const msg = describeLlmFailure(
			new Error("The operation was aborted due to timeout"),
			120_000,
		);
		expect(msg).toContain("120000");
		expect(msg).toContain("agent.llm.timeoutMs");
		expect(msg).toContain("vexis.config.json");
	});

	it("passes through non-timeout errors unchanged", () => {
		const msg = describeLlmFailure(new Error("401 Unauthorized"), 120_000);
		expect(msg).toBe("401 Unauthorized");
		expect(msg).not.toContain("agent.llm.timeoutMs");
	});

	it("stringifies unknown failures", () => {
		expect(describeLlmFailure("boom", 120_000)).toBe("boom");
	});
});

describe("parsePositionResponse", () => {
	it("parses valid close and hold decisions", () => {
		const out = parsePositionResponse(
			'[{"pool":"P1","action":"close","rationale":"OOR, losing fees"},{"pool":"P2","action":"hold","rationale":"wait"}]',
		);
		expect(out).toEqual([
			{ pool: "P1", action: "close", rationale: "OOR, losing fees" },
			{ pool: "P2", action: "hold", rationale: "wait" },
		]);
	});

	it("treats invalid action as hold", () => {
		const out = parsePositionResponse(
			'[{"pool":"P1","action":"sell","rationale":"x"}]',
		);
		expect(out[0].action).toBe("hold");
	});

	it("ignores empty pool and returns null on malformed responses", () => {
		expect(parsePositionResponse('[{"pool":"","action":"close"}]')).toEqual([]);
		expect(parsePositionResponse("not json")).toBeNull();
	});
});

describe("requestOpenDecisions failure messaging", () => {
	it("reports a missing API key before any request", async () => {
		const r = await requestOpenDecisions({
			cfg: { ...llmCfg, llm: { ...llmCfg.llm, apiKey: "" } },
			candidates,
		});
		expect(r.failed).toBe(true);
		expect(r.errorMessage).toContain("apiKey");
		expect(r.errorMessage).toContain("OPENAI_API_KEY");
	});

	it("reports an empty LLM response", async () => {
		vi.mocked(generateText).mockResolvedValue({ text: "" } as never);
		const r = await requestOpenDecisions({ cfg: llmCfg, candidates });
		expect(r.failed).toBe(true);
		expect(r.errorMessage).toContain("empty response");
	});

	it("reports an unparseable LLM response", async () => {
		vi.mocked(generateText).mockResolvedValue({
			text: "sure, here you go",
		} as never);
		const r = await requestOpenDecisions({ cfg: llmCfg, candidates });
		expect(r.failed).toBe(true);
		expect(r.errorMessage).toContain("unparseable");
	});

	it("returns decisions for a valid response", async () => {
		vi.mocked(generateText).mockResolvedValue({
			text: JSON.stringify([{ pool: "PoolA", action: "open", rationale: "r" }]),
		});
		const r = await requestOpenDecisions({ cfg: llmCfg, candidates });
		expect(r.failed).toBe(false);
		expect(r.decisions).toEqual([
			{ pool: "PoolA", action: "open", rationale: "r" },
		]);
	});
});

describe("requestPositionDecisions failure messaging", () => {
	const positions = [
		{
			pool: "P1",
			poolName: "AAA/SOL",
			pnlPct: -1.2,
			minPrice: "1",
			maxPrice: "2",
			poolActivePrice: "3",
		},
	];

	it("reports a missing API key before any request", async () => {
		const r = await requestPositionDecisions({
			cfg: { ...llmCfg, llm: { ...llmCfg.llm, apiKey: "" } },
			positions,
		});
		expect(r.degraded).toBe(true);
		expect(r.errorMessage).toContain("apiKey");
	});

	it("reports an empty LLM response", async () => {
		vi.mocked(generateText).mockResolvedValue({ text: "" } as never);
		const r = await requestPositionDecisions({ cfg: llmCfg, positions });
		expect(r.degraded).toBe(true);
		expect(r.errorMessage).toContain("empty response");
	});

	it("reports an unparseable LLM response", async () => {
		vi.mocked(generateText).mockResolvedValue({ text: "ok" } as never);
		const r = await requestPositionDecisions({ cfg: llmCfg, positions });
		expect(r.degraded).toBe(true);
		expect(r.errorMessage).toContain("unparseable");
	});

	it("returns decisions for a valid response", async () => {
		vi.mocked(generateText).mockResolvedValue({
			text: JSON.stringify([{ pool: "P1", action: "hold", rationale: "wait" }]),
		});
		const r = await requestPositionDecisions({ cfg: llmCfg, positions });
		expect(r.degraded).toBe(false);
		expect(r.decisions).toEqual([
			{ pool: "P1", action: "hold", rationale: "wait" },
		]);
	});
});
