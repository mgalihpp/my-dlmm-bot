import "~/lib/server/env.server";

import type {
	ClosedPool,
	OpenPool,
	OpenPortfolioTotals,
	PortfolioTotal,
} from "@vexis/domain/portfolio.js";
import type { PositionPnLData } from "@vexis/domain/position.js";
import { errorMessage } from "@vexis/errors.js";
import { AppLayer } from "@vexis/layers.js";
import { AppConfig } from "@vexis/services/Config.js";
import { Dlmm, type UserPositionLive } from "@vexis/services/Dlmm.js";
import {
	MeteoraApi,
	type MeteoraApiService,
} from "@vexis/services/MeteoraApi.js";
import { Effect } from "effect";
import { computeLiveMcap } from "~/lib/mcap";
import { resolveWebConfig } from "./config";
import { isoWeekToKey } from "./period.server";
import { createTtlCache } from "./ttl-cache.server";
import { isValidSolanaAddress } from "./validate.server";
export type OpenPoolWithIcons = OpenPool & {
	readonly tokenXIcon?: string | null;
	readonly tokenYIcon?: string | null;
	readonly mcap?: number | null;
};

export type ClosedPoolWithIcons = ClosedPool & {
	readonly tokenXIcon?: string | null;
	readonly tokenYIcon?: string | null;
};

export interface OverviewClosed {
	readonly pools: readonly ClosedPool[];
	readonly positions: readonly PositionPnLData[];
	readonly byMonth: Readonly<Record<string, readonly PositionPnLData[]>>;
	readonly totalCount: number;
	readonly totalPositions: number;
}

const OVERVIEW_CLOSED_TTL_MS = 60 * 1000;
const overviewClosedCache = createTtlCache<string, OverviewClosed>({
	ttlMs: OVERVIEW_CLOSED_TTL_MS,
});

function periodRangeFromOpts(opts?: {
	month?: string;
	day?: string;
	week?: string;
}): { start: number; end: number } | null {
	if (opts?.day) {
		const m = opts.day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!m) return null;
		const y = Number(m[1]);
		const mo = Number(m[2]);
		const d = Number(m[3]);
		if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
		const start = Math.floor(Date.UTC(y, mo - 1, d) / 1000);
		return { start, end: start + 86400 };
	}
	if (opts?.week) {
		let start: number | null = null;
		const dayMatch = opts.week.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (dayMatch) {
			const y = Number(dayMatch[1]);
			const mo = Number(dayMatch[2]);
			const d = Number(dayMatch[3]);
			start = Math.floor(Date.UTC(y, mo - 1, d) / 1000);
		} else {
			const iso = isoWeekToKey(opts.week);
			if (iso) {
				const mm = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
				if (mm)
					start = Math.floor(
						Date.UTC(Number(mm[1]), Number(mm[2]) - 1, Number(mm[3])) / 1000,
					);
			}
		}
		if (start == null) return null;
		return { start, end: start + 7 * 86400 };
	}
	if (!opts?.month) return null;
	const m = opts.month.match(/^(\d{4})-(\d{2})$/);
	if (!m) return null;
	const y = Number(m[1]);
	const mo = Number(m[2]);
	if (mo < 1 || mo > 12) return null;
	return {
		start: Math.floor(Date.UTC(y, mo - 1, 1) / 1000),
		end: Math.floor(Date.UTC(y, mo, 1) / 1000),
	};
}

export type { PortfolioTotal };

const EMPTY_TOTAL: PortfolioTotal = {
	totalPnlUsd: "-",
	totalPnlSol: "-",
	totalPnlPctChange: "-",
	totalPnlSolPctChange: "-",
};

export interface PortfolioSummary {
	readonly openBalanceUsd: number;
	readonly openBalanceSol: number;
	readonly openFeesUsd: number;
	readonly openFeesSol: number;
	readonly openPositionCount: number;
	readonly poolsCount: number;
	readonly outOfRangePositions: number;
	readonly outOfRangePools: number;
	readonly unrealizedUsd: number;
	readonly unrealizedSol: number;
	readonly unrealizedPct: number;
	readonly unrealizedSolPct: number;
}

function parseNum(value: string | null | undefined): number | null {
	const n = value == null ? NaN : parseFloat(value);
	return Number.isNaN(n) ? null : n;
}

