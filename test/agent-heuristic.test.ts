import { describe, expect, it } from "vitest";
import type { ScreenedPool } from "../src/domain/screened.js";
import { heuristicScore, rankPools } from "../src/telegram/agent/heuristic.js";

const pool = (over: Partial<ScreenedPool> = {}): ScreenedPool => ({
	pool: "PoolAddr",
	name: "AAA/SOL",
	baseSymbol: "AAA",
	baseMint: "MintX",
	quoteSymbol: "SOL",
	tvl: 10_000,
	activeTvl: 5_000,
	mcap: 500_000,
	holders: 800,
	organicScore: 75,
	quoteOrganic: 80,
	feeActiveTvlRatio: 0.1,
	volatility: 0.12,
	binStep: 50,
	baseFeePct: 0.1,
	volume: 50_000,
	fee: 200,
	activePositions: 5,
	openPositions: 3,
	tokenAgeHours: 24,
	score: 0,
	price: 1,
	priceChangePct: null,
	volumeChangePct: null,
	fromAthPct: null,
	tokenXAddress: "MintX",
	rugScore: null,
	...over,
});

describe("heuristicScore", () => {
	it("is higher for a high-quality pool than a bad one", () => {
		const good = pool({
			feeActiveTvlRatio: 0.25,
			organicScore: 98,
			holders: 5_000,
			volume: 500_000,
			binStep: 20,
		});
		const bad = pool({
			feeActiveTvlRatio: 0.01,
			organicScore: 10,
			holders: 20,
			volume: 100,
			binStep: 400,
		});
		expect(heuristicScore(good)).toBeGreaterThan(heuristicScore(bad));
	});

	it("caps between 0 and 100", () => {
		const extreme = pool({
			feeActiveTvlRatio: 10,
			organicScore: 100,
			holders: 10_000,
		});
		const score = heuristicScore(extreme);
		expect(score).toBeGreaterThanOrEqual(0);
		expect(score).toBeLessThanOrEqual(100);
	});
});

describe("rankPools", () => {
	it("filters below minCandidate and caps count", () => {
		const high = pool({ pool: "P1", feeActiveTvlRatio: 0.5, binStep: 20 });
		const low = pool({ pool: "P2", feeActiveTvlRatio: 0.001 });
		const mid = pool({ pool: "P3", feeActiveTvlRatio: 0.1 });
		const out = rankPools([low, mid, high], {
			minCandidate: 50,
			maxCandidates: 4,
		});
		expect(out.map((p) => p.pool)).toEqual(["P1", "P3"]);
	});
});
