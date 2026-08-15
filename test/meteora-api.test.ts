import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { AppConfigTest } from "../src/services/Config.js";
import { MeteoraApi, MeteoraApiLayer } from "../src/services/MeteoraApi.js";

const jsonResponse = (url: string, body: unknown, status = 200) =>
	HttpClientResponse.fromWeb(
		HttpClientRequest.get(url),
		new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		}),
	);

const mockClient = (
	handler: (url: string) => { body: unknown; status?: number },
) =>
	Layer.succeed(
		HttpClient.HttpClient,
		HttpClient.make((req) => {
			const { body, status } = handler(req.url);
			return Effect.succeed(jsonResponse(req.url, body, status ?? 200));
		}),
	);

const totalPnlBody = {
	totalPnlUsd: "12.5",
	totalPnlSol: "0.08",
	totalPnlPctChange: "3.2",
	totalPnlSolPctChange: "2.9",
};

const layerWith = (
	handler: (url: string) => { body: unknown; status?: number },
) =>
	MeteoraApiLayer.pipe(
		Layer.provide(mockClient(handler)),
		Layer.provideMerge(AppConfigTest({})),
	);

describe("MeteoraApi", () => {
	it("decodes a valid totalPnl response", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const api = yield* MeteoraApi;
				return yield* api.totalPnl("Wallet111");
			}).pipe(Effect.provide(layerWith(() => ({ body: totalPnlBody })))),
		);
		expect(result.totalPnlUsd).toBe("12.5");
	});

	it("fails with DecodeError on schema mismatch", async () => {
		const exit = await Effect.runPromiseExit(
			Effect.gen(function* () {
				const api = yield* MeteoraApi;
				return yield* api.totalPnl("Wallet111");
			}).pipe(Effect.provide(layerWith(() => ({ body: { nope: true } })))),
		);
		expect(exit._tag).toBe("Failure");
		if (exit._tag === "Failure") {
			expect(JSON.stringify(exit.cause)).toContain("DecodeError");
		}
	});

	it("fails with MeteoraApiError including status on 404", async () => {
		const exit = await Effect.runPromiseExit(
			Effect.gen(function* () {
				const api = yield* MeteoraApi;
				return yield* api.totalPnl("Wallet111");
			}).pipe(
				Effect.provide(
					layerWith(() => ({ body: { error: "not found" }, status: 404 })),
				),
			),
		);
		expect(exit._tag).toBe("Failure");
		if (exit._tag === "Failure") {
			const s = JSON.stringify(exit.cause);
			expect(s).toContain("MeteoraApiError");
			expect(s).toContain("404");
		}
	});

	it("retries transient 500 then succeeds", async () => {
		let calls = 0;
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const api = yield* MeteoraApi;
				return yield* api.totalPnl("Wallet111");
			}).pipe(
				Effect.provide(
					layerWith(() => {
						calls++;
						return calls === 1
							? { body: { error: "boom" }, status: 500 }
							: { body: totalPnlBody };
					}),
				),
			),
		);
		expect(calls).toBe(2);
		expect(result.totalPnlSol).toBe("0.08");
	});

	it("sends page params for openPortfolio and decodes pools", async () => {
		let seenUrl = "";
		const body = {
			hasNext: false,
			page: 2,
			pageSize: 10,
			totalCount: 0,
			totalPositions: 0,
			solPrice: null,
			total: null,
			pools: [],
		};
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const api = yield* MeteoraApi;
				return yield* api.openPortfolio("W", 2, 10);
			}).pipe(
				Effect.provide(
					layerWith((url) => {
						seenUrl = url;
						return { body };
					}),
				),
			),
		);
		expect(seenUrl).toContain("page=2");
		expect(seenUrl).toContain("page_size=10");
		expect(seenUrl).toContain("user=W");
		expect(result.pools).toEqual([]);
	});
});

