import { describe, expect, it } from "vitest";
import { buildDailyBuckets, poolDelta, positionDelta } from "./cumulative-pnl";

const day = (y: number, m: number, d: number) =>
	Math.floor(Date.UTC(y, m - 1, d) / 1000);

describe("positionDelta", () => {
	it("returns null without a close timestamp", () => {
		expect(
			positionDelta(
				{
					closedAt: null,
					pnlSol: "1",
					pnlUsd: "2",
					allTimeFees: { total: { sol: "0.1", usd: "1" } } as never,
				},
				"sol",
				"total",
			),
		).toBeNull();
	});

	it("picks fees or total in the requested currency", () => {
		const pos = {
			closedAt: day(2026, 8, 1),
			pnlSol: "1.5",
			pnlUsd: "150",
			allTimeFees: { total: { sol: "0.1", usd: "10" } },
		} as never;
		expect(positionDelta(pos, "sol", "total")).toEqual({
			ts: day(2026, 8, 1),
			delta: 1.5,
		});
		expect(positionDelta(pos, "usd", "fees")).toEqual({
			ts: day(2026, 8, 1),
			delta: 10,
		});
	});
});

describe("poolDelta", () => {
	it("falls back to totalFee when totalFeeSol is missing", () => {
		const ts = day(2026, 8, 1);
		expect(
			poolDelta(
				{ lastClosedAt: ts, pnlSol: "2", pnlUsd: "200", totalFee: "0.5" },
				"sol",
				"fees",
			),
		).toEqual({ ts, delta: 0.5 });
		expect(
			poolDelta(
				{
					lastClosedAt: ts,
					pnlSol: "2",
					pnlUsd: "200",
					totalFee: "0.5",
					totalFeeSol: "0.3",
				},
				"sol",
				"fees",
			),
		).toEqual({ ts, delta: 0.3 });
	});

	it("returns null without lastClosedAt", () => {
		expect(
			poolDelta(
				{ lastClosedAt: null, pnlSol: "2", pnlUsd: "200", totalFee: "0.5" },
				"sol",
				"total",
			),
		).toBeNull();
	});
});

describe("buildDailyBuckets", () => {
	it("fills zero gaps between first and last day", () => {
		const buckets = buildDailyBuckets(
			[
				{ ts: day(2026, 8, 1), delta: 1 },
				{ ts: day(2026, 8, 3), delta: 2 },
			],
			"daily",
		);
		expect(buckets.map((b) => b.value)).toEqual([1, 0, 2]);
		expect(buckets).toHaveLength(3);
	});

	it("caps weekly and monthly views at twelve buckets", () => {
		const deltas = Array.from({ length: 30 }, (_, i) => ({
			ts: day(2026, 1, 1) + i * 7 * 86400,
			delta: 1,
		}));
		expect(buildDailyBuckets(deltas, "weekly").length).toBeLessThanOrEqual(12);
		expect(buildDailyBuckets(deltas, "monthly").length).toBeLessThanOrEqual(12);
	});

	it("returns empty for empty input", () => {
		expect(buildDailyBuckets([], "daily")).toEqual([]);
	});
});
