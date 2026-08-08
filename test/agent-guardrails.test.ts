import { describe, expect, it } from "vitest";
import {
	checkCooldown,
	checkDuplicate,
	checkOpenGuardrail,
	deriveOpenAmount,
} from "../src/telegram/agent/guardrails.js";

const cfg = {
	enabled: true,
	intervalMinutes: 15,
	maxCandidates: 5,
	minCandidate: 70,
	maxSolPerPosition: 0.5,
	maxTotalSol: 3,
	maxOpenPositions: 4,
	txCooldownMs: 300_000,
	tpPct: 25,
	slPct: -10,
	llm: { baseUrl: "", model: "m", apiKey: "", timeoutMs: 1000 },
};

describe("checkOpenGuardrail", () => {
	it("rejects when deployed+amount exceeds total cap", () => {
		const r = checkOpenGuardrail({
			amountSol: 1,
			deployedSol: 2.5,
			maxSolPerPosition: 0.5,
			maxTotalSol: 3,
			maxOpenPositions: 4,
		});
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("cap");
	});

	it("rejects when at max open positions", () => {
		const r = checkOpenGuardrail({
			amountSol: 0.1,
			deployedSol: 0,
			maxSolPerPosition: 0.5,
			maxTotalSol: 3,
			maxOpenPositions: 1,
			openPositionCount: 1,
		});
		expect(r.ok).toBe(false);
	});

	it("passes when all clear", () => {
		const r = checkOpenGuardrail({
			amountSol: 0.2,
			deployedSol: 0.5,
			maxSolPerPosition: 0.5,
			maxTotalSol: 3,
			maxOpenPositions: 4,
		});
		expect(r.ok).toBe(true);
	});
});

describe("checkCooldown", () => {
	it("blocks within cooldown window", () => {
		const r = checkCooldown({
			lastExecutionAt: 1_000,
			nowMs: 1_200,
			txCooldownMs: 300_000,
		});
		expect(r.ok).toBe(false);
	});
	it("allows after the window elapsed", () => {
		const r = checkCooldown({
			lastExecutionAt: 1_000,
			nowMs: 1_000 + 301_000,
			txCooldownMs: 300_000,
		});
		expect(r.ok).toBe(true);
	});
});

describe("checkDuplicate", () => {
	const plans = [{ pool: "poolA", baseMint: "mintA" }];
	it("blocks when the same pool is already held", () => {
		const r = checkDuplicate({ pool: "poolA", baseMint: "mintB", plans });
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("pool");
	});
	it("blocks when the same token is already held", () => {
		const r = checkDuplicate({ pool: "poolB", baseMint: "mintA", plans });
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("token");
	});
	it("allows a different pool and token", () => {
		const r = checkDuplicate({ pool: "poolB", baseMint: "mintB", plans });
		expect(r.ok).toBe(true);
	});
	it("ignores plans without a backfilled baseMint", () => {
		const legacy = [{ pool: "poolA", baseMint: null }];
		const r = checkDuplicate({
			pool: "poolB",
			baseMint: "mintB",
			plans: legacy,
		});
		expect(r.ok).toBe(true);
	});
});

describe("deriveOpenAmount", () => {
	it("caps by per-position, total remaining, and min SOL", () => {
		expect(deriveOpenAmount(2.7, cfg)).toBe(0.3);
		expect(deriveOpenAmount(0, cfg)).toBe(0.5);
	});
});
