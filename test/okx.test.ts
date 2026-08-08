import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { Okx, OkxLayer } from "../src/services/Okx.js";

const jsonResponse = (url: string, body: unknown, status = 200) =>
	HttpClientResponse.fromWeb(
		HttpClientRequest.get(url),
		new Response(JSON.stringify(body), { status }),
	);

const mockClient = (
	handler: (url: string) => { body: unknown; status?: number },
) =>
	Layer.succeed(
		HttpClient.HttpClient,
		HttpClient.make((req) => {
			const { body, status } = handler(req.url.toString());
			return Effect.succeed(
				jsonResponse(req.url.toString(), body, status ?? 200),
			);
		}),
	);

const layerWith = (
	handler: (url: string) => { body: unknown; status?: number },
) => OkxLayer.pipe(Layer.provide(mockClient(handler)));

describe("Okx", () => {
	it("decodes advanced-info", async () => {
		const advanced = await Effect.runPromise(
			Effect.gen(function* () {
				const okx = yield* Okx;
				return yield* okx.advancedInfo("Mint111");
			}).pipe(
				Effect.provide(
					layerWith((url) =>
						url.includes("advanced-info")
							? {
									body: {
										code: "0",
										data: [
											{
												bundleHoldingPercent: "42.5",
												top10HoldPercent: "70",
												tokenTags: [
													"dexScreenerPaid",
													"devHoldingStatusSellAll",
												],
												creatorAddress: "Dev111",
											},
										],
									},
								}
							: { body: { code: "0", data: null } },
					),
				),
			),
		);
		expect(advanced).toEqual({
			bundlePct: 42.5,
			top10Pct: 70,
			devSoldAll: true,
			dexScreenerPaid: true,
			creator: "Dev111",
		});
	});

	it("decodes risk check flags", async () => {
		const risk = await Effect.runPromise(
			Effect.gen(function* () {
				const okx = yield* Okx;
				return yield* okx.riskFlags("Mint111");
			}).pipe(
				Effect.provide(
					layerWith((url) =>
						url.includes("risk")
							? {
									body: {
										code: "0",
										data: {
											allAnalysis: [
												{ riskKey: "isLiquidityRemoval", newRiskLabel: "yes" },
												{ riskKey: "isWash", newRiskLabel: "no" },
											],
										},
									},
								}
							: { body: { code: "0", data: null } },
					),
				),
			),
		);
		expect(risk).toEqual({ isRugpull: true, isWash: false });
	});

	it("decodes price-info into price vs ATH", async () => {
		const price = await Effect.runPromise(
			Effect.gen(function* () {
				const okx = yield* Okx;
				return yield* okx.priceInfo("Mint111");
			}).pipe(
				Effect.provide(
					layerWith((url) =>
						url.includes("price-info")
							? {
									body: { code: "0", data: [{ price: "80", maxPrice: "100" }] },
								}
							: { body: { code: "0", data: null } },
					),
				),
			),
		);
		expect(price).toEqual({ priceVsAthPct: 80 });
	});

	it("returns null when data is empty", async () => {
		const res = await Effect.runPromise(
			Effect.gen(function* () {
				const okx = yield* Okx;
				return yield* okx.advancedInfo("Mint111");
			}).pipe(
				Effect.provide(layerWith(() => ({ body: { code: "0", data: [] } }))),
			),
		);
		expect(res).toBeNull();
	});
});
