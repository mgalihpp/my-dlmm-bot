import "~/lib/server/env.server";

import { join } from "node:path";
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
import { repoRoot } from "./env.server";
import {
	type PortfolioSnapshot,
	readHistory,
	recordSnapshot,
} from "./portfolio-history";

const HISTORY_FILE = join(repoRoot(), ".vexis-portfolio-history.json");

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

export type { PortfolioSnapshot, PortfolioTotal };

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
	readonly history?: readonly PortfolioSnapshot[];
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
						iconCache.set(pool.poolAddress, { at: now });
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
	readonly history: readonly PortfolioSnapshot[];
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
			recordSnapshot(
				{
					ts: Math.floor(Date.now() / 1000),
					pnlUsd: summary.unrealizedUsd,
					pnlSol: summary.unrealizedSol,
					balanceUsd: summary.openBalanceUsd,
					feesUsd: summary.openFeesUsd,
				},
				HISTORY_FILE,
			);
			const payload: PortfolioCritical = {
				ok: true as const,
				wallet,
				rpc: current.rpcUrl ?? "rpc not configured",
				solPrice: parseNum(res.solPrice),
				total: apiTotals,
				summary,
				pools: res.pools,
				history: readHistory(HISTORY_FILE),
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
			{ concurrency: "unbounded" },
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
			history: critical.history,
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
