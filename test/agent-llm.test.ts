import { describe, expect, it } from "vitest";
import {
	buildPrompt,
	parseLlmResponse,
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

describe("buildPrompt", () => {
	it("includes each candidate pool id and heuristic", () => {
		const prompt = buildPrompt(candidates);
		expect(prompt).toContain("PoolA");
		expect(prompt).toContain("90");
		expect(prompt).toContain("favorability");
	});

	it("includes risk fields and weights summary in prompt", () => {
		const prompt = buildPrompt(
			[
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
					bundlePct: 10,
					botHoldersPct: 5,
					globalFeesSol: 45,
					activePositions: 200,
				},
			],
			"Signal weights (Darwinian, learned from PnL):\n- volume: 1.50",
		);
		expect(prompt).toContain("priceVsAthPct=60");
		expect(prompt).toContain("rugScore=1500");
		expect(prompt).toContain("Darwinian");
	});
});

describe("parseLlmResponse", () => {
	it("parses a plain JSON array", () => {
		const out = parseLlmResponse(
			JSON.stringify([
				{ pool: "PoolA", favorability: 0.6, rationale: "strong" },
			]),
		);
		expect(out).toEqual([
			{ pool: "PoolA", favorability: 0.6, rationale: "strong" },
		]);
	});

	it("strips markdown code fences", () => {
		const body =
			"```json\n" +
			JSON.stringify([
				{ pool: "PoolA", favorability: -0.2, rationale: "meh" },
			]) +
			"\n```";
		const out = parseLlmResponse(body);
		expect(out).toHaveLength(1);
		expect(out[0].favorability).toBe(-0.2);
	});

	it("clamps favorability into -1..1 and skips malformed entries", () => {
		const out = parseLlmResponse(
			JSON.stringify([
				{ pool: "PoolA", favorability: 1.9 },
				{ pool: "PoolB", favorability: 0.2 },
				{ favorability: 0.1 },
				{ pool: "PoolC" },
			]),
		);
		expect(out).toHaveLength(2);
		expect(out[0].favorability).toBe(1);
		expect(out[1].pool).toBe("PoolB");
	});

	it("returns empty array on garbage", () => {
		expect(parseLlmResponse("not json at all")).toEqual([]);
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
