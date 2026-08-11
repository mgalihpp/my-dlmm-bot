import { describe, expect, it } from "vitest";
import {
	planActionLabel,
	resolvePlanPosition,
} from "../src/telegram/agent/commands.js";
import { journalPageCount } from "../src/telegram/agent/format.js";

describe("journal pagination helper", () => {
	it("clamps and counts", () => {
		expect(journalPageCount(0, 5)).toBe(1);
		expect(journalPageCount(6, 5)).toBe(2);
		expect(journalPageCount(12, 5)).toBe(3);
	});
});

describe("planActionLabel", () => {
	it("labels an open plan with name and amount", () => {
		expect(
			planActionLabel({
				poolName: "SOL/JUP",
				amountSol: 1.5,
				positionAddress: "P1",
			}),
		).toContain("SOL/JUP");
		expect(
			planActionLabel({
				poolName: "SOL/JUP",
				amountSol: 1.5,
				positionAddress: "P1",
			}),
		).toContain("1.5");
	});
	it("marks pending plans", () => {
		expect(
			planActionLabel({ poolName: "B", amountSol: 2, positionAddress: null }),
		).toContain("pending");
	});
});

describe("resolvePlanPosition", () => {
	const plans = [
		{ pool: "POOL_A", positionAddress: "POS_1", amountSol: 1.5 },
		{ pool: "POOL_B", positionAddress: null, amountSol: 2 },
	] as const;

	it("resolves the open position for a pool from persisted plans", () => {
		const plan = resolvePlanPosition(plans, "POOL_A");
		expect(plan?.positionAddress).toBe("POS_1");
		expect(plan?.amountSol).toBe(1.5);
	});

	it("returns null when the pool has no open position in plans", () => {
		expect(resolvePlanPosition(plans, "POOL_B")).toBeNull();
		expect(resolvePlanPosition([], "POOL_A")).toBeNull();
	});
});
