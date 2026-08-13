import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { errorMessage } from "../../errors.js";
import { errorBanner } from "../layout.js";
import {
	closedPositionsContent,
	portfolioContent,
} from "../pages/portfolio.js";
import { pageResponse, partialResponse, type ShellInfo } from "./shared.js";

export function portfolioRoutes(shell: ShellInfo) {
	const portfolioRoute = Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const url = new URL(request.url, "http://localhost");
		const rawPage = url.searchParams.get("closedPage");
		const parsedPage = rawPage === null ? 1 : Number(rawPage);
		const closedPage =
			Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
		const refreshPath =
			closedPage > 1
				? `/partials/portfolio?closedPage=${closedPage}`
				: "/partials/portfolio";
		const inner = yield* portfolioContent({ closedPage });
		return { inner, refreshPath };
	});

	const closedDetail = Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const url = new URL(request.url, "http://localhost");
		const pool = url.searchParams.get("pool") ?? "";
		const pair = url.searchParams.get("pair") ?? "";
		const html = yield* closedPositionsContent(pool, pair).pipe(
			Effect.catchAll((error) =>
				Effect.succeed(errorBanner(errorMessage(error))),
			),
		);
		return HttpServerResponse.html(html);
	});

	return {
		page: portfolioRoute.pipe(
			Effect.map(({ inner, refreshPath }) =>
				pageResponse("Portfolio", "portfolio", inner, refreshPath, shell),
			),
		),
		partial: portfolioRoute.pipe(
			Effect.map(({ inner, refreshPath }) =>
				partialResponse(inner, refreshPath),
			),
		),
		closedDetail,
	};
}
