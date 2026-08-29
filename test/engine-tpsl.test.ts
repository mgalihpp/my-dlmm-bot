import { describe, expect, it } from "vitest";
import {
	isStaleCandidate,
	positionAgeHours,
	prefetchPlansPnl,
	shouldEvaluateStale,
} from "../src/telegram/agent/engine.js";
import type { AgentPlan } from "../src/telegram/agent/state.js";

const plan = (pool: string): AgentPlan => ({
	pool,
	poolName: pool,
	baseMint: null,
	amountSol: 0.5,
	positionAddress: `${pool}-pos`,
	openedAt: new Date().toISOString(),
	signals: {},
});

describe("positionAgeHours", () => {
	const hoursAgo = (h: number) => Date.now() - h * 3_600_000;

	it("computes hours from ms epoch", () => {
		expect(positionAgeHours(hoursAgo(48))).toBe(48);
	});
	it("normalizes seconds epoch to hours", () => {
		expect(positionAgeHours(Math.floor(hoursAgo(24) / 1000))).toBe(24);
	});
	it("rejects zero, future and implausibly old values", () => {
		expect(positionAgeHours(0)).toBeNull();
		expect(positionAgeHours(-5)).toBeNull();
		expect(positionAgeHours(null)).toBeNull();
		expect(positionAgeHours(hoursAgo(-1))).toBeNull();
		expect(positionAgeHours(hoursAgo(24 * 365 * 11))).toBeNull();
	});
});

describe("prefetchPlansPnl", () => {
	it("dispatches all fetches in parallel before any resolves", async () => {
		let started = 0;
		let resolveAll: () => void = () => {};
		const gate = new Promise<void>((r) => (resolveAll = r));
		const fetch = async (pool: string) => {
			started++;
			await gate;
			return { pool };
		};
		const plans = [plan("A"), plan("B"), plan("C")];
		const pending = prefetchPlansPnl(plans, fetch);
		expect(started).toBe(3);
		resolveAll();
		const map = await pending;
		expect(map.get("A")).toEqual({ pool: "A" });
		expect(map.get("B")).toEqual({ pool: "B" });
		expect(map.get("C")).toEqual({ pool: "C" });
	});

	it("maps failed fetches to null and reports the error", async () => {
		const errors: Array<[string, unknown]> = [];
		const fetch = async (pool: string) => {
			if (pool === "B") throw new Error("boom");
			return { pool };
		};
		const map = await prefetchPlansPnl(
			[plan("A"), plan("B")],
			fetch,
			(pool, e) => errors.push([pool, e]),
		);
		expect(map.get("A")).toEqual({ pool: "A" });
		expect(map.get("B")).toBeNull();
		expect(errors).toEqual([["B", new Error("boom")]]);
	});
});

describe("isStaleCandidate", () => {
	const staleCfg = { ageHours: 48, feePerTvlThreshold: 0.005 };
	it("returns true when old and low fee", () => {
		expect(isStaleCandidate(48, "0.001", staleCfg)).toBe(true);
		expect(isStaleCandidate(72, "0.0049", staleCfg)).toBe(true);
	});
	it("returns false when young or fee high or missing", () => {
		expect(isStaleCandidate(24, "0.001", staleCfg)).toBe(false);
		expect(isStaleCandidate(48, "0.01", staleCfg)).toBe(false);
		expect(isStaleCandidate(null, "0.001", staleCfg)).toBe(false);
		expect(isStaleCandidate(48, null, staleCfg)).toBe(false);
		expect(isStaleCandidate(48, "bad", staleCfg)).toBe(false);
	});
});

describe("shouldEvaluateStale", () => {
	it("allows first evaluation and throttles within interval", () => {
		const now = Date.now();
		expect(shouldEvaluateStale("poolA", {}, now, 6)).toBe(true);
		expect(
			shouldEvaluateStale(
				"poolA",
				{ staleEvaluatedAt: { poolA: now } },
				now,
				6,
			),
		).toBe(false);
		expect(
			shouldEvaluateStale(
				"poolA",
				{ staleEvaluatedAt: { poolA: now - 7 * 3_600_000 } },
				now,
				6,
			),
		).toBe(true);
		expect(
			shouldEvaluateStale(
				"poolA",
				{ staleEvaluatedAt: { poolA: now - 5 * 3_600_000 } },
				now,
				6,
			),
		).toBe(false);
	});
});
