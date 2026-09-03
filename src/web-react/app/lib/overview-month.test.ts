import { describe, expect, it } from "vitest";
import {
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
