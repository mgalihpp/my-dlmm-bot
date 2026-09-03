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
