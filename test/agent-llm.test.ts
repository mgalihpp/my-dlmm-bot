import { describe, expect, it } from "vitest";
import {
	buildOpenDecisionPrompt,
	buildPositionPrompt,
	parseOpenDecisionResponse,
	parsePositionResponse,
} from "../src/telegram/agent/llm.js";

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

	it("ignores empty pool and malformed responses", () => {
		expect(parsePositionResponse('[{"pool":"","action":"close"}]')).toEqual([]);
		expect(parsePositionResponse("not json")).toEqual([]);
	});
});