const positionPnlBody = {
	totalCount: 1,
	page: 1,
	pageSize: 100,
	hasNext: false,
	positions: [
		{
			positionAddress: "Pos1",
			minPrice: "0.5",
			maxPrice: "2",
			lowerBinId: -34,
			upperBinId: 35,
			feePerTvl24h: "0.5",
			isClosed: false,
			pnlUsd: "10",
			pnlPctChange: "5.2",
			pnlSol: "0.1",
			pnlSolPctChange: "5.1",
			allTimeDeposits: {
				tokenX: { amount: "10", amountSol: null, usd: "5" },
				tokenY: { amount: "1", amountSol: "1", usd: "100" },
				total: { usd: "105", sol: "1" },
			},
			allTimeWithdrawals: {
				tokenX: { amount: "0", amountSol: null, usd: "0" },
				tokenY: { amount: "0", amountSol: "0", usd: "0" },
				total: { usd: "0", sol: "0" },
			},
			allTimeFees: {
				tokenX: { amount: "0.1", amountSol: null, usd: "0.05" },
				tokenY: { amount: "0.01", amountSol: "0.01", usd: "1" },
				total: { usd: "1.05", sol: "0.01" },
			},
			closedAt: null,
			createdAt: 1720000000,
			isOutOfRange: false,
			poolActiveBinId: 0,
			poolActivePrice: "1.5",
		},
	],
	tokenX: "JUP",
	tokenXPrice: "1",
	tokenY: "SOL",
	tokenYPrice: "150",
	solPrice: "150",
	rewardTokenX: null,
	rewardTokenXPrice: "0",
	rewardTokenY: null,
	rewardTokenYPrice: "0",
};

const pnlUrl = (pool: string) => (url: string) =>
	url.includes(`/positions/${pool}/pnl`)
		? { body: positionPnlBody }
		: { body: { error: "unexpected" }, status: 404 };

const pnlPool = {
	poolAddress: "Pool1",
	binStep: 25,
	baseFee: 0.25,
	tokenX: "JUP",
	tokenY: "SOL",
	tokenXMint: "MintX",
	tokenYMint: "So11111111111111111111111111111111111111112",
	balances: "100",
	unclaimedFees: "1.5",
	feePerTvl24h: "0.5",
	pnl: "10",
	pnlPctChange: "5.2",
	pnlSol: "0.1",
	pnlSolPctChange: "5.1",
	totalDeposit: "50",
	openPositionCount: 1,
	listPositions: ["Pos1"],
	positionsOutOfRange: [],
	outOfRange: false,
	poolPrice: 1.5,
};

describe("MeteoraApi enrichOpenPortfolioPnl", () => {
	it("withRanges enriches even single-position pools", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const api = yield* MeteoraApi;
				return yield* api.enrichOpenPortfolioPnl(
					[{ ...pnlPool, openPositionCount: 1 } as never],
					"W",
					{ withRanges: true },
				);
			}).pipe(Effect.provide(layerWith(pnlUrl("Pool1")))),
		);
		expect(result[0].positionsRange).toEqual([
			{
				address: "Pos1",
				minPrice: "0.5",
				maxPrice: "2",
				poolActivePrice: "1.5",
			},
		]);
		expect(result[0].positionsPnl).toHaveLength(1);
	});

	it("default skips single-position pools", async () => {
		let calls = 0;
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const api = yield* MeteoraApi;
				return yield* api.enrichOpenPortfolioPnl(
					[
						{ ...pnlPool, poolAddress: "Pool1", openPositionCount: 1 } as never,
						{ ...pnlPool, poolAddress: "Pool2", openPositionCount: 2 } as never,
					],
					"W",
				);
			}).pipe(
				Effect.provide(
					layerWith((url) => {
						if (url.includes("/positions/")) calls++;
						return { body: positionPnlBody };
					}),
				),
			),
		);
		expect(calls).toBe(1);
		expect(result[0].positionsPnl).toBeUndefined();
		expect(result[1].positionsPnl).toHaveLength(1);
	});

	it("decodes position pnl when pnlSol / pnlSolPctChange fields are missing", async () => {
		const body = JSON.parse(JSON.stringify(positionPnlBody));
		delete body.positions[0].pnlSol;
		delete body.positions[0].pnlSolPctChange;
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const api = yield* MeteoraApi;
				return yield* api.positionPnl("Pool1", "W", "open");
			}).pipe(Effect.provide(layerWith(() => ({ body })))),
		);
		expect(result.positions[0].positionAddress).toBe("Pos1");
		expect(result.positions[0].pnlSol).toBeUndefined();
		expect(result.positions[0].pnlSolPctChange).toBeUndefined();
		expect(result.positions[0].pnlPctChange).toBe("5.2");
	});
});
