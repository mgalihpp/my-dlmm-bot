import type { PositionPnLData } from "@vexis/domain/position.js";
import type { Currency } from "./currency.js";

export type CalendarCell = {
	day: number;
	inMonth: boolean;
	date: Date;
	pnl: number | null;
	count: number | null;
	winPct: number | null;
};

export type WeekBucket = {
	index: number;
	label: string;
	pnl: number | null;
	days: number;
	hasData: boolean;
};

function startOfMonth(date: Date) {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function daysInMonth(date: Date) {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
	).getUTCDate();
}

function dateKey(d: Date) {
	return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function toCell(
	date: Date,
	inMonth: boolean,
	entry: { pnl: number; count: number; wins: number } | undefined,
): CalendarCell {
	if (!entry) {
		return {
			day: date.getUTCDate(),
			inMonth,
			date,
			pnl: null,
			count: null,
			winPct: null,
		};
	}
	return {
		day: date.getUTCDate(),
		inMonth,
		date,
		pnl: entry.pnl,
		count: entry.count,
		winPct: entry.count ? (entry.wins / entry.count) * 100 : null,
	};
}

export function buildCalendarCells(
	closed: readonly PositionPnLData[],
	month: Date,
	mode: "fees" | "total",
	currency: Currency,
): { cells: CalendarCell[]; monthlyPnl: number; monthlyDays: number } {
	const year = month.getUTCFullYear();
	const mon = month.getUTCMonth();
	const dim = daysInMonth(month);
	const firstDow = startOfMonth(month).getUTCDay();
	const byDate = new Map<
		string,
		{ pnl: number; count: number; wins: number }
	>();
	let monthlyPnl = 0;
	const seenDays = new Set<string>();
	const getVal = (p: PositionPnLData) => {
		if (mode === "fees") {
			return (
				Number(
					currency === "sol"
						? (p.allTimeFees.total.sol ?? "0")
						: p.allTimeFees.total.usd,
				) || 0
			);
		}
		return Number(currency === "sol" ? (p.pnlSol ?? "0") : p.pnlUsd) || 0;
	};
	for (const pos of closed) {
		if (pos.closedAt == null) continue;
		const d = new Date(pos.closedAt * 1000);
		const val = getVal(pos);
		const key = dateKey(d);
		const entry = byDate.get(key) ?? { pnl: 0, count: 0, wins: 0 };
		entry.pnl += val;
		entry.count += 1;
		if (val > 0) entry.wins += 1;
		byDate.set(key, entry);
		if (d.getUTCFullYear() === year && d.getUTCMonth() === mon) {
			monthlyPnl += val;
			seenDays.add(key);
		}
	}
	const cells: CalendarCell[] = [];
	for (let off = firstDow; off > 0; off--) {
		const date = new Date(Date.UTC(year, mon, 1 - off));
		cells.push(toCell(date, false, byDate.get(dateKey(date))));
	}
	for (let d = 1; d <= dim; d++) {
		const date = new Date(Date.UTC(year, mon, d));
		cells.push(toCell(date, true, byDate.get(dateKey(date))));
	}
	let nextDay = 1;
	while (cells.length % 7 !== 0) {
		const date = new Date(Date.UTC(year, mon + 1, nextDay++));
		cells.push(toCell(date, false, byDate.get(dateKey(date))));
	}
	return { cells, monthlyPnl, monthlyDays: seenDays.size };
}

export function computeWeekBuckets(cells: CalendarCell[]): WeekBucket[] {
	const weekCount = Math.ceil(cells.length / 7);
	const buckets: WeekBucket[] = [];
	for (let w = 0; w < weekCount; w++) {
		const slice = cells.slice(w * 7, w * 7 + 7);
		let pnl: number | null = null;
		let days = 0;
		let hasData = false;
		for (const c of slice) {
			if (c.pnl != null) {
				days += 1;
				hasData = true;
				pnl = (pnl ?? 0) + c.pnl;
			}
		}
		buckets.push({
			index: w,
			label: `Week ${w + 1}`,
			pnl,
			days,
			hasData,
		});
	}
	return buckets;
}

export type WeeklyDayRow = {
	date: Date;
	pnl: number | null;
	count: number | null;
	winPct: number | null;
};

export type WeeklyStats = {
	start: Date;
	end: Date;
	rangeLabel: string;
	pnl: number;
	fees: number;
	deposits: number;
	withdrawals: number;
	count: number;
	winRate: number | null;
	daysWithData: number;
	days: WeeklyDayRow[];
};

export function buildWeeklyStats(
	closed: readonly PositionPnLData[],
	weekCells: readonly CalendarCell[],
	currency: Currency,
	mode: "fees" | "total",
): WeeklyStats {
	const sorted = [...weekCells].sort(
		(a, b) => a.date.getTime() - b.date.getTime(),
	);
	const start = sorted[0]?.date ?? new Date(0);
	const end = sorted[sorted.length - 1]?.date ?? new Date(0);
	const days: WeeklyDayRow[] = weekCells.map((c) => ({
		date: c.date,
		pnl: c.pnl,
		count: c.count,
		winPct: c.winPct,
	}));
	const daysWithData = days.filter((d) => d.pnl != null).length;
	const startPart = start.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
	const endPart = end.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
	const rangeLabel = `${startPart} - ${endPart}`;
	const startDay = Date.UTC(
		start.getUTCFullYear(),
		start.getUTCMonth(),
		start.getUTCDate(),
	);
	const endExclusive =
		Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) +
		86_400_000;
	let pnl = 0;
	let fees = 0;
	let deposits = 0;
	let withdrawals = 0;
	let count = 0;
	let wins = 0;
	for (const p of closed) {
		if (p.closedAt == null) continue;
		const ts = p.closedAt * 1000;
		if (ts < startDay || ts >= endExclusive) continue;
		const pnlVal =
			Number(currency === "sol" ? (p.pnlSol ?? "0") : p.pnlUsd) || 0;
		const feeVal =
			Number(
				currency === "sol"
					? (p.allTimeFees.total.sol ?? "0")
					: p.allTimeFees.total.usd,
			) || 0;
		const depVal =
			Number(
				currency === "sol"
					? (p.allTimeDeposits.total.sol ?? "0")
					: p.allTimeDeposits.total.usd,
			) || 0;
		const wdVal =
			Number(
				currency === "sol"
					? (p.allTimeWithdrawals.total.sol ?? "0")
					: p.allTimeWithdrawals.total.usd,
			) || 0;
		pnl += pnlVal;
		fees += feeVal;
		deposits += depVal;
		withdrawals += wdVal;
		count += 1;
		if ((mode === "fees" ? feeVal : pnlVal) > 0) wins += 1;
	}
	return {
		start,
		end,
		rangeLabel,
		pnl,
		fees,
		deposits,
		withdrawals,
		count,
		winRate: count ? (wins / count) * 100 : null,
		daysWithData,
		days,
	};
}
