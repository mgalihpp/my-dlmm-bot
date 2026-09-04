import type { PositionPnLData } from "@vexis/domain/position.js";
import { describe, expect, it } from "vitest";
import type { CalendarCell } from "./pnl-calendar.js";
import { buildCalendarCells, buildWeeklyStats, computeWeekBuckets } from "./pnl-calendar.js";

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

describe("buildWeeklyStats", () => {
	function posWeekly(utcDate: Date, pnlSol: string, feesSol: string): PositionPnLData {
		const base = pos(utcDate, pnlSol);
		return {
			...base,
			allTimeFees: {
				tokenX: { amount: "0", usd: "0" },
				tokenY: { amount: "0", usd: "0" },
				total: { usd: "0", sol: feesSol },
			},
		};
	}

	function weekCellsFor(dates: Date[]): CalendarCell[] {
		return dates.map((date) => ({
			day: date.getUTCDate(),
			inMonth: true,
			date,
			pnl: null,
			count: null,
			winPct: null,
		}));
	}

	it("includes positions from both months in a week spanning the Aug/Sep boundary", () => {
		const month = new Date(Date.UTC(2026, 8, 1));
		const closed = [pos(utc(2026, 7, 31), "0.05"), pos(utc(2026, 8, 1), "0.01")];
		const { cells } = buildCalendarCells(closed, month, "total", "sol");
		const idx = cells.findIndex(
			(c) => c.date.getUTCMonth() === 7 && c.date.getUTCDate() === 31,
		);
		expect(idx).toBeGreaterThanOrEqual(0);
		const rowStart = Math.floor(idx / 7) * 7;
		const slice = cells.slice(rowStart, rowStart + 7);
		expect(slice.some((c) => c.date.getUTCMonth() === 8 && c.date.getUTCDate() === 1)).toBe(true);
		const stats = buildWeeklyStats(closed, slice, "sol", "total");
		expect(stats.pnl).toBeCloseTo(0.06, 9);
		expect(stats.count).toBe(2);
		expect(stats.daysWithData).toBe(2);
	});

	it("counts wins on the displayed-mode value so fees and total headlines differ", () => {
		const dates = [0, 1, 2, 3, 4, 5, 6].map((d) => new Date(Date.UTC(2026, 8, d + 6)));
		const weekCells = weekCellsFor(dates);
		const closed = [posWeekly(utc(2026, 8, 7), "-0.5", "0.2")];
		const totalStats = buildWeeklyStats(closed, weekCells, "sol", "total");
		const feesStats = buildWeeklyStats(closed, weekCells, "sol", "fees");
		expect(totalStats.pnl).toBeCloseTo(-0.5, 9);
		expect(feesStats.fees).toBeCloseTo(0.2, 9);
		expect(totalStats.winRate).toBe(0);
		expect(feesStats.winRate).toBe(100);
		const totalHeadline = totalStats.pnl;
		const feesHeadline = feesStats.fees;
		expect(totalHeadline).not.toBeCloseTo(feesHeadline, 9);
	});

	it("reports rangeLabel, start, and end from the week cells", () => {
		const dates = [31, 1, 2, 3, 4, 5, 6].map((d, i) =>
			i === 0 ? new Date(Date.UTC(2026, 7, d)) : new Date(Date.UTC(2026, 8, d)),
		);
		const weekCells = weekCellsFor(dates);
		const stats = buildWeeklyStats([], weekCells, "sol", "total");
		expect(stats.start).toEqual(new Date(Date.UTC(2026, 7, 31)));
		expect(stats.end).toEqual(new Date(Date.UTC(2026, 8, 6)));
		expect(stats.rangeLabel).toBe("Aug 31 - Sep 6, 2026");
		expect(stats.days).toHaveLength(7);
		expect(stats.days[0]?.date).toEqual(new Date(Date.UTC(2026, 7, 31)));
	});

	it("ignores positions outside the week range", () => {
		const dates = [31, 1, 2, 3, 4, 5, 6].map((d, i) =>
			i === 0 ? new Date(Date.UTC(2026, 7, d)) : new Date(Date.UTC(2026, 8, d)),
		);
		const weekCells = weekCellsFor(dates);
		const closed = [
			pos(utc(2026, 8, 2), "0.4"),
			pos(utc(2026, 8, 20), "99"),
		];
		const stats = buildWeeklyStats(closed, weekCells, "sol", "total");
		expect(stats.pnl).toBeCloseTo(0.4, 9);
		expect(stats.count).toBe(1);
	});

	it("yields empty totals for a week with no positions", () => {
		const dates = [13, 14, 15, 16, 17, 18, 19].map((d) => new Date(Date.UTC(2026, 8, d)));
		const weekCells = weekCellsFor(dates);
		const stats = buildWeeklyStats([], weekCells, "sol", "total");
		expect(stats.pnl).toBe(0);
		expect(stats.fees).toBe(0);
		expect(stats.count).toBe(0);
		expect(stats.winRate).toBeNull();
		expect(stats.daysWithData).toBe(0);
	});
});
