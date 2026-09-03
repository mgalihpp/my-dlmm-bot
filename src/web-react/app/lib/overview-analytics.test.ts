import type { ClosedPool } from "@vexis/domain/portfolio.js";
import { describe, expect, it } from "vitest";
import { makeLocalDate } from "./date-range";
import {
	computeClosedAggregates,
	computeOverviewMetricsFromRecords,
} from "./overview-analytics";

function closedPool(overrides: Partial<ClosedPool>): ClosedPool {
	return {
		poolAddress: "Pool",
		binStep: 10,
		baseFee: 1,
		lastClosedAt: 1700000000,
		tokenX: "SOL",
		tokenY: "USDC",
		tokenXMint: "mintX",
		tokenYMint: "mintY",
		totalDeposit: "0",
		totalWithdrawal: "0",
		totalFee: "0",
		pnlUsd: "0",
		pnlSol: "0",
		pnlSolPctChange: "0",
		pnlPctChange: "0",
		...overrides,
	};
}

const nowSec = Math.floor(Date.now() / 1000);

describe("computeOverviewMetricsFromRecords net", () => {
	it("unbounded uses all-time totalPnl plus unrealized even when window realized differs", () => {
		const metrics = computeOverviewMetricsFromRecords(
			[{ pnlSol: "1", pnlUsd: "10", closedAt: nowSec }],
			[],
			1,
			{ totalPnlSol: "100", totalPnlUsd: "1000" },
			{ sol: 5, usd: 50 },
			"sol",
			{ kind: "all" },
		);
		expect(metrics.netPnlSol).toBeCloseTo(105, 9);
		expect(metrics.netPnlUsd).toBeCloseTo(1050, 9);
	});

	it("bounded ignores all-time totalPnl and uses window realized plus unrealized", () => {
		const metrics = computeOverviewMetricsFromRecords(
			[{ pnlSol: "1", pnlUsd: "10", closedAt: nowSec }],
			[],
			1,
			{ totalPnlSol: "100", totalPnlUsd: "1000" },
			{ sol: 5, usd: 50 },
			"sol",
			{
				kind: "bounded",
				from: makeLocalDate(2026, 1, 1),
				to: makeLocalDate(2026, 1, 31),
			},
		);
		expect(metrics.netPnlSol).toBeCloseTo(6, 9);
		expect(metrics.netPnlUsd).toBeCloseTo(60, 9);
	});

	it("missing total falls back to realized plus unrealized", () => {
		const metrics = computeOverviewMetricsFromRecords(
			[{ pnlSol: "1", pnlUsd: "10", closedAt: nowSec }],
			[],
			1,
			null,
			{ sol: 5, usd: 50 },
			"sol",
			{ kind: "all" },
		);
		expect(metrics.netPnlSol).toBeCloseTo(6, 9);
		expect(metrics.netPnlUsd).toBeCloseTo(60, 9);
	});

	it("missing unrealized yields all-time total", () => {
		const metrics = computeOverviewMetricsFromRecords(
			[{ pnlSol: "1", pnlUsd: "10", closedAt: nowSec }],
			[],
			1,
			{ totalPnlSol: "100", totalPnlUsd: "1000" },
			null,
			"sol",
			{ kind: "all" },
		);
		expect(metrics.netPnlSol).toBeCloseTo(100, 9);
		expect(metrics.netPnlUsd).toBeCloseTo(1000, 9);
	});
});

describe("computeClosedAggregates", () => {
	it("sums SOL and USD deposits and fees across pools", () => {
		const aggregates = computeClosedAggregates([
			closedPool({
				poolAddress: "A",
				totalDeposit: "10",
				totalDepositSol: "1",
				totalFee: "0.5",
				totalFeeSol: "0.05",
			}),
			closedPool({
				poolAddress: "B",
				totalDeposit: "20",
				totalDepositSol: "2",
				totalFee: "1.5",
				totalFeeSol: "0.15",
			}),
		]);
		expect(aggregates.count).toBe(2);
		expect(aggregates.totalDepositUsd).toBeCloseTo(30, 9);
		expect(aggregates.totalDepositSol).toBeCloseTo(3, 9);
		expect(aggregates.totalFeeUsd).toBeCloseTo(2, 9);
		expect(aggregates.totalFeeSol).toBeCloseTo(0.2, 9);
	});

	it("treats non-numeric deposits and fees as zero without NaN", () => {
		const aggregates = computeClosedAggregates([
			closedPool({
				poolAddress: "A",
				totalDeposit: "abc",
				totalDepositSol: undefined,
				totalFee: "",
				totalFeeSol: "NaN",
			}),
			closedPool({
				poolAddress: "B",
				totalDeposit: "5",
				totalDepositSol: "0.5",
				totalFee: "1",
				totalFeeSol: "0.1",
			}),
		]);
		expect(aggregates.count).toBe(2);
		expect(aggregates.totalDepositUsd).toBeCloseTo(5, 9);
		expect(aggregates.totalDepositSol).toBeCloseTo(0.5, 9);
		expect(aggregates.totalFeeUsd).toBeCloseTo(1, 9);
		expect(aggregates.totalFeeSol).toBeCloseTo(0.1, 9);
	});
});
