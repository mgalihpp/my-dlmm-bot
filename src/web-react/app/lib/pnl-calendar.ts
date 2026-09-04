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
