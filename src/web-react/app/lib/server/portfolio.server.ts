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
import {
	getCurrentMonthKey,
	getTodayKey,
	getWeekStartMonday,
	isoWeekToKey,
	normalizeWeekKey,
} from "./period.server";
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

const iconCache = new Map<
	string,
	{
		x?: string;
		y?: string;
		mcap?: number | null;
		price?: number | null;
		at: number;
	}
>();
const ICON_CACHE_TTL_MS = 30 * 60 * 1000;

interface ClosedPeriodEntry {
	readonly data: readonly PositionPnLData[];
	readonly at: number;
}
const CURRENT_MONTH_TTL_MS = 5 * 60 * 1000;
const CURRENT_DAY_TTL_MS = 5 * 60 * 1000;
const CURRENT_WEEK_TTL_MS = 5 * 60 * 1000;
const closedMonthCache = createTtlCache<string, ClosedPeriodEntry>({
	ttlMs: CURRENT_MONTH_TTL_MS,
	isFresh: (key, value, now) =>
		!key.endsWith(`:${getCurrentMonthKey()}`) ||
		now - value.at < CURRENT_MONTH_TTL_MS,
});
const closedDayCache = createTtlCache<string, ClosedPeriodEntry>({
	ttlMs: CURRENT_DAY_TTL_MS,
	isFresh: (key, value, now) =>
		!key.endsWith(`:${getTodayKey()}`) || now - value.at < CURRENT_DAY_TTL_MS,
});
const closedWeekCache = createTtlCache<string, ClosedPeriodEntry>({
	ttlMs: CURRENT_WEEK_TTL_MS,
	isFresh: (key, value, now) =>
		!key.endsWith(`:${getWeekStartMonday(new Date())}`) ||
		now - value.at < CURRENT_WEEK_TTL_MS,
});
const closedPoolsCache = new Map<
	string,
	{ data: readonly ClosedPoolWithIcons[]; at: number }
>();
const CLOSED_POOLS_TTL_MS = 5 * 60 * 1000;

const walletCache = new Map<string, { wallet: string; at: number }>();
const WALLET_CACHE_TTL_MS = 5 * 60 * 1000;
const criticalCache = new Map<
	string,
	{ data: PortfolioCritical; at: number }
