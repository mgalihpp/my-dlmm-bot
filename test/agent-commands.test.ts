import { describe, expect, it } from "vitest";
import {
	planActionLabel,
	positionFeeData,
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

describe("positionFeeData", () => {
	const base = {
		allTimeFees: {
			tokenX: { amount: "0", usd: "0", amountSol: "0" },
			tokenY: { amount: "0", usd: "0", amountSol: "0" },
			total: { usd: "0", sol: "0" },
		},
	};

	it("sums unclaimed swap fees in USD from unrealizedPnl", () => {
		const { feeUsd, claimedUsd } = positionFeeData({
			...base,
			unrealizedPnl: {
				balances: 7.5,
				balancesSol: "0.1",
				balanceTokenX: { amount: "1", usd: "0.01", amountSol: "0.0001" },
				balanceTokenY: { amount: "1", usd: "1", amountSol: "0.01" },
				unclaimedFeeTokenX: {
					amount: "67",
					usd: "0.0124",
					amountSol: "0.00016",
				},
				unclaimedFeeTokenY: {
					amount: "0.0001",
					usd: "0.011",
					amountSol: "0.00015",
				},
				unclaimedRewardTokenX: { amount: "0", usd: "0", amountSol: "0" },
				unclaimedRewardTokenY: { amount: "0", usd: "0", amountSol: "0" },
			},
		});
		expect(feeUsd).toBeCloseTo(0.0234, 5);
		expect(claimedUsd).toBe(0);
	});

	it("reports claimed fees from allTimeFees", () => {
		const { feeUsd, claimedUsd } = positionFeeData({
			...base,
			unrealizedPnl: null,
			allTimeFees: {
				...base.allTimeFees,
				total: { usd: "1.75", sol: "0.023" },
			},
		});
		expect(feeUsd).toBeNull();
		expect(claimedUsd).toBeCloseTo(1.75, 5);
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