function aggregateUnrealizedPct(
	open: readonly OpenPool[],
	pnlKey: "pnl" | "pnlSol",
	pctKey: "pnlPctChange" | "pnlSolPctChange",
): number {
	let num = 0;
	let den = 0;
	for (const pool of open) {
		const pnl = parseNum(pool[pnlKey]);
		const pct = parseNum(pool[pctKey]);
		if (pnl === null || pct === null || pct === 0 || pnl === 0) continue;
		num += pnl;
		den += pnl / pct;
	}
	return den === 0 ? 0 : num / den;
}

export function computePortfolioSummary(
	open: readonly OpenPool[],
	totals: OpenPortfolioTotals | null,
): PortfolioSummary {
	const openBalanceUsd = open.reduce(
		(sum, pool) => sum + (parseFloat(pool.balances) || 0),
		0,
	);
	const openFeesUsd = open.reduce(
		(sum, pool) => sum + (parseFloat(pool.unclaimedFees) || 0),
		0,
	);
	const openBalanceSol = parseNum(totals?.balancesSol) ?? 0;
	const openFeesSol = parseNum(totals?.unclaimedFeesSol) ?? 0;
	const unrealizedUsd =
		parseNum(totals?.pnl) ??
		open.reduce((sum, pool) => {
			const n = parseFloat(pool.pnl);
			return Number.isNaN(n) ? sum : sum + n;
		}, 0);
	const unrealizedSol =
		parseNum(totals?.pnlSol) ??
		open.reduce((sum, pool) => {
			if (pool.pnlSol == null) return sum;
			const n = parseFloat(pool.pnlSol);
			return Number.isNaN(n) ? sum : sum + n;
		}, 0);
	const unrealizedPct =
		parseNum(totals?.pnlPctChange) ??
		aggregateUnrealizedPct(open, "pnl", "pnlPctChange");
	const unrealizedSolPct =
		parseNum(totals?.pnlSolPctChange) ??
		aggregateUnrealizedPct(open, "pnlSol", "pnlSolPctChange");
	const openPositionCount = open.reduce(
		(sum, pool) => sum + pool.openPositionCount,
		0,
	);
	const outOfRangePositions = open.reduce(
		(sum, pool) => sum + pool.positionsOutOfRange.length,
		0,
	);
	const outOfRangePools = open.filter(
		(pool) => pool.outOfRange === true || pool.positionsOutOfRange.length > 0,
	).length;
	return {
		openBalanceUsd,
		openBalanceSol,
		openFeesUsd,
		openFeesSol,
		openPositionCount,
		poolsCount: open.length,
		outOfRangePositions,
		outOfRangePools,
		unrealizedUsd,
		unrealizedSol,
		unrealizedPct,
		unrealizedSolPct,
	};
}

export interface PortfolioPayload {
	readonly ok: boolean;
	readonly error?: string;
	readonly wallet?: string;
	readonly rpc?: string;
	readonly solPrice: number | null;
	readonly total?: PortfolioTotal;
	readonly summary?: PortfolioSummary;
	readonly pools?: readonly OpenPoolWithIcons[];
	readonly closed?: {
		readonly pools: readonly ClosedPoolWithIcons[];
		readonly page: number;
		readonly pageSize: number;
		readonly totalCount: number;
	};
}

function enrichWithIcons<T extends { readonly poolAddress: string }>(
	pools: readonly T[],
	api: MeteoraApiService,
	solPrice: number | null,
): Effect.Effect<
	Array<
		T & {
			tokenXIcon: string | null;
			tokenYIcon: string | null;
			mcap: number | null;
		}
	>
