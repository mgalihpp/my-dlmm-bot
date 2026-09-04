import type { PositionPnLData } from "@vexis/domain/position.js";
import { describe, expect, it } from "vitest";
import { buildCalendarCells, computeWeekBuckets } from "./pnl-calendar.js";

function pos(utcDate: Date, pnlSol: string): PositionPnLData {
	return {
		positionAddress: "test",
		minPrice: "0",
		maxPrice: "1",
		lowerBinId: 0,
		upperBinId: 1,
		feePerTvl24h: "0",
		isClosed: true,
		pnlUsd: "0",
		pnlPctChange: "0",
		pnlSol,
		allTimeDeposits: {
			tokenX: { amount: "0", usd: "0" },
			tokenY: { amount: "0", usd: "0" },
			total: { usd: "0", sol: "0" },
		},
		allTimeWithdrawals: {
			tokenX: { amount: "0", usd: "0" },
			tokenY: { amount: "0", usd: "0" },
			total: { usd: "0", sol: "0" },
		},
		allTimeFees: {
			tokenX: { amount: "0", usd: "0" },
			tokenY: { amount: "0", usd: "0" },
			total: { usd: "0", sol: "0" },
		},
		closedAt: Math.floor(utcDate.getTime() / 1000),
		createdAt: Math.floor(utcDate.getTime() / 1000),
		isOutOfRange: false,
		poolActiveBinId: 0,
		poolActivePrice: "0",
	} as PositionPnLData;
}

const utc = (y: number, m: number, d: number) =>
	new Date(Date.UTC(y, m, d, 12));

describe("pnl calendar adjacent-month days (issue 63)", () => {
	const month = new Date(Date.UTC(2026, 8, 1));
	const closed = [
		pos(utc(2026, 7, 30), "0.05"),
		pos(utc(2026, 7, 31), "-0.03"),
		pos(utc(2026, 8, 1), "0.01"),
		pos(utc(2026, 8, 4), "-0.19"),
		pos(utc(2026, 9, 3), "0.07"),
	];

	it("fills leading Sun/Mon with August PnL instead of empty cells", () => {
		const { cells } = buildCalendarCells(closed, month, "total", "sol");
		expect(cells[0]?.day).toBe(30);
		expect(cells[0]?.inMonth).toBe(false);
		expect(cells[0]?.pnl).toBeCloseTo(0.05, 9);
		expect(cells[1]?.day).toBe(31);
		expect(cells[1]?.inMonth).toBe(false);
		expect(cells[1]?.pnl).toBeCloseTo(-0.03, 9);
		expect(cells[2]?.day).toBe(1);
		expect(cells[2]?.inMonth).toBe(true);
	});

	it("fills trailing cells with October PnL instead of empty cells", () => {
		const { cells } = buildCalendarCells(closed, month, "total", "sol");
		const last = cells[cells.length - 1];
		expect(cells.length % 7).toBe(0);
		expect(last?.day).toBe(3);
		expect(last?.inMonth).toBe(false);
		expect(last?.pnl).toBeCloseTo(0.07, 9);
	});

	it("includes adjacent days in week buckets", () => {
		const { cells } = buildCalendarCells(closed, month, "total", "sol");
		const weeks = computeWeekBuckets(cells);
		expect(weeks[0]?.pnl).toBeCloseTo(0.05 - 0.03 + 0.01 - 0.19, 9);
		expect(weeks[0]?.days).toBe(4);
	});

	it("keeps monthly stats scoped to the current month", () => {
		const { monthlyPnl, monthlyDays } = buildCalendarCells(
			closed,
			month,
			"total",
			"sol",
		);
		expect(monthlyPnl).toBeCloseTo(0.01 - 0.19, 9);
		expect(monthlyDays).toBe(2);
	});
});
