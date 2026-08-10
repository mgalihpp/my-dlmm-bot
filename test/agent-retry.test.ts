import { describe, expect, it } from "vitest";
import { findFailedCandidate } from "../src/telegram/agent/engine.js";

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
