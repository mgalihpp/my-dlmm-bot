import { Context, Duration, Effect, Layer, ParseResult, Schedule, Schema } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import {
  ClosedPortfolioResponse,
  DiscoveryPoolsResponse,
  DlmmPool,
  DlmmPoolsResponse,
  OpenPool,
  OpenPortfolioResponse,
  PoolHistoricalVolumeArray,
  PortfolioTotal,
  PositionPnLResponse,
  type PoolHistoricalVolume,
  type PositionPnlEntry,
} from "../domain/index.js";
import { DecodeError, MeteoraApiError } from "../errors.js";
import { AppConfig } from "./Config.js";

const PROD = "https://dlmm.datapi.meteora.ag";
const DEV = "https://dlmm.dev.metdev.io";
const DISCOVERY_API = "https://pool-discovery-api.datapi.meteora.ag";

type PositionStatus = "open" | "closed" | "all";

export interface MeteoraApiService {
  readonly totalPnl: (user: string) => Effect.Effect<PortfolioTotal, MeteoraApiError | DecodeError>;
  readonly openPortfolio: (
    user: string,
    page?: number,
    pageSize?: number,
  ) => Effect.Effect<OpenPortfolioResponse, MeteoraApiError | DecodeError>;
  readonly closedPortfolio: (
    user: string,
    page?: number,
    pageSize?: number,
  ) => Effect.Effect<ClosedPortfolioResponse, MeteoraApiError | DecodeError>;
  readonly pool: (address: string) => Effect.Effect<DlmmPool, MeteoraApiError | DecodeError>;
  readonly pools: (opts?: {
    sortBy?: string;
    query?: string;
    page?: number;
    pageSize?: number;
    filterBy?: string;
  }) => Effect.Effect<DlmmPoolsResponse, MeteoraApiError | DecodeError>;
  readonly positionPnl: (
    poolAddress: string,
    user: string,
    status?: PositionStatus,
    page?: number,
    pageSize?: number,
  ) => Effect.Effect<PositionPnLResponse, MeteoraApiError | DecodeError>;
  readonly enrichOpenPortfolioPnl: (
    pools: readonly OpenPool[],
    wallet: string,
  ) => Effect.Effect<OpenPool[]>;
  readonly poolHistoricalVolume: (
    address: string,
  ) => Effect.Effect<readonly PoolHistoricalVolume[], MeteoraApiError | DecodeError>;
  readonly discoverPools: (opts?: {
    pageSize?: number;
    filterBy?: string;
    timeframe?: string;
    category?: string;
  }) => Effect.Effect<DiscoveryPoolsResponse, MeteoraApiError | DecodeError>;
}

export class MeteoraApi extends Context.Tag("MeteoraApi")<MeteoraApi, MeteoraApiService>() {}

const retryPolicy = Schedule.exponential(Duration.millis(400)).pipe(
  Schedule.intersect(Schedule.recurs(2)),
);

const transient = (e: MeteoraApiError | DecodeError): boolean =>
  e._tag === "MeteoraApiError" && (e.status === undefined || e.status === 429 || e.status >= 500);

