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

const PriceResponse = Schema.Struct({
	data: Schema.Record({
		key: Schema.String,
		value: Schema.Struct({
			price: Schema.NumberFromString,
		}),
	}),
});

function fetchSolPrice(): Effect.Effect<number | null, never, never> {
	return Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;
		const res = yield* HttpClientRequest.get(
			`https://price.jup.ag/v6/price?ids=${SOL_MINT}`,
		).pipe(
			client.execute,
			Effect.flatMap((r) =>
				HttpClientResponse.schemaBodyJson(PriceResponse)(r),
			),
		);
		return res.data[SOL_MINT]?.price ?? null;
	}).pipe(
		Effect.provide(FetchHttpClient.layer),
		Effect.catchAll(() => Effect.succeed(null)),
	);
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
		const result = yield* screening.screen({ timeframe });
		const solPrice = yield* fetchSolPrice();
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
