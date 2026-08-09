import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { Jupiter, JupiterLayer } from "../src/services/Jupiter.js";

const jsonResponse = (url: string, body: unknown, status = 200) =>
	HttpClientResponse.fromWeb(
		HttpClientRequest.get(url),
		new Response(JSON.stringify(body), { status }),
	);

const layerWith = (
	handler: (url: string) => { body: unknown; status?: number },
) =>
	JupiterLayer.pipe(
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

describe("Jupiter", () => {
	it("decodes audit + fees from array response", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const j = yield* Jupiter;
				return yield* j.search("Mint111");
			}).pipe(
				Effect.provide(
					layerWith(() => ({
						body: [
							{
								id: "Mint111",
								fees: 45.2,
								dexPaidAt: "2026-01-01T00:00:00Z",
								audit: {
									topHoldersPercentage: 55,
									botHoldersPercentage: 22,
									bundlerStats: {
										holdingPct: 0.7,
									},
								},
							},
						],
					})),
				),
			),
		);
		expect(result).toEqual({
			botHoldersPct: 22,
			top10Pct: 55,
			globalFeesSol: 45.2,
			bundlePct: 0.7,
			dexScreenerPaid: true,
		});
	});

	it("handles string-typed numeric fields", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const j = yield* Jupiter;
				return yield* j.search("Mint111");
			}).pipe(
				Effect.provide(
					layerWith(() => ({
						body: {
							id: "Mint111",
							fees: "10",
							audit: {
								topHoldersPercentage: "70",
								botHoldersPercentage: "5",
							},
						},
					})),
				),
			),
		);
		expect(result).toEqual({
			botHoldersPct: 5,
			top10Pct: 70,
			globalFeesSol: 10,
			bundlePct: null,
			dexScreenerPaid: false,
		});
	});

	it("returns null when no token found", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const j = yield* Jupiter;
				return yield* j.search("Mint111");
			}).pipe(Effect.provide(layerWith(() => ({ body: [] })))),
		);
		expect(result).toBeNull();
	});
});
