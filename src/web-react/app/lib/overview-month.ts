import type { ClosedPool } from "@vexis/domain/portfolio.js";
import type { PositionPnLData } from "@vexis/domain/position.js";

export type OverviewClosedResponse =
	| {
			ok: true;
			pools: readonly ClosedPool[];
			positions: readonly PositionPnLData[];
			byMonth: Readonly<Record<string, readonly PositionPnLData[]>>;
			totalCount: number;
			totalPositions: number;
	  }
	| { ok: false; error: string };

export interface MonthStoreItem {
	readonly key: string;
	readonly data: readonly PositionPnLData[];
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
