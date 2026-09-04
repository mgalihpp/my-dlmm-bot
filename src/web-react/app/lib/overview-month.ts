import type { ClosedPool } from "@vexis/domain/portfolio.js";
import type { PositionPnLData } from "@vexis/domain/position.js";
import { formatLocalDateKey, monthKeysInRange } from "./date-range.js";
import type { LocalDate } from "./date-range.js";

export type OverviewClosedResponse =
	| {
			ok: true;
			pools: readonly ClosedPool[];
			positions: readonly PositionPnLData[];
			byMonth: Readonly<Record<string, readonly PositionPnLData[]>>;
			totalCount: number;
			totalPositions: number;
			apiTotalPositions: number;
	  }
	| { ok: false; error: string };

export interface MonthStoreItem {
	readonly key: string;
	readonly data: readonly PositionPnLData[];
}

/**
 * Month keys spanning from the earliest closed pool to now, ascending.
 * Charts need every key cached before position-level views cover all-time.
 */
export function allTimeMonthKeys(
	closed: readonly Pick<ClosedPool, "lastClosedAt">[],
	now: Date,
): string[] {
	let minTs: number | null = null;
	for (const p of closed) {
		if (p.lastClosedAt == null) continue;
		if (minTs === null || p.lastClosedAt < minTs) minTs = p.lastClosedAt;
	}
	if (minTs === null) return [];
	const from = `${formatLocalDateKey(new Date(minTs * 1000)).slice(0, 7)}-01` as LocalDate;
	const to = formatLocalDateKey(now);
	return monthKeysInRange(from, to);
}
/**
 * Decides what a month-detail response means for the month cache.
 * Returns null while the fetcher still exposes the pre-request response
 * (same reference), so a previous month's idle payload is never stored
 * under the newly requested month. Returns an empty list on error.
 */
export function resolveMonthStoreUpdate(
	loadingMonth: string,
	dataAtRequest: OverviewClosedResponse | undefined,
	data: OverviewClosedResponse | undefined,
): MonthStoreItem[] | null {
	if (data === undefined || data === dataAtRequest) return null;
	if (data.ok !== true) return [];
	const months = Object.entries(data.byMonth);
	if (months.length > 0)
		return months.map(([key, monthData]) => ({ key, data: monthData }));
	return [{ key: loadingMonth, data: [] }];
}

export function adjacentMonthKeys(
	monthKey: string,
): [prev: string, current: string, next: string] {
	const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
	if (match === null) throw new RangeError("Invalid month key");
	const year = Number(match[1]);
	const monthIndex = Number(match[2]) - 1;
	if (monthIndex < 0 || monthIndex > 11)
		throw new RangeError("Invalid month key");
	const format = (date: Date) =>
		`${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
	const base = new Date(Date.UTC(year, monthIndex, 1));
	const prev = new Date(base);
	prev.setUTCMonth(prev.getUTCMonth() - 1);
	const next = new Date(base);
	next.setUTCMonth(next.getUTCMonth() + 1);
	return [format(prev), format(base), format(next)];
}

export function selectCalendarPositions(
	entries: Record<string, { data: readonly PositionPnLData[] } | undefined>,
	monthKey: string,
): readonly PositionPnLData[] {
	const [prev, current, next] = adjacentMonthKeys(monthKey);
	return [
		...(entries[prev]?.data ?? []),
		...(entries[current]?.data ?? []),
		...(entries[next]?.data ?? []),
	];
}