> {
	return Effect.gen(function* () {
		const unique = new Map<string, T>();
		for (const p of pools) {
			if (!unique.has(p.poolAddress)) unique.set(p.poolAddress, p);
		}
		const uniquePools = [...unique.values()];
		const fetched = new Map<
			string,
			{
				x: string | null;
				y: string | null;
				mcap: number | null;
				price: number | null;
			}
		>();
		yield* Effect.forEach(
			uniquePools,
			(pool) =>
				Effect.gen(function* () {
					const discovery = yield* api
						.discoveryPoolByAddress(pool.poolAddress)
						.pipe(Effect.either);
					if (discovery._tag === "Left") {
						fetched.set(pool.poolAddress, {
							x: null,
							y: null,
							mcap: null,
							price: null,
						});
						return;
					}
					const d = discovery.right;
					const snapshotMcap = d.token_x?.market_cap ?? null;
					const snapshotPrice = d.token_x?.price ?? null;
					fetched.set(pool.poolAddress, {
						x: d.token_x?.icon ?? null,
						y: d.token_y?.icon ?? null,
						mcap: snapshotMcap,
						price: snapshotPrice,
					});
				}),
			{ concurrency: 3 },
		);
		return pools.map((pool) => {
			const poolPrice = (pool as { poolPrice?: number }).poolPrice ?? null;
			const entry = fetched.get(pool.poolAddress);
			const baseMcap = entry?.mcap ?? null;
			const basePrice = entry?.price ?? null;
			return {
				...pool,
				tokenXIcon: entry?.x ?? null,
				tokenYIcon: entry?.y ?? null,
				mcap:
					computeLiveMcap(baseMcap, basePrice, poolPrice, solPrice) ?? baseMcap,
			};
		});
	});
}

export interface PortfolioCritical {
	readonly ok: true;
	readonly wallet: string;
	readonly rpc: string;
	readonly solPrice: number | null;
	readonly total: OpenPortfolioTotals | null;
	readonly summary: PortfolioSummary;
	readonly pools: readonly OpenPool[];
}
export interface PortfolioDeferred {
	readonly pools: readonly OpenPoolWithIcons[];
	readonly closed: {
		readonly pools: readonly ClosedPoolWithIcons[];
		readonly page: number;
		readonly pageSize: number;
		readonly totalCount: number;
	};
	readonly total: PortfolioTotal;
}

