import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { RugCheck, RugCheckLayer } from "../src/services/RugCheck.js";

const jsonResponse = (url: string, body: unknown, status = 200) =>
	HttpClientResponse.fromWeb(
		HttpClientRequest.get(url),
		new Response(JSON.stringify(body), { status }),
	);

const layerWith = (
	handler: (url: string) => { body: unknown; status?: number },
) =>
	RugCheckLayer.pipe(
		Layer.provide(
			Layer.succeed(
				HttpClient.HttpClient,
				HttpClient.make((req) => {
					const { body, status } = handler(req.url.toString());
					return Effect.succeed(
						jsonResponse(req.url.toString(), body, status ?? 200),
					);
				}),
			),
		),
	);

describe("RugCheck", () => {
	it("getSummary returns score and risks", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const r = yield* RugCheck;
				return yield* r.getSummary("Mint111");
			}).pipe(
				Effect.provide(
					layerWith(() => ({
						body: {
							score: 1200,
							score_normalised: 0.8,
							lpLockedPct: 90,
							tokenType: "token",
							tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
							risks: [
								{
									name: "Liquidity Removal",
									level: "danger",
									score: 500,
									description: "LP can be removed",
								},
								{ name: "Wash Trading", level: "warning", score: 200 },
							],
						},
					})),
				),
			),
		);
		expect(result).toEqual({
			score: 1200,
			risks: [
				{ name: "Liquidity Removal", level: "danger" },
				{ name: "Wash Trading", level: "warning" },
			],
			lpLockedPct: 90,
		});
	});

	it("returns null on 404", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const r = yield* RugCheck;
				return yield* r.getSummary("GhostMint");
			}).pipe(
				Effect.provide(
					layerWith(() => ({ body: { error: "not found" }, status: 404 })),
				),
			),
		);
		expect(result).toBeNull();
	});

	it("returns null on non-404 API error", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const r = yield* RugCheck;
				return yield* r.getSummary("RateLimited");
			}).pipe(
				Effect.provide(
					layerWith(() => ({ body: { error: "rate limit" }, status: 429 })),
				),
			),
		);
		expect(result).toBeNull();
	});
});
