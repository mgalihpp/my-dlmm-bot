import { Context, Effect, type Either, Layer } from "effect";
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
import { Okx } from "./Okx.js";
import { RugCheck } from "./RugCheck.js";

export interface ScreeningService {
	readonly screen: (opts?: {
		timeframe?: string;
		category?: string;
		displayLimit?: number;
		poolsOverride?: PoolsConfig;
	}) => Effect.Effect<
		ScreenResult,
		MeteoraApiError | DecodeError,
		Okx | Jupiter | RugCheck
	>;
}

export class Screening extends Context.Tag("Screening")<
	Screening,
	ScreeningService
>() {}

const make = Effect.gen(function* () {
	const config = yield* AppConfig;
	const api = yield* MeteoraApi;
	const rugcheck = yield* RugCheck;
	const okx = yield* Okx;
	const jupiter = yield* Jupiter;

	const service: ScreeningService = {
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

				yield* Effect.forEach(
					result.pools,
					(pool) =>
						rugcheck.getScore(pool.baseMint).pipe(
							Effect.map((score) => {
								(pool as { rugScore?: number | null }).rugScore = score;
							}),
							Effect.catchAll(() => Effect.succeed(void 0)),
						),
					{ concurrency: 5, discard: true },
				);

				yield* Effect.forEach(
					result.pools,
					(pool) =>
						api.poolOhlcv(pool.pool, { timeframe: "24h" }).pipe(
							Effect.map((res) => {
								const high = res.data.reduce(
									(max, c) => Math.max(max, c.high),
									0,
								);
								if (high > 0) {
									(pool as { fromAthPct: number }).fromAthPct =
										1 - pool.price / high;
								}
							}),
							Effect.catchAll(() => Effect.succeed(void 0)),
						),
					{ concurrency: 5, discard: true },
				);

				yield* Effect.forEach(
					result.pools,
					(pool) =>
						Effect.gen(function* () {
							const mint = pool.baseMint;
							if (!mint) return;
							const [adv, risk, price, audit] = yield* Effect.all(
								[
									okx.advancedInfo(mint).pipe(Effect.either),
									okx.riskFlags(mint).pipe(Effect.either),
									okx.priceInfo(mint).pipe(Effect.either),
									jupiter.search(mint).pipe(Effect.either),
								],
								{ concurrency: 4 },
							);
							const assign = <T>(e: Either.Either<T, unknown>): T | null =>
								e._tag === "Left" ? null : e.right;
							const poolMut = pool as {
								bundlePct?: number | null;
								top10Pct?: number | null;
								botHoldersPct?: number | null;
								globalFeesSol?: number | null;
								isRugpull?: boolean | null;
								isWash?: boolean | null;
								devSoldAll?: boolean | null;
								dexScreenerPaid?: boolean | null;
								priceVsAthPct?: number | null;
							};
							const a = assign(adv);
							poolMut.bundlePct = a?.bundlePct ?? null;
							poolMut.top10Pct = a?.top10Pct ?? null;
							poolMut.devSoldAll = a?.devSoldAll ?? null;
							poolMut.dexScreenerPaid = a?.dexScreenerPaid ?? null;
							const r = assign(risk);
							poolMut.isRugpull = r?.isRugpull ?? null;
							poolMut.isWash = r?.isWash ?? null;
							const p = assign(price);
							poolMut.priceVsAthPct = p?.priceVsAthPct ?? null;
							const t = assign(audit);
							poolMut.botHoldersPct = t?.botHoldersPct ?? null;
							poolMut.top10Pct = t?.top10Pct ?? null;
							poolMut.globalFeesSol = t?.globalFeesSol ?? null;
						}),
					{ concurrency: 5, discard: true },
				);

				return result;
			}),
	};
	return service;
});

export const ScreeningLive = Layer.effect(Screening, make);

export type { ScreenResult };
