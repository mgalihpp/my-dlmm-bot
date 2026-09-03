import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ClosedPool } from "../src/domain/portfolio.js";
import type { MeteoraApiService } from "../src/services/MeteoraApi.js";
import {
	buildOverviewCacheKey,
	closedPoolPositionsCacheKey,
	dedupeClosedPools,
	fetchOverviewClosedCore,
	isImmutableRange,
	isPastMonthOpts,
	startOfTodayUtcSec,
} from "../src/web-react/app/lib/server/portfolio.server.js";

function pool(address: string): ClosedPool {
	return {
		poolAddress: address,
		binStep: 10,
		baseFee: 1,
		lastClosedAt: 1_700_000_000,
		tokenX: "SOL",
		tokenY: "USDC",
		tokenXMint: "mintX",
		tokenYMint: "mintY",
		totalDeposit: "1",
		totalWithdrawal: "1",
		totalFee: "0.01",
		pnlUsd: "1",
		pnlSol: "0.01",
		pnlSolPctChange: "1",
		pnlPctChange: "1",
	};
}

describe("buildOverviewCacheKey", () => {
	it("keys the fast pools-only summary separately from full fetches", () => {
		expect(buildOverviewCacheKey("W", { poolsOnly: true })).toBe(
			"W:pools-only",
		);
		expect(buildOverviewCacheKey("W")).toBe("W:all");
		expect(buildOverviewCacheKey("W", { month: "2026-07" })).toBe("W:2026-07");
		expect(buildOverviewCacheKey("W", { day: "2026-07-01" })).toBe(
			"W:2026-07-01",
		);
	});
});

describe("isPastMonthOpts", () => {
	it("treats only past months as immutable", () => {
		expect(isPastMonthOpts({ month: "2026-07" }, "2026-08")).toBe(true);
		expect(isPastMonthOpts({ month: "2026-08" }, "2026-08")).toBe(false);
		expect(isPastMonthOpts({ month: "2026-09" }, "2026-08")).toBe(false);
		expect(
			isPastMonthOpts({ month: "2026-07", poolsOnly: true }, "2026-08"),
		).toBe(false);
		expect(isPastMonthOpts({ day: "2026-07-01" }, "2026-08")).toBe(false);
		expect(isPastMonthOpts(undefined, "2026-08")).toBe(false);
	});
});

describe("dedupeClosedPools", () => {
	it("drops pagination duplicates keeping first-seen order", () => {
		const out = dedupeClosedPools([pool("A"), pool("B"), pool("A")]);
		expect(out.map((p) => p.poolAddress)).toEqual(["A", "B"]);
	});

	it("passes through empty and unique lists", () => {
		expect(dedupeClosedPools([])).toEqual([]);
		expect(dedupeClosedPools([pool("A")]).map((p) => p.poolAddress)).toEqual([
			"A",
		]);
	});
});

describe("startOfTodayUtcSec", () => {
	it("truncates to UTC midnight", () => {
		expect(startOfTodayUtcSec(Date.UTC(2026, 7, 15, 12, 30))).toBe(
			Date.UTC(2026, 7, 15) / 1000,
		);
	});
});

describe("isImmutableRange", () => {
	const nowMs = Date.UTC(2026, 8, 3, 12, 0);
	const march = {
		start: Date.UTC(2026, 2, 1) / 1000,
		end: Date.UTC(2026, 3, 1) / 1000,
	};
	const september = {
		start: Date.UTC(2026, 8, 1) / 1000,
		end: Date.UTC(2026, 9, 1) / 1000,
	};

	it("caches ranges that ended before today", () => {
		expect(isImmutableRange(march, nowMs)).toBe(true);
	});

	it("refetches the current month and unbounded queries", () => {
		expect(isImmutableRange(september, nowMs)).toBe(false);
		expect(isImmutableRange(null, nowMs)).toBe(false);
	});
});

describe("closedPoolPositionsCacheKey", () => {
	it("scopes pool entries per wallet", () => {
		expect(closedPoolPositionsCacheKey("W1", "P")).not.toBe(
			closedPoolPositionsCacheKey("W2", "P"),
		);
	});
});

const sec = (y: number, m: number, d: number) =>
	Math.floor(Date.UTC(y, m - 1, d) / 1000);

