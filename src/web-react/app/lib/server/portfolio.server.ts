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
};

export type ClosedPoolWithIcons = ClosedPool & {
	readonly tokenXIcon?: string | null;
	readonly tokenYIcon?: string | null;
};

const iconCache = new Map<string, { x?: string; y?: string; at: number }>();
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
): Effect.Effect<
	Array<T & { tokenXIcon: string | null; tokenYIcon: string | null }>
> {
	return Effect.gen(function* () {
		const now = Date.now();
		const out: Array<
			T & { tokenXIcon: string | null; tokenYIcon: string | null }
		> = [];
		yield* Effect.forEach(
			pools,
			(pool) =>
				Effect.gen(function* () {
					const cached = iconCache.get(pool.poolAddress);
					if (cached && now - cached.at < ICON_CACHE_TTL_MS) {
						out.push({
							...pool,
							tokenXIcon: cached.x ?? null,
							tokenYIcon: cached.y ?? null,
						});
						return;
					}
					const discovery = yield* api
						.discoveryPoolByAddress(pool.poolAddress)
						.pipe(Effect.either);
					if (discovery._tag === "Left") {
						iconCache.set(pool.poolAddress, { at: now });
						out.push({ ...pool, tokenXIcon: null, tokenYIcon: null });
						return;
					}
					const d = discovery.right;
					iconCache.set(pool.poolAddress, {
						x: d.token_x?.icon ?? undefined,
						y: d.token_y?.icon ?? undefined,
						at: now,
					});
					out.push({
						...pool,
						tokenXIcon: d.token_x?.icon ?? null,
						tokenYIcon: d.token_y?.icon ?? null,
					});
				}),
			{ concurrency: 5 },
		);
		return out;
	});
}

export function fetchPortfolio(closedPage: number): Promise<PortfolioPayload> {
	const program = Effect.gen(function* () {
		const config = yield* AppConfig;
		const current = yield* config.get;
		const wallet = yield* config.wallet();
		const api = yield* MeteoraApi;
		const dlmm = yield* Dlmm;

		const res = yield* api.openPortfolio(wallet, 1, 10);
		const apiTotals = res.total ?? null;
		const open = yield* api
			.enrichOpenPortfolioPnl(res.pools, wallet, {
				withRanges: true,
			})
			.pipe(
				Effect.flatMap((enriched) =>
					dlmm.attachLivePositions(enriched, wallet),
				),
				Effect.map((enriched) => {
					for (const pool of enriched) {
						const createdAt = new Map(
							(pool.positionsPnl ?? []).map((position) => [
								position.address,
								position.createdAt,
							]),
						);
						if (pool.positionsLive) {
							for (const position of pool.positionsLive) {
								Object.assign(position, {
									createdAt: createdAt.get(position.address) ?? null,
								});
							}
						}
					}
					return enriched;
				}),
				Effect.flatMap((enriched) => enrichWithIcons(enriched, api)),
				Effect.catchAll(() => Effect.succeed([] as OpenPoolWithIcons[])),
			);

		const closedRes = yield* api
			.closedPortfolio(wallet, closedPage, 10)
			.pipe(Effect.catchAll(() => Effect.succeed(null)));
		const closed =
			closedRes === null ? null : yield* enrichWithIcons(closedRes.pools, api);

		const total = yield* api
			.totalPnl(wallet)
			.pipe(Effect.catchAll(() => Effect.succeed(EMPTY_TOTAL)));

		const summary = computePortfolioSummary(open, apiTotals);
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

		return {
			ok: true,
			wallet,
			rpc: current.rpcUrl ?? "rpc not configured",
			solPrice: parseNum(res.solPrice),
			total,
			summary,
			pools: open,
			history: readHistory(HISTORY_FILE),
			closed:
				closed !== null
					? {
							pools: closed,
							page: closedRes!.page,
							pageSize: closedRes!.pageSize,
							totalCount: closedRes!.totalCount,
						}
					: { pools: [], page: closedPage, pageSize: 10, totalCount: 0 },
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
