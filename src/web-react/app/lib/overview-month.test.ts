import { describe, expect, it } from "vitest";
import {
	allTimeMonthKeys,
	type OverviewClosedResponse,
	resolveMonthStoreUpdate,
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
