import { HttpServerRequest } from "@effect/platform";
import { Effect } from "effect";
import { poolsContent } from "../pages/pools.js";
import { pageResponse, partialResponse, type ShellInfo } from "./shared.js";

export function poolsRoutes(shell: ShellInfo) {
	const poolsRoute = Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const url = new URL(request.url, "http://localhost");
		const rawLimit = url.searchParams.get("limit");
		const parsedLimit = rawLimit === null ? null : Number(rawLimit);
		const displayLimit =
			parsedLimit !== null &&
			Number.isSafeInteger(parsedLimit) &&
			parsedLimit > 0
				? parsedLimit
				: null;
		return yield* poolsContent({
			timeframe: url.searchParams.get("timeframe"),
			displayLimit,
		});
	});

	return {
		page: poolsRoute.pipe(
			Effect.map((inner) =>
				pageResponse("Pool Radar", "pools", inner, null, shell),
			),
		),
		partial: poolsRoute.pipe(
			Effect.map((inner) => partialResponse(inner, null)),
		),
	};
}
