import "~/lib/server/env.server";

import type {
	ClosedPool,
	ClosedPortfolioResponse,
	OpenPool,
	OpenPortfolioTotals,
	PortfolioTotal,
} from "@vexis/domain/portfolio.js";
import type {
	PositionPnLData,
	PositionPnLResponse,
} from "@vexis/domain/position.js";
import { errorMessage } from "@vexis/errors.js";
import { AppLayer } from "@vexis/layers.js";
import { AppConfig } from "@vexis/services/Config.js";
import { Dlmm } from "@vexis/services/Dlmm.js";
import {
	MeteoraApi,
	type MeteoraApiService,
} from "@vexis/services/MeteoraApi.js";
import { Effect } from "effect";
import { computeLiveMcap } from "~/lib/mcap";
import { resolveWebConfig } from "./config";

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

const closedMonthCache = new Map<
	string,
	{ data: readonly PositionPnLData[]; at: number }
>();
const closedDayCache = new Map<
	string,
	{ data: readonly PositionPnLData[]; at: number }
>();
const closedWeekCache = new Map<
	string,
	{ data: readonly PositionPnLData[]; at: number }
>();
const closedPoolsCache = new Map<
	string,
	{ data: readonly ClosedPoolWithIcons[]; at: number }
>();
const CURRENT_MONTH_TTL_MS = 5 * 60 * 1000;
const CURRENT_DAY_TTL_MS = 5 * 60 * 1000;
const CURRENT_WEEK_TTL_MS = 5 * 60 * 1000;
const CLOSED_POOLS_TTL_MS = 5 * 60 * 1000;

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
	readonly closedAll?: readonly ClosedPoolWithIcons[];
	readonly closedPositions?: readonly PositionPnLData[];
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
	readonly closedAll: readonly ClosedPoolWithIcons[];
	readonly total: PortfolioTotal;
}

