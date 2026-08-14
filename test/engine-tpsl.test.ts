import { describe, expect, it } from "vitest";
import {
	positionAgeHours,
	prefetchPlansPnl,
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
