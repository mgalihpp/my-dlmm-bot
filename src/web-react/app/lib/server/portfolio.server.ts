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
import { MeteoraApi } from "@vexis/services/MeteoraApi.js";
import { resolveWebConfig } from "@vexis/web/config.js";
import {
	type PortfolioSnapshot,
	readHistory,
	recordSnapshot,
} from "@vexis/web/portfolio-history.js";
import { Effect } from "effect";
import { repoRoot } from "./env.server";

const HISTORY_FILE = join(repoRoot(), ".vexis-portfolio-history.json");

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
	readonly total?: PortfolioTotal;
	readonly summary?: PortfolioSummary;
	readonly pools?: readonly OpenPool[];
	readonly history?: readonly PortfolioSnapshot[];
	readonly closed?: {
		readonly pools: readonly ClosedPool[];
		readonly page: number;
		readonly pageSize: number;
		readonly totalCount: number;
	};
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
				Effect.catchAll(() => Effect.succeed([] as OpenPool[])),
			);

		const closedRes = yield* api
			.closedPortfolio(wallet, closedPage, 10)
			.pipe(Effect.catchAll(() => Effect.succeed(null)));

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
			total,
			summary,
			pools: open,
			history: readHistory(HISTORY_FILE),
			closed:
				closedRes !== null
					? {
							pools: closedRes.pools,
							page: closedRes.page,
							pageSize: closedRes.pageSize,
							totalCount: closedRes.totalCount,
						}
					: { pools: [], page: closedPage, pageSize: 10, totalCount: 0 },
		} satisfies PortfolioPayload;
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll((error) =>
			Effect.succeed({
				ok: false,
				error: errorMessage(error),
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
