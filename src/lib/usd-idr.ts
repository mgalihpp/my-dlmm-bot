import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { Effect, Schema } from "effect";

const ER_API_URL = "https://open.er-api.com/v6/latest/USD";

const UsdIdrResponse = Schema.Struct({
	rates: Schema.Struct({ IDR: Schema.Number }),
});

/** Pure validation for the FX payload. Anything unexpected is null. */
export function parseUsdIdrRate(raw: unknown): number | null {
	const decoded = Schema.decodeUnknownEither(UsdIdrResponse)(raw);
	if (decoded._tag === "Left") return null;
	const rate = decoded.right.rates.IDR;
	return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function fetchOnce(): Effect.Effect<number | null, never, never> {
	return Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;
		const res = yield* HttpClientRequest.get(ER_API_URL).pipe(
			client.execute,
			Effect.flatMap((r) =>
				HttpClientResponse.schemaBodyJson(Schema.Unknown)(r),
			),
		);
		return parseUsdIdrRate(res);
	}).pipe(
		Effect.catchAll((cause) =>
			Effect.logWarning(
				"live USD-IDR rate unavailable, falling back to USD-only display",
				cause,
			).pipe(Effect.as(null)),
		),
		Effect.provide(FetchHttpClient.layer),
	);
}

const RATE_TTL_MS = 6 * 3_600_000;
let cached: { rate: number | null; atMs: number } | null = null;

/** Live USD to IDR rate with a 6h in-process cache. Null when unreachable. */
export const liveUsdToIdr: Effect.Effect<number | null, never, never> =
	Effect.gen(function* () {
		const now = Date.now();
		if (cached !== null && now - cached.atMs < RATE_TTL_MS) return cached.rate;
		const rate = yield* fetchOnce();
		// Cache hits for 6h. Misses retry on the next call so a single
		// outage does not hide the IDR tab for hours.
		if (rate !== null) cached = { rate, atMs: now };
		return rate;
	});
