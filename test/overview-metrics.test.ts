import { describe, expect, it } from "vitest";
import type { ClosedPool } from "../src/domain/portfolio.js";
import {
	computeClosedAggregates,
	computeOverviewMetricsFromRecords,
} from "../src/web-react/app/lib/overview-analytics.js";

const day = (y: number, m: number, d: number, h = 12) =>
	Math.floor(Date.UTC(y, m - 1, d, h) / 1000);

function closedPool(
	over: Partial<ClosedPool> & { poolAddress: string },
): ClosedPool {
	return {
		binStep: 10,
		baseFee: 1,
		lastClosedAt: day(2026, 1, 10),
		tokenX: "SOL",
		tokenY: "USDC",
		tokenXMint: "mintX",
		tokenYMint: "mintY",
		totalDeposit: "10",
		totalWithdrawal: "9",
		totalFee: "0.1",
		pnlUsd: "1",
		pnlSol: "0.01",
		pnlSolPctChange: "1",
		pnlPctChange: "1",
		...over,
	};
}

describe("day win % for all-time", () => {
	it("aggregates calendar days instead of last-24h positions", () => {
		const metrics = computeOverviewMetricsFromRecords(
			[
				{ pnlSol: "1", pnlUsd: "100", closedAt: day(2026, 1, 5, 10) },
				{ pnlSol: "-0.2", pnlUsd: "-20", closedAt: day(2026, 1, 5, 15) },
				{ pnlSol: "-0.5", pnlUsd: "-50", closedAt: day(2026, 1, 6, 10) },
			],
			[],
			3,
			null,
			null,
			"sol",
			{ kind: "all" },
		);
		expect(metrics.dayWins).toBe(1);
		expect(metrics.dayLosses).toBe(1);
		expect(metrics.dayWinPct).toBeCloseTo(50, 10);
	});
});

describe("computeClosedAggregates", () => {
	it("sums deposits, withdrawals, and fees per currency", () => {
		const agg = computeClosedAggregates([
			closedPool({
				poolAddress: "A",
				totalDeposit: "100",
				totalWithdrawal: "90",
				totalFee: "1",
				totalDepositSol: "10",
				totalWithdrawalSol: "9",
				totalFeeSol: "0.1",
			}),
			closedPool({
				poolAddress: "B",
				totalDeposit: "200",
				totalWithdrawal: "190",
				totalFee: "2",
				totalDepositSol: "20",
				totalWithdrawalSol: "19",
				totalFeeSol: "0.2",
			}),
		]);
		expect(agg.pools).toBe(2);
		expect(agg.depositsSol).toBeCloseTo(30, 10);
		expect(agg.withdrawalsSol).toBeCloseTo(28, 10);
		expect(agg.feesSol).toBeCloseTo(0.3, 10);
		expect(agg.depositsUsd).toBeCloseTo(300, 10);
		expect(agg.withdrawalsUsd).toBeCloseTo(280, 10);
		expect(agg.feesUsd).toBeCloseTo(3, 10);
	});

	it("returns zeros for an empty list", () => {
		const agg = computeClosedAggregates([]);
		expect(agg.pools).toBe(0);
		expect(agg.depositsSol).toBe(0);
		expect(agg.withdrawalsSol).toBe(0);
		expect(agg.feesSol).toBe(0);
	});
});
