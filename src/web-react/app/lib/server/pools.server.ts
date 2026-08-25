import "~/lib/server/env.server";

import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { errorMessage } from "@vexis/errors.js";
import { AppLayer } from "@vexis/layers.js";
import { AppConfig } from "@vexis/services/Config.js";
import { Screening } from "@vexis/services/Screening.js";
import { Effect, Schema } from "effect";
import { buildPoolsPayload, type PoolsPayload, TIMEFRAMES } from "~/lib/pools";

const SOL_MINT = "So11111111111111111111111111111111111111112";

const PriceResponse = Schema.Record({
	key: Schema.String,
	value: Schema.Struct({
		usdPrice: Schema.Number,
	}),
});

const CoinGeckoPriceResponse = Schema.Struct({
	solana: Schema.Struct({ usd: Schema.Number }),
});

function fetchCoinGeckoSolPrice(): Effect.Effect<number | null, never, never> {
	return Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;
		const res = yield* HttpClientRequest.get(
			"https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
		).pipe(
			client.execute,
			Effect.flatMap((r) =>
				HttpClientResponse.schemaBodyJson(CoinGeckoPriceResponse)(r),
			),
		);
		return res.solana.usd;
	}).pipe(
		Effect.catchAll(() => Effect.succeed(null)),
		Effect.provide(FetchHttpClient.layer),
	);
}

function fetchSolPrice(): Effect.Effect<number | null, never, never> {
	return Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;
		const res = yield* HttpClientRequest.get(
			`https://api.jup.ag/price/v3?ids=${SOL_MINT}`,
		).pipe(
			client.execute,
			Effect.flatMap((r) =>
				HttpClientResponse.schemaBodyJson(PriceResponse)(r),
			),
		);
		return res[SOL_MINT]?.usdPrice ?? null;
	}).pipe(
		Effect.catchAll(() => fetchCoinGeckoSolPrice()),
		Effect.provide(FetchHttpClient.layer),
	);
}

export interface PoolsCritical extends PoolsPayload {
	readonly pools: readonly import("@vexis/domain/index.js").ScreenedPool[];
}

const poolsCriticalCache = new Map<
	string,
	{ at: number; data: PoolsPayload }
>();
const POOLS_CACHE_TTL_MS = 30_000;
// keep stale for 5m to serve instantly while revalidating in background
const POOLS_STALE_MS = 5 * 60 * 1000;
const poolsInFlight = new Map<string, Promise<PoolsPayload>>();

export function fetchPoolsCritical(
	rawTimeframe: string | null,
): Promise<PoolsPayload> {
	const cacheKey = rawTimeframe ?? "__default__";
	const cached = poolsCriticalCache.get(cacheKey);
	const now = Date.now();
	if (cached && now - cached.at < POOLS_CACHE_TTL_MS) {
		return Promise.resolve(cached.data);
	}
	// stale-while-revalidate: serve stale instantly (stream), refresh in background
	if (cached && now - cached.at < POOLS_STALE_MS) {
		if (!poolsInFlight.has(cacheKey)) {
			const bg = doFetchPoolsCritical(rawTimeframe, cacheKey).finally(() =>
				poolsInFlight.delete(cacheKey),
			);
			poolsInFlight.set(cacheKey, bg);
		}
		return Promise.resolve(cached.data);
	}
	const inFlight = poolsInFlight.get(cacheKey);
	if (inFlight) return inFlight;
	const promise = doFetchPoolsCritical(rawTimeframe, cacheKey).finally(() =>
		poolsInFlight.delete(cacheKey),
	);
	poolsInFlight.set(cacheKey, promise);
	return promise;
}

function doFetchPoolsCritical(
	rawTimeframe: string | null,
	cacheKey: string,
): Promise<PoolsPayload> {
	const program = Effect.gen(function* () {
		const config = yield* AppConfig;
		const current = yield* config.get;
		const configured = current.pools?.timeframe ?? "30m";
		const timeframe =
			rawTimeframe !== null &&
			(TIMEFRAMES as readonly string[]).includes(rawTimeframe)
				? rawTimeframe
				: configured;
		const screening = yield* Screening;
		const [result, solPrice] = yield* Effect.all(
			[screening.screen({ timeframe, skipEnrich: true }), fetchSolPrice()],
			{ concurrency: "unbounded" },
		);
		const payload = buildPoolsPayload(result, solPrice, timeframe);
		return { ...payload, wallet: current.wallet, rpc: current.rpcUrl };
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll((error) =>
			Effect.succeed({
				ok: false,
				error: errorMessage(error),
				timeframe: rawTimeframe ?? "30m",
				total: 0,
				filtered: 0,
				pools: [],
				solPrice: null,
				fetchedAt: Date.now(),
			} satisfies PoolsPayload),
		),
		Effect.tap((payload) =>
			Effect.sync(() => {
				poolsCriticalCache.set(cacheKey, { at: Date.now(), data: payload });
			}),
		),
	);
	return Effect.runPromise(program);
}

export function fetchPoolsDeferred(
	pools: readonly import("@vexis/domain/index.js").ScreenedPool[],
): Promise<readonly import("@vexis/domain/index.js").ScreenedPool[]> {
	const cloned = pools.map((p) => ({ ...p }));
	const program = Effect.gen(function* () {
		const screening = yield* Screening;
		yield* screening.enrichPools(cloned);
		return cloned as readonly import("@vexis/domain/index.js").ScreenedPool[];
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll(() =>
			Effect.succeed(
				cloned as readonly import("@vexis/domain/index.js").ScreenedPool[],
			),
		),
	);
	return Effect.runPromise(program);
}

export function fetchPools(rawTimeframe: string | null): Promise<PoolsPayload> {
	const program = Effect.gen(function* () {
		const config = yield* AppConfig;
		const current = yield* config.get;
		const configured = current.pools?.timeframe ?? "30m";
		const timeframe =
			rawTimeframe !== null &&
			(TIMEFRAMES as readonly string[]).includes(rawTimeframe)
				? rawTimeframe
				: configured;
		const screening = yield* Screening;
		const [result, solPrice] = yield* Effect.all(
			[screening.screen({ timeframe }), fetchSolPrice()],
			{ concurrency: "unbounded" },
		);
		const payload = buildPoolsPayload(result, solPrice, timeframe);
		return { ...payload, wallet: current.wallet, rpc: current.rpcUrl };
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll((error) =>
			Effect.succeed({
				ok: false,
				error: errorMessage(error),
				timeframe: rawTimeframe ?? "30m",
				total: 0,
				filtered: 0,
				pools: [],
				solPrice: null,
				fetchedAt: Date.now(),
			} satisfies PoolsPayload),
		),
	);
	return Effect.runPromise(program);
}