function stubApi(
	pools: ClosedPool[],
	positionsByPool: Record<string, { closedAt: number }[]>,
	calls: { closed: unknown[][]; pnl: unknown[][] },
): MeteoraApiService {
	return {
		closedPortfolio: ((user: string, page = 1, pageSize = 50) => {
			calls.closed.push([user, page, pageSize]);
			const start = (page - 1) * pageSize;
			const slice = pools.slice(start, start + pageSize);
			return Effect.succeed({
				hasNext: start + pageSize < pools.length,
				page,
				pageSize,
				totalCount: pools.length,
				totalPositions: pools.length,
				pools: slice,
			});
		}) as MeteoraApiService["closedPortfolio"],
		positionPnl: ((
			poolAddress: string,
			user: string,
			status = "all",
			page = 1,
			pageSize = 100,
		) => {
			calls.pnl.push([poolAddress, user, status, page, pageSize]);
			const all = (positionsByPool[poolAddress] ?? []).map((p, i) => ({
				positionAddress: `${poolAddress}-pos-${i}`,
				isClosed: true,
				closedAt: p.closedAt,
			}));
			const start = (page - 1) * pageSize;
			return Effect.succeed({
				positions: all.slice(start, start + pageSize),
				hasNext: start + pageSize < all.length,
				totalCount: all.length,
			});
		}) as MeteoraApiService["positionPnl"],
	} as MeteoraApiService;
}

describe("fetchOverviewClosedCore with per-pool cache", () => {
	const pools = [
		{ ...pool("A"), lastClosedAt: sec(2026, 9, 2) },
		{ ...pool("B"), lastClosedAt: sec(2026, 4, 5) },
		{ ...pool("C"), lastClosedAt: sec(2026, 1, 10) },
	];
	const positionsByPool = {
		A: [{ closedAt: sec(2026, 9, 2) }],
		B: [{ closedAt: sec(2026, 4, 5) }],
		C: [{ closedAt: sec(2026, 1, 10) }],
	};
	const march = { start: sec(2026, 3, 1), end: sec(2026, 4, 1) };
	const april = { start: sec(2026, 4, 1), end: sec(2026, 5, 1) };

	it("scans only candidate pools and serves repeats from cache", async () => {
		const wallet = "cache-warm-wallet";
		const calls: { closed: unknown[][]; pnl: unknown[][] } = {
			closed: [],
			pnl: [],
		};
		const api = stubApi(pools, positionsByPool, calls);

		const cold = await Effect.runPromise(
			fetchOverviewClosedCore(api, wallet, march, false, true),
		);
		expect(cold.positions).toEqual([]);
		expect(cold.totalPositions).toBe(0);
		expect(cold.pools.map((p) => p.poolAddress)).toEqual(["A", "B", "C"]);
		const pnlPools = calls.pnl.map((c) => c[0]);
		expect(pnlPools).toContain("A");
		expect(pnlPools).toContain("B");
		expect(pnlPools).not.toContain("C");
		const closedCalls = calls.closed.length;
		const pnlCalls = calls.pnl.length;

		const warm = await Effect.runPromise(
			fetchOverviewClosedCore(api, wallet, march, false, true),
		);
		expect(warm).toEqual(cold);
		expect(calls.closed.length).toBe(closedCalls);
		expect(calls.pnl.length).toBe(pnlCalls);

		const aprilRes = await Effect.runPromise(
			fetchOverviewClosedCore(api, wallet, april, false, true),
		);
		expect(aprilRes.totalPositions).toBe(1);
		expect(aprilRes.positions[0]?.closedAt).toBe(sec(2026, 4, 5));
		expect(calls.closed.length).toBe(closedCalls);
		expect(calls.pnl.length).toBe(pnlCalls);
	});

	it("bypasses the cache when asked for fresh data", async () => {
		const wallet = "cache-bypass-wallet";
		const calls: { closed: unknown[][]; pnl: unknown[][] } = {
			closed: [],
			pnl: [],
		};
		const api = stubApi(pools, positionsByPool, calls);

		await Effect.runPromise(
			fetchOverviewClosedCore(api, wallet, march, false, true),
		);
		const pnlCalls = calls.pnl.length;
		await Effect.runPromise(
			fetchOverviewClosedCore(api, wallet, march, false, false),
		);
		expect(calls.pnl.length).toBeGreaterThan(pnlCalls);
	});
});

describe("fetchOverviewClosedCore apiTotalPositions", () => {
	it("propagates the API position count on the pools-only path", async () => {
		const pools = [
			{ ...pool("A"), lastClosedAt: sec(2026, 9, 2) },
			{ ...pool("B"), lastClosedAt: sec(2026, 4, 5) },
		];
		const calls: { closed: unknown[][]; pnl: unknown[][] } = {
			closed: [],
			pnl: [],
		};
		const api = {
			closedPortfolio: ((user: string, page = 1, pageSize = 50) => {
				calls.closed.push([user, page, pageSize]);
				const start = (page - 1) * pageSize;
				return Effect.succeed({
					hasNext: false,
					page,
					pageSize,
					totalCount: pools.length,
					totalPositions: 7,
					pools: pools.slice(start, start + pageSize),
				});
			}) as MeteoraApiService["closedPortfolio"],
			positionPnl:
				stubApi(pools, {}, calls)
					.positionPnl as MeteoraApiService["positionPnl"],
		} as MeteoraApiService;

		const res = await Effect.runPromise(
			fetchOverviewClosedCore(api, "positions-wallet", null, true, false),
		);
		expect(res.totalCount).toBe(2);
		expect(res.apiTotalPositions).toBe(7);
	});
});
