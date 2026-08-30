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
		const out: Array<
			T & {
				tokenXIcon: string | null;
				tokenYIcon: string | null;
				mcap: number | null;
			}
		> = [];
		yield* Effect.forEach(
			pools,
			(pool) =>
				Effect.gen(function* () {
					const poolPrice = (pool as { poolPrice?: number }).poolPrice ?? null;
					const cached = iconCache.get(pool.poolAddress);
					if (cached && now - cached.at < ICON_CACHE_TTL_MS) {
						out.push({
							...pool,
							tokenXIcon: cached.x ?? null,
							tokenYIcon: cached.y ?? null,
							mcap:
								computeLiveMcap(
									cached.mcap,
									cached.price,
									poolPrice,
									solPrice,
								) ??
								cached.mcap ??
								null,
						});
						return;
					}
					const discovery = yield* api
						.discoveryPoolByAddress(pool.poolAddress)
						.pipe(Effect.either);
					if (discovery._tag === "Left") {
						out.push({
							...pool,
							tokenXIcon: null,
							tokenYIcon: null,
							mcap: null,
						});
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
					out.push({
						...pool,
						tokenXIcon: d.token_x?.icon ?? null,
						tokenYIcon: d.token_y?.icon ?? null,
						mcap:
							computeLiveMcap(
								snapshotMcap,
								snapshotPrice,
								poolPrice,
								solPrice,
							) ?? snapshotMcap,
					});
				}),
			{ concurrency: 10 },
		);
		return out;
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
	opts?: { month?: string },
): Promise<readonly PositionPnLData[]> {
	const monthRange = (() => {
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
		const maxPages = Math.min(totalPages, monthRange ? 20 : 40);
		const poolEffects = Array.from({ length: maxPages }, (_, idx) =>
			api.closedPortfolio(wallet, idx + 1, pageSizeForAll).pipe(
				Effect.map((res) => res.pools),
				Effect.catchAll(() => Effect.succeed([] as ClosedPool[])),
			),
		);
		const pages = yield* Effect.all(poolEffects, { concurrency: 10 });
		const rawPools = pages.flat() as ClosedPool[];
		if (rawPools.length === 0) return [] as PositionPnLData[];
		const effects = rawPools.map((pool) =>
			api.positionPnl(pool.poolAddress, wallet, "closed", 1, 100).pipe(
				Effect.flatMap((res) => {
					const first = res.positions.filter(
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
									r.positions.filter((p) => p.isClosed && p.closedAt != null),
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
		);
		const all = yield* Effect.all(effects, { concurrency: 10 });
		const flat = all.flat();
		if (!monthRange) return flat;
		return flat.filter(
			(p) =>
				p.closedAt != null &&
				p.closedAt >= monthRange.start &&
				p.closedAt < monthRange.end,
		);
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll(() => Effect.succeed([] as PositionPnLData[])),
	);
	return Effect.runPromise(program);
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
			{ concurrency: "unbounded" },
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

		const [openWithIcons, closedWithIcons, rawClosedAll] = yield* Effect.all(
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
				Effect.gen(function* () {
					if (closedRes === null || closedRes.totalCount === 0)
						return [] as ClosedPool[];
					const pageSizeForAll = 50;
					const totalPages = Math.ceil(closedRes.totalCount / pageSizeForAll);
					const maxPages = Math.min(totalPages, 40);
					const effects = Array.from({ length: maxPages }, (_, idx) =>
						api.closedPortfolio(wallet, idx + 1, pageSizeForAll).pipe(
							Effect.map((res) => res.pools),
							Effect.catchAll(() => Effect.succeed([] as ClosedPool[])),
						),
					);
					const pages = yield* Effect.all(effects, { concurrency: 10 });
					return pages.flat() as ClosedPool[];
				}).pipe(Effect.catchAll(() => Effect.succeed([] as ClosedPool[]))),
			],
			{ concurrency: "unbounded" },
		);

		const closedAll =
			rawClosedAll.length === 0
				? ([] as ClosedPoolWithIcons[])
				: yield* enrichWithIcons(rawClosedAll, api, solPrice).pipe(
						Effect.catchAll(() => Effect.succeed([] as ClosedPoolWithIcons[])),
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
		const critical = yield* Effect.tryPromise(() => fetchPortfolioCritical()).pipe(
			Effect.flatMap((c) =>
				c.ok ? Effect.succeed(c as PortfolioCritical) : Effect.fail(new Error((c as { error: string }).error)),
			),
		);
		const api = yield* MeteoraApi;
		const dlmm = yield* Dlmm;
		const [enrichedPnl, live] = yield* Effect.all(
			[
				api
					.enrichOpenPortfolioPnl([...critical.pools] as OpenPool[], critical.wallet, { withRanges: false })
					.pipe(Effect.catchAll(() => Effect.succeed([...critical.pools] as OpenPool[]))),
				dlmm.fetchUserPositions(critical.wallet).pipe(Effect.catchAll(() => Effect.succeed([] as never[]))),
			],
			{ concurrency: "unbounded" },
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
			total: critical.total,
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
	readonly { poolAddress: string; tokenXIcon: string | null; tokenYIcon: string | null; mcap: number | null }[]
> {
	const program = Effect.gen(function* () {
		const api = yield* MeteoraApi;
		const config = yield* AppConfig;
		const current = yield* config.get;
		const solPrice = yield* api
			.openPortfolio((yield* config.wallet()), 1, 1)
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
			closedPositions: deferred.closedPositions,
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

export function fetchOpenRanges(poolAddresses?: readonly string[]): Promise<Record<string, { minPrice: string; maxPrice: string; poolActivePrice: string }[]>> {
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
		const ranges: Record<string, { minPrice: string; maxPrice: string; poolActivePrice: string }[]> = {};
		yield* Effect.forEach(
			pools,
			(pool) =>
				api
					.positionPnl(pool.poolAddress, wallet, "open")
					.pipe(
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
			{ concurrency: 10, discard: true },
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