>();
const CRITICAL_CACHE_TTL_MS = 30 * 1000;

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
		const now = Date.now();
		const unique = new Map<string, T>();
		for (const p of pools) {
			if (!unique.has(p.poolAddress)) unique.set(p.poolAddress, p);
		}
		const uniquePools = [...unique.values()];
		const fetched = new Map<
			string,
			{ x: string | null; y: string | null; mcap: number | null }
		>();
		yield* Effect.forEach(
			uniquePools,
			(pool) =>
				Effect.gen(function* () {
					const cached = iconCache.get(pool.poolAddress);
					if (cached && now - cached.at < ICON_CACHE_TTL_MS) {
						fetched.set(pool.poolAddress, {
							x: cached.x ?? null,
							y: cached.y ?? null,
							mcap: cached.mcap ?? null,
						});
						return;
					}
					const discovery = yield* api
						.discoveryPoolByAddress(pool.poolAddress)
						.pipe(Effect.either);
					if (discovery._tag === "Left") {
						fetched.set(pool.poolAddress, { x: null, y: null, mcap: null });
						return;
					}
					const d = discovery.right;
					const snapshotMcap = d.token_x?.market_cap ?? null;
					const snapshotPrice = d.token_x?.price ?? null;
					iconCache.set(pool.poolAddress, {
						x: d.token_x?.icon ?? undefined,
						y: d.token_y?.icon ?? undefined,
						mcap: snapshotMcap,
						price: snapshotPrice,
						at: now,
					});
					fetched.set(pool.poolAddress, {
						x: d.token_x?.icon ?? null,
						y: d.token_y?.icon ?? null,
						mcap: snapshotMcap,
					});
				}),
			{ concurrency: 3 },
		);
		return pools.map((pool) => {
			const poolPrice = (pool as { poolPrice?: number }).poolPrice ?? null;
			const cached = iconCache.get(pool.poolAddress);
			const entry = fetched.get(pool.poolAddress);
			const baseMcap = entry?.mcap ?? cached?.mcap ?? null;
			const basePrice = cached?.price ?? null;
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
): Promise<ClosedPeriodEntry> {
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
	return Effect.runPromise(program).then((res) => ({
		data: res,
		at: Date.now(),
	}));
}

export function fetchClosedPositions(
	wallet: string,
	opts?: { month?: string; day?: string; week?: string },
): Promise<readonly PositionPnLData[]> {
	const cacheKey = (() => {
		if (opts?.day) return `day:${wallet}:${opts.day}`;
		if (opts?.week) {
			const n = normalizeWeekKey(opts.week);
			return n ? `week:${wallet}:${n}` : `week:${wallet}:${opts.week}`;
		}
		if (opts?.month) return `month:${wallet}:${opts.month}`;
		return null;
	})();
	const periodRange = periodRangeFromOpts(opts);
	const cache = opts?.day
		? closedDayCache
		: opts?.week
			? closedWeekCache
			: opts?.month
				? closedMonthCache
				: null;
	if (cacheKey === null || cache === null)
		return fetchClosedPositionsUncached(wallet, periodRange).then(
			(entry) => entry.data,
		);
	return cache
		.load(cacheKey, () => fetchClosedPositionsUncached(wallet, periodRange))
		.then((entry) => entry.data);
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
		if (walletCache.size >= 100 && !walletCache.has(trimmed)) {
			const firstKey = walletCache.keys().next().value;
			if (firstKey) walletCache.delete(firstKey);
		}
		return trimmed;
	}
	const cached = walletCache.get("default");
	if (cached && Date.now() - cached.at < WALLET_CACHE_TTL_MS)
		return cached.wallet;
	const critical = await fetchPortfolioCriticalCached();
	if (!critical.ok) throw new Error(critical.error);
	walletCache.set("default", { wallet: critical.wallet, at: Date.now() });
	return critical.wallet;
}
export function fetchPortfolioCriticalCached(): Promise<
	PortfolioCritical | { ok: false; error: string; solPrice: null }
> {
	const cached = criticalCache.get("default");
	if (cached && Date.now() - cached.at < CRITICAL_CACHE_TTL_MS) {
		return Promise.resolve(cached.data);
	}
	return fetchPortfolioCritical().then((res) => {
		if ((res as PortfolioCritical).ok) {
			criticalCache.set("default", {
				data: res as PortfolioCritical,
				at: Date.now(),
			});
		}
		return res;
	});
}

export function fetchAllClosedPools(
	wallet: string,
): Promise<readonly ClosedPoolWithIcons[]> {
	const cached = closedPoolsCache.get(wallet);
	if (cached && Date.now() - cached.at < CLOSED_POOLS_TTL_MS) {
		return Promise.resolve(cached.data);
	}
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
	const promise = Effect.runPromise(program).then((res) => {
		if (closedPoolsCache.size >= 100 && !closedPoolsCache.has(wallet)) {
			const firstKey = closedPoolsCache.keys().next().value;
			if (firstKey) closedPoolsCache.delete(firstKey);
		}
		closedPoolsCache.set(wallet, { data: res, at: Date.now() });
		return res;
	});
	return promise;
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

const OPEN_RANGES_TTL_MS = 60 * 1000;
const POOLS_PARAM_CAP = 20;
const openRangesCache = createTtlCache<string, OpenRanges>({
	ttlMs: OPEN_RANGES_TTL_MS,
});

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
	const key = capped.length > 0 ? [...capped].sort().join(",") : "all";
	try {
		return await openRangesCache.load(key, () =>
			fetchOpenRangesUncached(capped),
		);
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
