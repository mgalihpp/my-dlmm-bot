import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { AppConfigTest } from "../src/services/Config.js";
import { JupiterLayer } from "../src/services/Jupiter.js";
import { MeteoraApiLayer } from "../src/services/MeteoraApi.js";
import { RugCheckLayer } from "../src/services/RugCheck.js";
import { Screening, ScreeningLive } from "../src/services/Screening.js";

const jsonResponse = (url: string, body: unknown, status = 200) =>
	HttpClientResponse.fromWeb(
		HttpClientRequest.get(url),
		new Response(JSON.stringify(body), { status }),
	);

const poolFixture = {
	pool_address: "Pool111",
	name: "FOO-SOL",
	pool_type: "dlmm",
	token_x: {
		address: "Mint111",
		symbol: "FOO",
		name: "Foo",
		decimals: 6,
		price: 1,
		market_cap: 1_000_000,
		holders: 1000,
		organic_score: 70,
		created_at: Date.now() - 5 * 3_600_000,
	},
	token_y: {
		address: "So11111111111111111111111111111111111111112",
		symbol: "SOL",
		name: "Solana",
		decimals: 9,
		price: 150,
		market_cap: 0,
		holders: 0,
		organic_score: 90,
		created_at: Date.now() - 48 * 3_600_000,
	},
	tvl: 20000,
	active_tvl: 15000,
	pool_price: 1,
	volatility: 0.12,
	volume: 5000,
	fee: 100,
	fee_active_tvl_ratio: 0.06,
	active_positions: 10,
	active_positions_pct: 50,
	open_positions: 20,
	dlmm_params: { bin_step: 100, collect_fee_mode: "both" },
	max_price: 2,
	fee_pct: 0.003,
};

const route = (url: string, ohlcvData: unknown[] = []): { body: unknown; status?: number } => {
	if (url.includes("datapi.jup.ag"))
		return {
			body: [
				{
					id: "Mint111",
					fees: 40,
					dexPaidAt: null,
					audit: {
						topHoldersPercentage: 50,
						botHoldersPercentage: 15,
						bundlerStats: { holdingPct: 20 },
					},
				},
			],
		};
	if (url.includes("rugcheck"))
		return {
			body: {
				score: 1200,
				score_normalised: 0.8,
				lpLockedPct: 0,
				tokenType: "token",
				tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
				risks: [],
			},
		};
	if (url.includes("pool-discovery"))
		return { body: { data: [poolFixture], total: 1 } };
	if (url.includes("ohlcv"))
		return { body: { start_time: 0, end_time: 0, timeframe: "24h", data: ohlcvData } };
	return { body: { data: [] } };
};

const ScreeningLiveForTest = ScreeningLive.pipe(
	Layer.provideMerge(MeteoraApiLayer),
	Layer.provideMerge(RugCheckLayer),
	Layer.provideMerge(JupiterLayer),
);

const layerWith = (ohlcvData?: unknown[]) =>
	ScreeningLiveForTest.pipe(
		Layer.provide(
			Layer.succeed(
				HttpClient.HttpClient,
				HttpClient.make((req) => {
					const { body, status } = route(req.url.toString(), ohlcvData);
					return Effect.succeed(
						jsonResponse(req.url.toString(), body, status ?? 200),
					);
				}),
			),
		),
		Layer.provideMerge(AppConfigTest({})),
	);

const screen = (ohlcvData?: unknown[]) =>
	Effect.runPromise(
		Effect.gen(function* () {
			const s = yield* Screening;
			return yield* s.screen({ displayLimit: 1 });
		}).pipe(Effect.provide(layerWith(ohlcvData))),
	);

describe("Screening enrichment", () => {
	it("attaches jupiter + rugcheck risk fields to screened pools", async () => {
		const result = await screen();
		const pool = result.pools[0];
		expect(pool.bundlePct).toBe(20);
		expect(pool.top10Pct).toBe(50);
		expect(pool.botHoldersPct).toBe(15);
		expect(pool.globalFeesSol).toBe(40);
		expect(pool.isRugpull).toBe(false);
		expect(pool.isWash).toBe(false);
		expect(pool.dexScreenerPaid).toBe(false);
		expect(pool.rugScore).toBe(1200);
	});

	it("fills priceVsAthPct from 24h OHLCV high", async () => {
		const result = await screen([
			{ timestamp: 0, high: 2, low: 1, open: 1, close: 1, volume: 100 },
		]);
		const pool = result.pools[0];
		// price=1, high=2 → fromAthPct 0.5, priceVsAthPct 50
		expect(pool.fromAthPct).toBe(0.5);
		expect(pool.priceVsAthPct).toBe(50);
	});
});
