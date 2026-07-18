import { Context, Effect, Layer } from "effect";
import type { PoolsConfig } from "../domain/config.js";
import { DecodeError, MeteoraApiError } from "../errors.js";
import { buildDiscoveryFilter, finalizeScreen, type ScreenResult } from "../lib/screening.js";
import { AppConfig } from "./Config.js";
import { MeteoraApi } from "./MeteoraApi.js";
import { RugCheck } from "./RugCheck.js";

export interface ScreeningService {
  readonly screen: (opts?: {
    timeframe?: string;
    category?: string;
    displayLimit?: number;
    poolsOverride?: PoolsConfig;
  }) => Effect.Effect<ScreenResult, MeteoraApiError | DecodeError, RugCheck>;
}

export class Screening extends Context.Tag("Screening")<Screening, ScreeningService>() {}

const make = Effect.gen(function* () {
  const config = yield* AppConfig;
  const api = yield* MeteoraApi;

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
        const res = yield* api.discoverPools({ pageSize, filterBy, timeframe, category });

        const rawPools = Array.isArray(res.data) ? res.data : [];
        const result = finalizeScreen(rawPools, res.total, displayLimit);

        const rugcheck = yield* RugCheck;
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

        return result;
      }),
  };
  return service;
});

export const ScreeningLive = Layer.effect(Screening, make);

export type { ScreenResult };
