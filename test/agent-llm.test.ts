import { describe, expect, it } from "vitest";
import { buildPrompt, parseLlmResponse } from "../src/telegram/agent/llm.js";

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
