import { Context, Duration, Effect, type Either, Layer } from "effect";
import type { PoolsConfig } from "../domain/config.js";
import type { DecodeError, MeteoraApiError } from "../errors.js";
import {
	buildDiscoveryFilter,
	finalizeScreen,
	type ScreenResult,
} from "../lib/screening.js";
import { AppConfig } from "./Config.js";
import { Jupiter } from "./Jupiter.js";
import { MeteoraApi } from "./MeteoraApi.js";
import { RugCheck } from "./RugCheck.js";

export interface ScreeningService {
	readonly screen: (opts?: {
		timeframe?: string;
		category?: string;
		displayLimit?: number;
		poolsOverride?: PoolsConfig;
		skipEnrich?: boolean;
	}) => Effect.Effect<
		ScreenResult,
		MeteoraApiError | DecodeError,
		Jupiter | RugCheck
	>;
	readonly enrichPools: (
		pools: readonly import("../domain/screened.js").ScreenedPool[],
	) => Effect.Effect<void, never, Jupiter | RugCheck>;
}

export class Screening extends Context.Tag("Screening")<
	Screening,
	ScreeningService
>() {}

const make = Effect.gen(function* () {
	const config = yield* AppConfig;
	const api = yield* MeteoraApi;
	const rugcheck = yield* RugCheck;
	const jupiter = yield* Jupiter;

	const enrichPools = (
		pools: readonly import("../domain/screened.js").ScreenedPool[],
	) =>
		Effect.forEach(
			pools,
			(pool, idx) =>
				Effect.all(
					[
						api.poolOhlcv(pool.pool, { timeframe: "24h" }).pipe(
							Effect.map((res) => {
								const high = res.data.reduce(
									(max, c) => Math.max(max, c.high),
									0,
								);
								if (high > 0) {
									const pctFromAth = 1 - pool.price / high;
									(pool as { fromAthPct: number }).fromAthPct = pctFromAth;
									(pool as { priceVsAthPct: number }).priceVsAthPct =
										(pool.price / high) * 100;
								}
								(pool as { priceSeries: number[] | null }).priceSeries =
									res.data.map((c) => c.close).slice(-48);
							}),
							Effect.catchAll(() => Effect.succeed(void 0)),
						),
						Effect.gen(function* () {
							const mint = pool.baseMint;
							if (!mint) return;
							const [audit, summary] = yield* Effect.all(
								[
									jupiter.search(mint).pipe(Effect.either),
									rugcheck.getSummary(mint).pipe(Effect.either),
								],
								{ concurrency: 2 },
							);
							const assign = <T>(e: Either.Either<T, unknown>): T | null =>
								e._tag === "Left" ? null : e.right;
							const poolMut = pool as {
								rugScore?: number | null;
								bundlePct?: number | null;
								top10Pct?: number | null;
								botHoldersPct?: number | null;
								globalFeesSol?: number | null;
								dexScreenerPaid?: boolean | null;
								isRugpull?: boolean | null;
								isWash?: boolean | null;
								devSoldAll?: boolean | null;
								lpLockedPct?: number | null;
							};
							const t = assign(audit);
							poolMut.bundlePct = t?.bundlePct ?? null;
							poolMut.top10Pct = t?.top10Pct ?? null;
							poolMut.botHoldersPct = t?.botHoldersPct ?? null;
							poolMut.globalFeesSol = t?.globalFeesSol ?? null;
							poolMut.dexScreenerPaid = t?.dexScreenerPaid ?? null;
							const s = assign(summary);
							poolMut.rugScore = s?.score ?? null;
							poolMut.lpLockedPct = s?.lpLockedPct ?? null;
							poolMut.isRugpull =
								s?.risks?.some(
									(r) =>
										r.name.includes("Liquidity Removal") &&
										r.level === "danger",
								) ?? null;
							poolMut.isWash =
								s?.risks?.some((r) => /wash/i.test(r.name)) ?? null;
							poolMut.devSoldAll =
								s?.risks?.some(
									(r) => /dev.*sold/i.test(r.name) && r.level === "danger",
								) ?? null;
						}).pipe(Effect.catchAll(() => Effect.succeed(void 0))),
					],
					{ concurrency: 2, discard: true },
				).pipe(
					Effect.tap(() =>
						idx < pools.length - 1
							? Effect.sleep(Duration.millis(650))
							: Effect.succeed(void 0),
					),
				),
			{ concurrency: 1, discard: true }, // sequential 1 + 650ms gap ~= 1 RPS for RugCheck free tier; bump with paid plan
		);

	const service: ScreeningService = {
		enrichPools,
		screen: (opts) =>
			Effect.gen(function* () {
				const cfg = yield* config.get;
				const poolCfg = opts?.poolsOverride ?? cfg.pools ?? {};

				const timeframe = opts?.timeframe ?? poolCfg.timeframe ?? "5m";
				const category = opts?.category ?? poolCfg.category ?? "trending";
				const pageSize = poolCfg.pageSize ?? 50;
				const displayLimit = opts?.displayLimit ?? poolCfg.displayLimit ?? 15;

				const filterBy = buildDiscoveryFilter(poolCfg, timeframe);
				const res = yield* api.discoverPools({
					pageSize,
					filterBy,
					timeframe,
					category,
				});

				const rawPools = Array.isArray(res.data) ? res.data : [];
				const result = finalizeScreen(rawPools, res.total, displayLimit);

				if (opts?.skipEnrich !== true) {
					yield* enrichPools(result.pools);
				}

				return result;
			}),
	};
	return service;
});

export const ScreeningLive = Layer.effect(Screening, make);

export type { ScreenResult };