function fetchClosedPositionsUncached(
	wallet: string,
	periodRange: { start: number; end: number } | null,
): Promise<readonly PositionPnLData[]> {
	const fetchPositionsForPools = (
		pools: readonly ClosedPool[],
		api: MeteoraApiService,
		w: string,
	) =>
		Effect.forEach(
			pools,
			(pool) =>
				api.positionPnl(pool.poolAddress, w, "closed", 1, 100).pipe(
					Effect.flatMap((res) => {
						const first = (res.positions as PositionPnLData[]).filter(
							(p) => p.isClosed && p.closedAt != null,
						);
						if (!res.hasNext) return Effect.succeed(first);
						const remaining = Math.ceil(res.totalCount / 100) - 1;
						if (remaining <= 0) return Effect.succeed(first);
						const pageEffects = Array.from({ length: remaining }, (_, i) =>
							api.positionPnl(pool.poolAddress, w, "closed", i + 2, 100).pipe(
								Effect.map((r) =>
									(r.positions as PositionPnLData[]).filter(
										(p) => p.isClosed && p.closedAt != null,
									),
								),
								Effect.catchAll(() => Effect.succeed([] as PositionPnLData[])),
							),
						);
						return Effect.all(pageEffects, { concurrency: 3 }).pipe(
							Effect.map((pg) => [...first, ...pg.flat()]),
						);
					}),
					Effect.catchAll(() => Effect.succeed([] as PositionPnLData[])),
				),
			{ concurrency: 5 },
		).pipe(Effect.map((arr) => arr.flat() as PositionPnLData[]));

	const program = Effect.gen(function* () {
		const api = yield* MeteoraApi;
		const closedRes = yield* api
			.closedPortfolio(wallet, 1, 10)
			.pipe(Effect.catchAll(() => Effect.succeed(null)));
		if (closedRes === null || closedRes.totalCount === 0)
			return [] as PositionPnLData[];
		const pageSizeForAll = 50;
		const totalPages = Math.ceil(closedRes.totalCount / pageSizeForAll);
		const maxPages = Math.min(totalPages, 40);
		const poolEffects = Array.from({ length: maxPages }, (_, idx) =>
			api.closedPortfolio(wallet, idx + 1, pageSizeForAll).pipe(
				Effect.map((res) => res.pools as ClosedPool[]),
				Effect.catchAll(() => Effect.succeed([] as ClosedPool[])),
			),
		);
		const pages = yield* Effect.all(poolEffects, { concurrency: 3 });
		const rawPoolsAll = pages.flat() as ClosedPool[];
		if (rawPoolsAll.length === 0) return [] as PositionPnLData[];
		if (!periodRange) {
			const all = yield* fetchPositionsForPools(rawPoolsAll, api, wallet);
			return all;
		}
		const candidatePools = rawPoolsAll.filter((pool) => {
			const last =
				"lastClosedAt" in pool
					? (pool as { lastClosedAt?: number | null }).lastClosedAt
					: undefined;
			return last != null && last >= periodRange.start;
		});
		if (candidatePools.length === 0) return [] as PositionPnLData[];
		const allPositions = yield* fetchPositionsForPools(
			candidatePools,
			api,
			wallet,
		);
		return allPositions.filter(
			(p) =>
				p.closedAt != null &&
				p.closedAt >= periodRange.start &&
				p.closedAt < periodRange.end,
		);
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll(() => Effect.succeed([] as PositionPnLData[])),
	);
	return Effect.runPromise(program);
}

export function fetchClosedPositions(
	wallet: string,
	opts?: { month?: string; day?: string; week?: string },
): Promise<readonly PositionPnLData[]> {
	const periodRange = periodRangeFromOpts(opts);
	return fetchClosedPositionsUncached(wallet, periodRange);
}

export async function resolveWalletFromRequest(
	request: Request,
): Promise<string> {
	const header = request.headers.get("x-wallet");
	if (header && header.trim().length > 0) {
		const trimmed = header.trim();
		if (trimmed.length > 44 || !isValidSolanaAddress(trimmed)) {
			throw Object.assign(new Error("invalid wallet"), { status: 400 });
		}
		return trimmed;
	}
	const critical = await fetchPortfolioCritical();
	if (!critical.ok) throw new Error(critical.error);
	return critical.wallet;
}
export function fetchPortfolioCriticalCached(): Promise<
	PortfolioCritical | { ok: false; error: string; solPrice: null }
> {
	return fetchPortfolioCritical();
}

export function fetchAllClosedPools(
	wallet: string,
): Promise<readonly ClosedPoolWithIcons[]> {
	const program = Effect.gen(function* () {
		const api = yield* MeteoraApi;
		const closedRes = yield* api
			.closedPortfolio(wallet, 1, 10)
			.pipe(Effect.catchAll(() => Effect.succeed(null)));
		if (closedRes === null || closedRes.totalCount === 0)
			return [] as ClosedPoolWithIcons[];
		const pageSizeForAll = 50;
		const totalPages = Math.ceil(closedRes.totalCount / pageSizeForAll);
		const maxPages = Math.min(totalPages, 40);
		const poolEffects = Array.from({ length: maxPages }, (_, idx) =>
			api.closedPortfolio(wallet, idx + 1, pageSizeForAll).pipe(
				Effect.map((res) => res.pools),
				Effect.catchAll(() => Effect.succeed([] as ClosedPool[])),
			),
		);
		const pages = yield* Effect.all(poolEffects, { concurrency: 3 });
		const rawPools = pages.flat() as ClosedPool[];
		if (rawPools.length === 0) return [] as ClosedPoolWithIcons[];
		return rawPools.map((p) => ({
			...p,
			tokenXIcon: null as string | null,
			tokenYIcon: null as string | null,
		})) as ClosedPoolWithIcons[];
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll(() => Effect.succeed([] as ClosedPoolWithIcons[])),
	);
	return Effect.runPromise(program);
}

function bucketByMonth(
	positions: readonly PositionPnLData[],
): Record<string, readonly PositionPnLData[]> {
	const map: Record<string, PositionPnLData[]> = {};
	for (const p of positions) {
		if (p.closedAt == null) continue;
		const d = new Date(p.closedAt * 1000);
		const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
		const arr = map[key] ?? [];
		arr.push(p);
		map[key] = arr;
	}
	return map;
}

function fetchOverviewClosedUncached(
	wallet: string,
	periodRange: { start: number; end: number } | null,
): Promise<OverviewClosed> {
	const fetchPositionsForPools = (
		pools: readonly ClosedPool[],
		api: MeteoraApiService,
		w: string,
	) =>
		Effect.forEach(
			pools,
			(pool) =>
				api.positionPnl(pool.poolAddress, w, "closed", 1, 100).pipe(
					Effect.flatMap((res) => {
						const first = (res.positions as PositionPnLData[]).filter(
							(p) => p.isClosed && p.closedAt != null,
						);
						if (!res.hasNext) return Effect.succeed(first);
						const remaining = Math.ceil(res.totalCount / 100) - 1;
						if (remaining <= 0) return Effect.succeed(first);
						const pageEffects = Array.from({ length: remaining }, (_, i) =>
							api.positionPnl(pool.poolAddress, w, "closed", i + 2, 100).pipe(
								Effect.map((r) =>
									(r.positions as PositionPnLData[]).filter(
										(p) => p.isClosed && p.closedAt != null,
									),
								),
								Effect.catchAll(() => Effect.succeed([] as PositionPnLData[])),
							),
						);
						return Effect.all(pageEffects, { concurrency: 3 }).pipe(
							Effect.map((pg) => [...first, ...pg.flat()]),
						);
					}),
					Effect.catchAll(() => Effect.succeed([] as PositionPnLData[])),
				),
			{ concurrency: 5 },
		).pipe(Effect.map((arr) => arr.flat() as PositionPnLData[]));

	const program = Effect.gen(function* () {
		const api = yield* MeteoraApi;
		const closedRes = yield* api
			.closedPortfolio(wallet, 1, 10)
			.pipe(Effect.catchAll(() => Effect.succeed(null)));
		if (closedRes === null || closedRes.totalCount === 0)
			return {
				pools: [] as ClosedPool[],
				positions: [] as PositionPnLData[],
				byMonth: {} as Record<string, readonly PositionPnLData[]>,
				totalCount: 0,
				totalPositions: 0,
			} satisfies OverviewClosed;
		const pageSizeForAll = 50;
		const totalPages = Math.ceil(closedRes.totalCount / pageSizeForAll);
		const maxPages = Math.min(totalPages, 40);
		const poolEffects = Array.from({ length: maxPages }, (_, idx) =>
			api.closedPortfolio(wallet, idx + 1, pageSizeForAll).pipe(
				Effect.map((res) => res.pools as ClosedPool[]),
				Effect.catchAll(() => Effect.succeed([] as ClosedPool[])),
			),
		);
		const pages = yield* Effect.all(poolEffects, { concurrency: 3 });
		const rawPoolsAll = pages.flat() as ClosedPool[];
		if (rawPoolsAll.length === 0)
			return {
				pools: [],
				positions: [],
				byMonth: {},
				totalCount: closedRes.totalCount,
				totalPositions: 0,
			} satisfies OverviewClosed;
		if (!periodRange) {
			const all = yield* fetchPositionsForPools(rawPoolsAll, api, wallet);
			return {
				pools: rawPoolsAll,
				positions: all,
				byMonth: bucketByMonth(all),
				totalCount: closedRes.totalCount,
				totalPositions: all.length,
			} satisfies OverviewClosed;
		}
		const candidatePools = rawPoolsAll.filter((pool) => {
			const last =
				"lastClosedAt" in pool
					? (pool as { lastClosedAt?: number | null }).lastClosedAt
					: undefined;
			return last != null && last >= periodRange.start;
		});
		if (candidatePools.length === 0)
			return {
				pools: rawPoolsAll,
				positions: [],
				byMonth: {},
				totalCount: closedRes.totalCount,
				totalPositions: 0,
			} satisfies OverviewClosed;
		const allPositions = yield* fetchPositionsForPools(
			candidatePools,
			api,
			wallet,
		);
		const filtered = allPositions.filter(
			(p) =>
				p.closedAt != null &&
				p.closedAt >= periodRange.start &&
				p.closedAt < periodRange.end,
		);
		return {
			pools: rawPoolsAll,
			positions: filtered,
			byMonth: bucketByMonth(filtered),
			totalCount: closedRes.totalCount,
			totalPositions: filtered.length,
		} satisfies OverviewClosed;
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll(() =>
			Effect.succeed({
				pools: [] as ClosedPool[],
				positions: [] as PositionPnLData[],
				byMonth: {} as Record<string, readonly PositionPnLData[]>,
				totalCount: 0,
				totalPositions: 0,
			} satisfies OverviewClosed),
		),
	);
	return Effect.runPromise(program);
}

export function fetchOverviewClosed(
	wallet: string,
	opts?: { month?: string; day?: string; week?: string },
	extra?: { force?: boolean },
): Promise<OverviewClosed> {
	const periodRange = periodRangeFromOpts(opts);
	const key = `${wallet}:${opts?.month ?? opts?.day ?? opts?.week ?? "all"}`;
	if (extra?.force) {
		return fetchOverviewClosedUncached(wallet, periodRange).then((value) => {
			overviewClosedCache.set(key, value);
			return value;
		});
	}
	return overviewClosedCache.load(key, () =>
		fetchOverviewClosedUncached(wallet, periodRange),
	);
}

function attachLivePositions(
	pools: readonly OpenPool[],
	live: readonly UserPositionLive[],
): OpenPool[] {
	const byPool = new Map<string, UserPositionLive[]>();
	for (const l of live) {
		const arr = byPool.get(l.poolAddress) ?? [];
		arr.push(l);
		byPool.set(l.poolAddress, arr);
	}
	return pools.map((pool) => {
		const entries = byPool.get(pool.poolAddress);
		if (!entries) return pool;
		const positionsLive = entries.map((x) => ({
			address: x.positionAddress,
			createdAt: x.createdAt ?? null,
			amountX: x.amountX,
			amountY: x.amountY,
			feeX: x.feeX,
			feeY: x.feeY,
		}));
		const createdAt = new Map(
			(pool.positionsPnl ?? []).map((p) => [p.address, p.createdAt]),
		);
		for (const pos of positionsLive) {
			pos.createdAt = createdAt.get(pos.address) ?? null;
		}
		return { ...pool, positionsLive };
	});
}

export function fetchPortfolioCritical(): Promise<
	PortfolioCritical | { ok: false; error: string; solPrice: null }
> {
	const configProgram = () =>
		Effect.gen(function* () {
			const config = yield* AppConfig;
			const current = yield* config.get;
			const wallet = yield* config.wallet();
			const api = yield* MeteoraApi;
			const res = yield* api.openPortfolio(wallet, 1, 10);
			const apiTotals = res.total ?? null;
			const summary = computePortfolioSummary(res.pools, apiTotals);
			const payload: PortfolioCritical = {
				ok: true as const,
				wallet,
				rpc: current.rpcUrl ?? "rpc not configured",
				solPrice: parseNum(res.solPrice),
				total: apiTotals,
				summary,
				pools: res.pools,
			};
			return payload;
		}).pipe(
			Effect.provide(AppLayer),
			Effect.catchAll((error) =>
				Effect.succeed({
					ok: false as const,
					error: errorMessage(error),
					solPrice: null,
				}),
			),
		);

	return Effect.runPromise(configProgram());
}

export function fetchPortfolioDeferred(
	wallet: string,
	pools: readonly OpenPool[],
	closedPage: number,
	solPrice: number | null,
): Promise<PortfolioDeferred> {
	const program = Effect.gen(function* () {
		const api = yield* MeteoraApi;
		const dlmm = yield* Dlmm;

		const [enrichedPnl, live, closedRes, total] = yield* Effect.all(
			[
				api
					.enrichOpenPortfolioPnl([...pools] as OpenPool[], wallet, {
						withRanges: true,
					})
					.pipe(
						Effect.catchAll(() => Effect.succeed([...pools] as OpenPool[])),
					),
				dlmm
					.fetchUserPositions(wallet)
					.pipe(
						Effect.catchAll(() => Effect.succeed([] as UserPositionLive[])),
					),
				api
					.closedPortfolio(wallet, closedPage, 10)
					.pipe(Effect.catchAll(() => Effect.succeed(null))),
				api
					.totalPnl(wallet)
					.pipe(Effect.catchAll(() => Effect.succeed(EMPTY_TOTAL))),
			],
			{ concurrency: 3 },
		);

		const merged = attachLivePositions(enrichedPnl, live);

		const [openWithIcons, closedWithIcons] = yield* Effect.all(
			[
				enrichWithIcons(merged, api, solPrice).pipe(
					Effect.catchAll(() => Effect.succeed([] as OpenPoolWithIcons[])),
				),
				closedRes === null
					? Effect.succeed([] as ClosedPoolWithIcons[])
					: enrichWithIcons(closedRes.pools, api, solPrice).pipe(
							Effect.catchAll(() =>
								Effect.succeed([] as ClosedPoolWithIcons[]),
							),
						),
			],
			{ concurrency: 3 },
		);

		return {
			pools: openWithIcons,
			closed:
				closedRes === null
					? {
							pools: closedWithIcons,
							page: closedPage,
							pageSize: 10,
							totalCount: 0,
						}
					: {
							pools: closedWithIcons,
							page: closedRes.page,
							pageSize: closedRes.pageSize,
							totalCount: closedRes.totalCount,
						},
			total,
		} satisfies PortfolioDeferred;
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll(() =>
			Effect.succeed({
				pools: [] as OpenPoolWithIcons[],
				closed: {
					pools: [] as ClosedPoolWithIcons[],
					page: closedPage,
					pageSize: 10,
					totalCount: 0,
				},
				total: EMPTY_TOTAL,
			} satisfies PortfolioDeferred),
		),
	);
	return Effect.runPromise(program);
}
export function fetchActivePortfolio(): Promise<PortfolioPayload> {
	const program = Effect.gen(function* () {
		const critical = yield* Effect.tryPromise(() =>
			fetchPortfolioCriticalCached(),
		).pipe(
			Effect.flatMap((c) =>
				c.ok
					? Effect.succeed(c as PortfolioCritical)
					: Effect.fail(new Error((c as { error: string }).error)),
			),
		);
		const api = yield* MeteoraApi;
		const dlmm = yield* Dlmm;
		const [enrichedPnl, live] = yield* Effect.all(
			[
				api
					.enrichOpenPortfolioPnl(
						[...critical.pools] as OpenPool[],
						critical.wallet,
						{ withRanges: true },
					)
					.pipe(
						Effect.catchAll(() =>
							Effect.succeed([...critical.pools] as OpenPool[]),
						),
					),
				dlmm
					.fetchUserPositions(critical.wallet)
					.pipe(
						Effect.catchAll(() => Effect.succeed([] as UserPositionLive[])),
					),
			],
			{ concurrency: 3 },
		);
		const merged = attachLivePositions(enrichedPnl, live);
		const pools = yield* enrichWithIcons(merged, api, critical.solPrice).pipe(
			Effect.catchAll(() => Effect.succeed([] as OpenPoolWithIcons[])),
		);
		return {
			ok: true,
			wallet: critical.wallet,
			rpc: critical.rpc,
			solPrice: critical.solPrice,
			summary: critical.summary,
			total: critical.total as unknown as PortfolioTotal,
			pools,
		} satisfies PortfolioPayload;
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll((error) =>
			Effect.succeed({
				ok: false,
				error: errorMessage(error),
				solPrice: null,
			} satisfies PortfolioPayload),
		),
	);
	return Effect.runPromise(program);
}

export function fetchClosedPortfolio(
	closedPage: number,
): Promise<PortfolioPayload> {
	const program = Effect.gen(function* () {
		const config = yield* AppConfig;
		const current = yield* config.get;
		const wallet = yield* config.wallet();
		const api = yield* MeteoraApi;
		const solPrice = yield* Effect.tryPromise(() =>
			fetchPortfolioCriticalCached(),
		).pipe(
			Effect.flatMap((c) =>
				c.ok
					? Effect.succeed(c.solPrice)
					: Effect.succeed(null as number | null),
			),
			Effect.catchAll(() => Effect.succeed(null as number | null)),
		);
		const closedRes = yield* api
			.closedPortfolio(wallet, closedPage, 10)
			.pipe(Effect.catchAll(() => Effect.succeed(null)));
		const closedWithIcons =
			closedRes === null
				? ([] as ClosedPoolWithIcons[])
				: yield* enrichWithIcons(closedRes.pools, api, solPrice).pipe(
						Effect.catchAll(() => Effect.succeed([] as ClosedPoolWithIcons[])),
					);
		return {
			ok: true,
			wallet,
			rpc: current.rpcUrl ?? "rpc not configured",
			solPrice,
			closed:
				closedRes === null
					? {
							pools: closedWithIcons,
							page: closedPage,
							pageSize: 10,
							totalCount: 0,
						}
					: {
							pools: closedWithIcons,
							page: closedRes.page,
							pageSize: closedRes.pageSize,
							totalCount: closedRes.totalCount,
						},
		} satisfies PortfolioPayload;
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll((error) =>
			Effect.succeed({
				ok: false,
				error: errorMessage(error),
				solPrice: null,
			} satisfies PortfolioPayload),
		),
	);
	return Effect.runPromise(program);
}

export function fetchPortfolio(closedPage: number): Promise<PortfolioPayload> {
	const program = Effect.gen(function* () {
		const critical = yield* Effect.tryPromise(() =>
			fetchPortfolioCriticalCached(),
		).pipe(
			Effect.flatMap((c) =>
				c.ok
					? Effect.succeed(c as PortfolioCritical)
					: Effect.fail(new Error((c as { error: string }).error)),
			),
		);
		const deferred = yield* Effect.tryPromise(() =>
			fetchPortfolioDeferred(
				critical.wallet,
				critical.pools,
				closedPage,
				critical.solPrice,
			),
		);
		return {
			ok: true,
			wallet: critical.wallet,
			rpc: critical.rpc,
			solPrice: critical.solPrice,
			total: deferred.total,
			summary: critical.summary,
			pools: deferred.pools,
			closed: deferred.closed,
		} satisfies PortfolioPayload;
	}).pipe(
		Effect.catchAll((error) =>
			Effect.succeed({
				ok: false,
				error: errorMessage(error),
				solPrice: null,
			} satisfies PortfolioPayload),
		),
	);
	return Effect.runPromise(program);
}

type OpenRanges = Record<
	string,
	{ minPrice: string; maxPrice: string; poolActivePrice: string }[]
>;

const POOLS_PARAM_CAP = 20;

function fetchOpenRangesUncached(
	poolAddresses: readonly string[],
): Promise<OpenRanges> {
	const program = Effect.gen(function* () {
		const config = yield* AppConfig;
		const wallet = yield* config.wallet();
		const api = yield* MeteoraApi;
		let pools: readonly { poolAddress: string }[];
		if (poolAddresses.length > 0) {
			pools = poolAddresses.map((addr) => ({ poolAddress: addr }));
		} else {
			const openRes = yield* api.openPortfolio(wallet, 1, 50);
			pools = openRes.pools;
		}
		const ranges: OpenRanges = {};
		yield* Effect.forEach(
			pools,
			(pool) =>
				api.positionPnl(pool.poolAddress, wallet, "open").pipe(
					Effect.map((res) => {
						ranges[pool.poolAddress] = res.positions.map((p) => ({
							address: p.positionAddress,
							minPrice: p.minPrice,
							maxPrice: p.maxPrice,
							poolActivePrice: p.poolActivePrice ?? "",
						}));
					}),
					Effect.catchAll(() => Effect.succeed(undefined)),
				),
			{ concurrency: 3, discard: true },
		);
		return ranges;
	}).pipe(Effect.provide(AppLayer));
	return Effect.runPromise(program);
}

export async function fetchOpenRanges(
	poolAddresses?: readonly string[],
): Promise<OpenRanges> {
	const capped = (poolAddresses ?? []).slice(0, POOLS_PARAM_CAP);
	try {
		return await fetchOpenRangesUncached(capped);
	} catch {
		return {};
	}
}

export function getWebPassword(): Promise<string> {
	const program = Effect.gen(function* () {
		const config = yield* AppConfig;
		const current = yield* config.get;
		return resolveWebConfig(current).password;
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll(() => Effect.succeed("")),
	);
	return Effect.runPromise(program);
}
export function fetchClosedPositionDetail(pool: string): Promise<{
	ok: boolean;
	error?: string;
	positions?: readonly PositionPnLData[];
}> {
	const program = Effect.gen(function* () {
		const config = yield* AppConfig;
		const wallet = yield* config.wallet();
		const api = yield* MeteoraApi;
		const res = yield* api.positionPnl(pool, wallet, "closed", 1, 100);
		return { ok: true, positions: res.positions };
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll((error) =>
			Effect.succeed({ ok: false, error: errorMessage(error) }),
		),
	);
	return Effect.runPromise(program);
}