export function fetchClosedPositions(
	wallet: string,
	opts?: { month?: string; day?: string; week?: string },
): Promise<readonly PositionPnLData[]> {
	const getTodayKey = () => {
		const d = new Date();
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	};
	const getWeekStart = (d: Date) => {
		const day = d.getDay();
		const diff = day === 0 ? -6 : 1 - day;
		const mon = new Date(d);
		mon.setDate(d.getDate() + diff);
		mon.setHours(0, 0, 0, 0);
		return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
	};
	const normalizeWeek = (w: string): string | null => {
		if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
		return isoWeekToKey(w);
	};
	const cacheKey = (() => {
		if (opts?.day) return `day:${wallet}:${opts.day}`;
		if (opts?.week) {
			const n = normalizeWeek(opts.week);
			return n ? `week:${wallet}:${n}` : `week:${wallet}:${opts.week}`;
		}
		if (opts?.month) return `month:${wallet}:${opts.month}`;
		return null;
	})();
	if (cacheKey) {
		const now = Date.now();
		if (opts?.day) {
			const cached = closedDayCache.get(cacheKey);
			if (cached) {
				const isCurrent = opts.day === getTodayKey();
				if (!isCurrent || now - cached.at < CURRENT_DAY_TTL_MS)
					return Promise.resolve(cached.data);
			}
		} else if (opts?.week) {
			const cached = closedWeekCache.get(cacheKey);
			if (cached) {
				const curWeek = getWeekStart(new Date());
				const norm = normalizeWeek(opts.week);
				const isCurrent = norm === curWeek;
				if (!isCurrent || now - cached.at < CURRENT_WEEK_TTL_MS)
					return Promise.resolve(cached.data);
			}
		} else if (opts?.month) {
			const cached = closedMonthCache.get(cacheKey);
			if (cached) {
				const cur = new Date();
				const curKey = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
				const isCurrent = opts.month === curKey;
				if (!isCurrent || now - cached.at < CURRENT_MONTH_TTL_MS)
					return Promise.resolve(cached.data);
			}
		}
	}
	function isoWeekToKey(week: string): string | null {
		const m = week.match(/^(\d{4})-W(\d{2})$/);
		if (!m) return null;
		const year = Number(m[1]);
		const w = Number(m[2]);
		const jan4 = new Date(year, 0, 4);
		const day = jan4.getDay();
		const diff = day === 0 ? -6 : 1 - day;
		const mon1 = new Date(jan4);
		mon1.setDate(jan4.getDate() + diff);
		const target = new Date(mon1);
		target.setDate(mon1.getDate() + (w - 1) * 7);
		return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
	}
	const periodRange = (() => {
		if (opts?.day) {
			const m = opts.day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
			if (!m) return null;
			const y = Number(m[1]);
			const mo = Number(m[2]);
			const d = Number(m[3]);
			if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
			const start = Math.floor(new Date(y, mo - 1, d).getTime() / 1000);
			const end = start + 86400;
			return { start, end };
		}
		if (opts?.week) {
			let start: number | null = null;
			const dayMatch = opts.week.match(/^(\d{4})-(\d{2})-(\d{2})$/);
			if (dayMatch) {
				const y = Number(dayMatch[1]);
				const mo = Number(dayMatch[2]);
				const d = Number(dayMatch[3]);
				start = Math.floor(new Date(y, mo - 1, d).getTime() / 1000);
			} else {
				const iso = isoWeekToKey(opts.week);
				if (iso) {
					const mm = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
					if (mm) {
						start = Math.floor(
							new Date(
								Number(mm[1]),
								Number(mm[2]) - 1,
								Number(mm[3]),
							).getTime() / 1000,
						);
					}
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
		const start = Math.floor(new Date(y, mo - 1, 1).getTime() / 1000);
		const end = Math.floor(new Date(y, mo, 1).getTime() / 1000);
		return { start, end };
	})();
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
		if (!periodRange) {
			const poolEffects = Array.from({ length: maxPages }, (_, idx) =>
				api.closedPortfolio(wallet, idx + 1, pageSizeForAll).pipe(
					Effect.map((res) => res.pools as ClosedPool[]),
					Effect.catchAll(() => Effect.succeed([] as ClosedPool[])),
				),
			);
			const pages = yield* Effect.all(poolEffects, { concurrency: 3 });
			const rawPoolsAll = pages.flat() as ClosedPool[];
			if (rawPoolsAll.length === 0) return [] as PositionPnLData[];
			const effects = rawPoolsAll.map((pool) =>
				api.positionPnl(pool.poolAddress, wallet, "closed", 1, 100).pipe(
					Effect.flatMap((res) => {
						const first = (res.positions as PositionPnLData[]).filter(
							(p) => p.isClosed && p.closedAt != null,
						);
						if (!res.hasNext) return Effect.succeed(first);
						const remaining = Math.ceil(res.totalCount / 100) - 1;
						if (remaining <= 0) return Effect.succeed(first);
						const pageEffects = Array.from({ length: remaining }, (_, i) =>
							api
								.positionPnl(pool.poolAddress, wallet, "closed", i + 2, 100)
								.pipe(
									Effect.map((r) =>
										(r.positions as PositionPnLData[]).filter(
											(p) => p.isClosed && p.closedAt != null,
										),
									),
									Effect.catchAll(() => Effect.succeed([] as PositionPnLData[])),
								),
						);
						return Effect.all(pageEffects, { concurrency: 2 }).pipe(
							Effect.map((pg) => [...first, ...pg.flat()]),
						);
					}),
					Effect.catchAll(() => Effect.succeed([] as PositionPnLData[])),
				),
			);
			const all = yield* Effect.all(effects, { concurrency: 3 });
			return all.flat();
		}
		const rawPools: ClosedPool[] = [];
		for (let page = 1; page <= maxPages; page++) {
			const res = yield* api
				.closedPortfolio(wallet, page, pageSizeForAll)
				.pipe(
					Effect.catchAll(() =>
						Effect.succeed(null as unknown as ClosedPortfolioResponse),
					),
				);
			if (res === null || res.pools.length === 0) continue;
			rawPools.push(...(res.pools as ClosedPool[]));
			const maxLast = res.pools.reduce(
				(m: number, p: ClosedPool) =>
					Math.max(m, (p.lastClosedAt as number | null) ?? -Infinity),
				-Infinity,
			);
			if (Number.isFinite(maxLast) && maxLast < periodRange.start) break;
			if (rawPools.length >= closedRes.totalCount) break;
		}
		if (rawPools.length === 0) return [] as PositionPnLData[];
		const candidatePools = rawPools.filter((pool) => {
			const last = (pool as unknown as { lastClosedAt?: number | null }).lastClosedAt;
			return last != null && last >= periodRange.start;
		});
		if (candidatePools.length === 0) return [] as PositionPnLData[];
		const allPositions: PositionPnLData[] = [];
		for (const pool of candidatePools) {
			const res = yield* api
				.positionPnl(pool.poolAddress, wallet, "closed", 1, 100)
				.pipe(
					Effect.catchAll(() =>
						Effect.succeed(null as unknown as PositionPnLResponse),
					),
				);
			if (res === null) continue;
			const first = (res.positions as PositionPnLData[]).filter(
				(p) => p.isClosed && p.closedAt != null,
			);
			let collected: PositionPnLData[] = [...first];
			if (res.hasNext) {
				const remaining = Math.ceil(res.totalCount / 100) - 1;
				for (let i = 0; i < remaining; i++) {
					const pageRes = yield* api
						.positionPnl(pool.poolAddress, wallet, "closed", i + 2, 100)
						.pipe(
							Effect.catchAll(() =>
								Effect.succeed(null as unknown as PositionPnLResponse),
							),
						);
					if (pageRes === null) continue;
					const filtered = (pageRes.positions as PositionPnLData[]).filter(
						(p) => p.isClosed && p.closedAt != null,
					);
					collected.push(...filtered);
				}
			}
			allPositions.push(...collected);
		}
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
	const promise = Effect.runPromise(program).then((res) => {
		if (cacheKey) {
			if (opts?.day)
				closedDayCache.set(cacheKey, { data: res, at: Date.now() });
			else if (opts?.week)
				closedWeekCache.set(cacheKey, { data: res, at: Date.now() });
			else if (opts?.month)
				closedMonthCache.set(cacheKey, { data: res, at: Date.now() });
		}
		return res;
	});
	return promise;
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
		// tanpa corrupted: kembalikan semua tanpa filter bulan, tanpa enrich ikon berat
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
		closedPoolsCache.set(wallet, { data: res, at: Date.now() });
		return res;
	});
	return promise;
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
					.pipe(Effect.catchAll(() => Effect.succeed([] as never[]))),
				api
					.closedPortfolio(wallet, closedPage, 10)
					.pipe(Effect.catchAll(() => Effect.succeed(null))),
				api
					.totalPnl(wallet)
					.pipe(Effect.catchAll(() => Effect.succeed(EMPTY_TOTAL))),
			],
			{ concurrency: 3 },
		);

		// merge live positions into enriched pools (same as Dlmm.attachLivePositions without extra RPC)
		const byPool = new Map<string, typeof live>();
		for (const l of live as unknown as Array<{
			poolAddress: string;
			positionAddress: string;
			createdAt: number | null;
			amountX: string;
			amountY: string;
			feeX: string;
			feeY: string;
		}>) {
			const arr = byPool.get(l.poolAddress) ?? [];
			(arr as unknown[]).push(l);
			byPool.set(l.poolAddress, arr as never);
		}
		for (const pool of enrichedPnl) {
			const l = byPool.get(pool.poolAddress);
			if (l) {
				(pool as { positionsLive?: unknown }).positionsLive = (
					l as unknown as Array<{
						positionAddress: string;
						createdAt: number | null;
						amountX: string;
						amountY: string;
						feeX: string;
						feeY: string;
					}>
				).map((x) => ({
					address: x.positionAddress,
					createdAt: x.createdAt,
					amountX: x.amountX,
					amountY: x.amountY,
					feeX: x.feeX,
					feeY: x.feeY,
				}));
			}
		}
		// attach createdAt from positionsPnl to live
		for (const pool of enrichedPnl) {
			const createdAt = new Map(
				(pool.positionsPnl ?? []).map((p) => [p.address, p.createdAt]),
			);
			const liveArr = (
				pool as unknown as {
					positionsLive?: Array<{ address: string; createdAt?: number | null }>;
				}
			).positionsLive;
			if (liveArr) {
				for (const pos of liveArr) {
					Object.assign(pos, { createdAt: createdAt.get(pos.address) ?? null });
				}
			}
		}

		const [openWithIcons, closedWithIcons] = yield* Effect.all(
			[
				enrichWithIcons(enrichedPnl, api, solPrice).pipe(
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

		const closedAll: ClosedPoolWithIcons[] = [];
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
			closedAll,
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
				closedAll: [] as ClosedPoolWithIcons[],
				total: EMPTY_TOTAL,
			} satisfies PortfolioDeferred),
		),
	);
	return Effect.runPromise(program);
}
export function fetchActivePortfolio(): Promise<PortfolioPayload> {
	const program = Effect.gen(function* () {
		const critical = yield* Effect.tryPromise(() =>
			fetchPortfolioCritical(),
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
						{ withRanges: false },
					)
					.pipe(
						Effect.catchAll(() =>
							Effect.succeed([...critical.pools] as OpenPool[]),
						),
					),
				dlmm
					.fetchUserPositions(critical.wallet)
					.pipe(Effect.catchAll(() => Effect.succeed([] as never[]))),
			],
			{ concurrency: 3 },
		);
		const byPool = new Map<string, typeof live>();
		for (const l of live as unknown as Array<{
			poolAddress: string;
			positionAddress: string;
			createdAt: number | null;
			amountX: string;
			amountY: string;
			feeX: string;
			feeY: string;
		}>) {
			const arr = byPool.get(l.poolAddress) ?? [];
			(arr as unknown[]).push(l);
			byPool.set(l.poolAddress, arr as never);
		}
		for (const pool of enrichedPnl) {
			const l = byPool.get(pool.poolAddress);
			if (l) {
				(pool as { positionsLive?: unknown }).positionsLive = (
					l as unknown as Array<{
						positionAddress: string;
						createdAt: number | null;
						amountX: string;
						amountY: string;
						feeX: string;
						feeY: string;
					}>
				).map((x) => ({
					address: x.positionAddress,
					createdAt: x.createdAt,
					amountX: x.amountX,
					amountY: x.amountY,
					feeX: x.feeX,
					feeY: x.feeY,
				}));
			}
		}
		for (const pool of enrichedPnl) {
			const createdAt = new Map(
				(pool.positionsPnl ?? []).map((p) => [p.address, p.createdAt]),
			);
			const liveArr = (
				pool as unknown as {
					positionsLive?: Array<{ address: string; createdAt?: number | null }>;
				}
			).positionsLive;
			if (liveArr)
				for (const pos of liveArr)
					Object.assign(pos, { createdAt: createdAt.get(pos.address) ?? null });
		}
		const poolsWithoutIcons = enrichedPnl.map((p) => ({
			...p,
			tokenXIcon: null as string | null,
			tokenYIcon: null as string | null,
			mcap: null as number | null,
		})) as OpenPoolWithIcons[];
		return {
			ok: true,
			wallet: critical.wallet,
			rpc: critical.rpc,
			solPrice: critical.solPrice,
			summary: critical.summary,
			total: critical.total as unknown as PortfolioTotal,
			pools: poolsWithoutIcons,
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

export function fetchPoolIcons(poolAddresses: readonly string[]): Promise<
	readonly {
		poolAddress: string;
		tokenXIcon: string | null;
		tokenYIcon: string | null;
		mcap: number | null;
	}[]
> {
	const program = Effect.gen(function* () {
		const api = yield* MeteoraApi;
		const config = yield* AppConfig;
		yield* config.get;
		const solPrice = yield* api
			.openPortfolio(yield* config.wallet(), 1, 1)
			.pipe(
				Effect.map((r) => parseNum(r.solPrice)),
				Effect.catchAll(() => Effect.succeed(null as number | null)),
			);
		const pools = poolAddresses.map((addr) => ({ poolAddress: addr }));
		const enriched = yield* enrichWithIcons(pools as never, api, solPrice).pipe(
			Effect.catchAll(() => Effect.succeed([] as never[])),
		);
		return enriched.map((p) => ({
			poolAddress: (p as { poolAddress: string }).poolAddress,
			tokenXIcon: (p as { tokenXIcon: string | null }).tokenXIcon,
			tokenYIcon: (p as { tokenYIcon: string | null }).tokenYIcon,
			mcap: (p as { mcap: number | null }).mcap,
		}));
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll(() => Effect.succeed([] as never[])),
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
		const solPrice = yield* api.openPortfolio(wallet, 1, 1).pipe(
			Effect.map((r) => parseNum(r.solPrice)),
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
			fetchPortfolioCritical(),
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
			closedAll: deferred.closedAll,
			closedPositions: (deferred as unknown as { closedPositions?: unknown })
				.closedPositions as PortfolioPayload["closedPositions"],
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

export function fetchOpenRanges(
	poolAddresses?: readonly string[],
): Promise<
	Record<
		string,
		{ minPrice: string; maxPrice: string; poolActivePrice: string }[]
	>
> {
	const program = Effect.gen(function* () {
		const config = yield* AppConfig;
		const wallet = yield* config.wallet();
		const api = yield* MeteoraApi;
		let pools: readonly { poolAddress: string }[];
		if (poolAddresses && poolAddresses.length > 0) {
			pools = poolAddresses.map((addr) => ({ poolAddress: addr }));
		} else {
			const openRes = yield* api.openPortfolio(wallet, 1, 50);
			pools = openRes.pools;
		}
		const ranges: Record<
			string,
			{ minPrice: string; maxPrice: string; poolActivePrice: string }[]
		> = {};
		yield* Effect.forEach(
			pools,
			(pool) =>
				api.positionPnl(pool.poolAddress, wallet, "open").pipe(
					Effect.map((res) => {
						ranges[pool.poolAddress] = res.positions.map((p) => ({
							address: p.positionAddress,
							minPrice: p.minPrice,
							maxPrice: p.maxPrice,
							poolActivePrice: p.poolActivePrice,
						})) as never;
					}),
					Effect.catchAll(() => Effect.succeed(undefined)),
				),
			{ concurrency: 3, discard: true },
		);
		return ranges;
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll(() => Effect.succeed({} as Record<string, never>)),
	);
	return Effect.runPromise(program);
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