const make = Effect.gen(function* () {
  const config = yield* AppConfig;
  const cfg = yield* config.get;
  const base = cfg.dev ? DEV : PROD;
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.setHeader("accept", "application/json")),
  );

  const getJson = <A, I>(
    baseUrl: string,
    path: string,
    params: Record<string, string | number | undefined>,
    schema: Schema.Schema<A, I>,
  ): Effect.Effect<A, MeteoraApiError | DecodeError> => {
    const url = new URL(path, baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    return client.get(url.toString()).pipe(
      Effect.mapError(
        (e) => new MeteoraApiError({ path, message: `Request failed: ${e.message}` }),
      ),
      Effect.flatMap((res) =>
        res.status >= 200 && res.status < 300
          ? Effect.succeed(res)
          : res.text.pipe(
              Effect.orElseSucceed(() => ""),
              Effect.flatMap((body) =>
                Effect.fail(
                  new MeteoraApiError({
                    path,
                    status: res.status,
                    message: `Meteora API ${res.status} for ${path}${body ? `: ${body}` : ""}`,
                  }),
                ),
              ),
            ),
      ),
      Effect.flatMap((res) =>
        HttpClientResponse.schemaBodyJson(schema)(res).pipe(
          Effect.mapError(
            (e) =>
              new DecodeError({
                source: path,
                message:
                  ParseResult.isParseError(e)
                    ? `Unexpected response shape from ${path}:\n${ParseResult.ArrayFormatter.formatErrorSync(e)
                        .slice(0, 5)
                        .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
                        .join("\n")}`
                    : String(e),
              }),
          ),
        ),
      ),
      Effect.retry({ schedule: retryPolicy, while: transient }),
      Effect.scoped,
    );
  };

  const positionPnl = (
    poolAddress: string,
    user: string,
    status?: PositionStatus,
    page?: number,
    pageSize?: number,
  ) =>
    getJson(base, `/positions/${poolAddress}/pnl`, {
      user,
      status: status ?? "all",
      page: page ?? 1,
      page_size: pageSize ?? 100,
    }, PositionPnLResponse);

  const service: MeteoraApiService = {
    totalPnl: (user) => getJson(base, "/portfolio/total", { user }, PortfolioTotal),
    openPortfolio: (user, page = 1, pageSize = 50) =>
      getJson(base, "/portfolio/open", { user, page, page_size: pageSize }, OpenPortfolioResponse),
    closedPortfolio: (user, page = 1, pageSize = 50) =>
      getJson(base, "/portfolio", { user, page, page_size: pageSize }, ClosedPortfolioResponse),
    pool: (address) => getJson(base, `/pools/${address}`, {}, DlmmPool),
    pools: (opts) => {
      const sortBy = opts?.sortBy?.includes(":")
        ? opts.sortBy
        : opts?.sortBy
          ? `${opts.sortBy}:desc`
          : "fee_tvl_ratio_24h:desc";
      return getJson(base, "/pools", {
        sort_by: sortBy,
        query: opts?.query,
        page: opts?.page ?? 1,
        page_size: opts?.pageSize,
        filter_by: opts?.filterBy,
      }, DlmmPoolsResponse);
    },
    positionPnl,
    enrichOpenPortfolioPnl: (pools, wallet) =>
      Effect.gen(function* () {
        const enriched = pools.map((p) => ({ ...p }));
        yield* Effect.forEach(
          enriched.filter((pool) => pool.openPositionCount > 1),
          (pool) =>
            positionPnl(pool.poolAddress, wallet, "open").pipe(
              Effect.map((res) => {
                const entries: PositionPnlEntry[] = res.positions.map((pos) => ({
                  address: pos.positionAddress,
                  pnlUsd: pos.pnlUsd,
                  pnlPctChange: pos.pnlPctChange,
                  pnlSol: pos.pnlSol != null ? String(pos.pnlSol) : null,
                  pnlSolPctChange: pos.pnlSolPctChange != null ? String(pos.pnlSolPctChange) : null,
                }));
                (pool as { positionsPnl?: PositionPnlEntry[] }).positionsPnl = entries;
              }),
              Effect.ignore,
            ),
          { concurrency: 5, discard: true },
        );
        return enriched;
      }),
    poolHistoricalVolume: (address) =>
      getJson(base, `/pools/${address}/historical-volume`, {}, PoolHistoricalVolumeArray),
    discoverPools: (opts) =>
      getJson(DISCOVERY_API, "/pools", {
        page_size: opts?.pageSize ?? 50,
        filter_by: opts?.filterBy,
        timeframe: opts?.timeframe,
        category: opts?.category,
      }, DiscoveryPoolsResponse),
  };
  return service;
});

export const MeteoraApiLayer = Layer.effect(MeteoraApi, make);

export const MeteoraApiLive = MeteoraApiLayer.pipe(
  Layer.provide(FetchHttpClient.layer),
);
