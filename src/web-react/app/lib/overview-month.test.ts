import { describe, expect, it } from "vitest";
import {
	adjacentMonthKeys,
	allTimeMonthKeys,
	type OverviewClosedResponse,
	resolveMonthStoreUpdate,
	selectCalendarPositions,
} from "./overview-month";

function okResponse(
	byMonth: Record<string, never[]>,
	positions: never[] = [],
): OverviewClosedResponse {
	return {
		ok: true,
		pools: [],
		positions,
		byMonth,
		totalCount: 0,
		totalPositions: 0,
		apiTotalPositions: 0,
	};
}

describe("resolveMonthStoreUpdate", () => {
	it("ignores the pre-request idle response", () => {
		const stale = okResponse({ "2026-09": [] });
		expect(resolveMonthStoreUpdate("2026-08", stale, stale)).toBeNull();
		expect(resolveMonthStoreUpdate("2026-08", stale, undefined)).toBeNull();
	});

	it("stores the server bucket keys, not the requested month", () => {
		const pos = { closedAt: 1_756_704_000, pnlSol: "1" } as never;
		const fresh: OverviewClosedResponse = {
			ok: true,
			pools: [],
			positions: [pos] as never,
			byMonth: { "2026-08": [pos] } as never,
			totalCount: 1,
			totalPositions: 1,
			apiTotalPositions: 1,
		};
		const stale = okResponse({ "2026-09": [] });
		expect(resolveMonthStoreUpdate("2026-08", stale, fresh)).toEqual([
			{ key: "2026-08", data: [pos] },
		]);
	});

	it("marks an empty month loaded under the requested key", () => {
		const fresh = okResponse({});
		expect(resolveMonthStoreUpdate("2026-08", undefined, fresh)).toEqual([
			{ key: "2026-08", data: [] },
		]);
	});

	it("clears the pending month without storing on error", () => {
		const err: OverviewClosedResponse = { ok: false, error: "boom" };
		expect(resolveMonthStoreUpdate("2026-08", undefined, err)).toEqual([]);
	});
});

describe("allTimeMonthKeys", () => {
	const ts = (y: number, m: number, d: number) =>
		Math.floor(Date.UTC(y, m - 1, d) / 1000);

	it("spans earliest close month to now ascending", () => {
		expect(
			allTimeMonthKeys(
				[{ lastClosedAt: ts(2026, 5, 10) }, { lastClosedAt: ts(2026, 9, 3) }],
				new Date(Date.UTC(2026, 8, 4)),
			),
		).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
	});

	it("returns empty without dated pools", () => {
		expect(allTimeMonthKeys([], new Date())).toEqual([]);
		expect(
			allTimeMonthKeys(
				[{ lastClosedAt: null }],
				new Date(Date.UTC(2026, 8, 4)),
			),
		).toEqual([]);
	});
});

describe("selectCalendarPositions", () => {
	it("selects Aug+Sep+Oct entries in order for Sep 2026", () => {
		const aug = { id: "aug" } as never;
		const sep = { id: "sep" } as never;
		const oct = { id: "oct" } as never;
		const entries = {
			"2026-08": { data: [aug] },
			"2026-09": { data: [sep] },
			"2026-10": { data: [oct] },
		} as never;
		expect(selectCalendarPositions(entries, "2026-09")).toEqual([
			aug,
			sep,
			oct,
		]);
	});

	it("returns the rest without throwing when prev month is missing", () => {
		const sep = { id: "sep" } as never;
		const oct = { id: "oct" } as never;
		const entries = {
			"2026-09": { data: [sep] },
			"2026-10": { data: [oct] },
		} as never;
		expect(selectCalendarPositions(entries, "2026-09")).toEqual([sep, oct]);
	});

	it('yields Dec/Feb rollover for "2026-01"', () => {
		expect(adjacentMonthKeys("2026-01")).toEqual([
			"2025-12",
			"2026-01",
			"2026-02",
		]);
	});

	it("returns empty for empty entries", () => {
		expect(selectCalendarPositions({}, "2026-09")).toEqual([]);
	});
});
