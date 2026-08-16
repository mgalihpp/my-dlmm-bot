import { describe, expect, it } from "vitest";
import type { ScreenedPool } from "../src/domain/screened.js";
import { heuristicScore, rankPools } from "../src/telegram/agent/heuristic.js";

const pool = (over: Partial<ScreenedPool> = {}): ScreenedPool => ({
	pool: "PoolAddr",
	name: "AAA/SOL",
	baseSymbol: "AAA",
	baseMint: "MintX",
	baseIcon: null,
	quoteSymbol: "SOL",
	quoteIcon: null,
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

const basePool = {
	pool: "Pool111",
	name: "FOO-SOL",
	baseSymbol: "FOO",
	baseMint: "Mint111",
	quoteSymbol: "SOL",
	tvl: 10000,
	activeTvl: 8000,
	mcap: 500000,
	holders: 1000,
	organicScore: 70,
	quoteOrganic: 70,
	feeActiveTvlRatio: 0.05,
	volatility: 0.01,
	binStep: 100,
	baseFeePct: 0.003,
	volume: 50000,
	fee: 500,
	activePositions: 200,
	openPositions: 300,
	tokenAgeHours: 48,
	score: 0,
	price: 1,
	priceChangePct: 10,
	fromAthPct: null,
	volumeChangePct: 5,
	tokenXAddress: "Mint111",
};

describe("heuristicScore risk factors", () => {
	it("scores a pool at ATH lower than one deep below ATH", () => {
		const atAth = heuristicScore({ ...basePool, priceVsAthPct: 100 });
		const belowAth = heuristicScore({ ...basePool, priceVsAthPct: 40 });
		expect(belowAth).toBeGreaterThan(atAth);
	});
	it("peaks ~20% below ATH, penalizes both ATH and dead tokens", () => {
		const sweet = heuristicScore({ ...basePool, priceVsAthPct: 80 });
		const atAth = heuristicScore({ ...basePool, priceVsAthPct: 100 });
		const dead = heuristicScore({ ...basePool, priceVsAthPct: 0 });
		const mid = heuristicScore({ ...basePool, priceVsAthPct: 40 });
		expect(sweet).toBeGreaterThan(atAth);
		expect(sweet).toBeGreaterThan(dead);
		expect(mid).toBeGreaterThan(atAth);
		expect(dead).toBeLessThan(mid);
	});
	it("prefers lower rugScore (higher risk is penalized)", () => {
		const low = heuristicScore({ ...basePool, rugScore: 100 });
		const high = heuristicScore({ ...basePool, rugScore: 3000 });
		expect(low).toBeGreaterThan(high);
	});
	it("falls back to fromAthPct when priceVsAthPct is missing", () => {
		const nearAth = heuristicScore({
			...basePool,
			priceVsAthPct: null,
			fromAthPct: 0.05,
		});
		const belowAth = heuristicScore({
			...basePool,
			priceVsAthPct: null,
			fromAthPct: 0.4,
		});
		expect(belowAth).toBeGreaterThan(nearAth);
	});
	it("prefers lower top10 and bundle concentration", () => {
		const low = heuristicScore({ ...basePool, top10Pct: 90, bundlePct: 90 });
		const high = heuristicScore({ ...basePool, top10Pct: 20, bundlePct: 10 });
		expect(high).toBeGreaterThan(low);
	});
	it("prefers more active positions (crowd)", () => {
		const few = heuristicScore({ ...basePool, activePositions: 10 });
		const many = heuristicScore({ ...basePool, activePositions: 2000 });
		expect(many).toBeGreaterThan(few);
	});
	it("modulates score by adaptive weights", () => {
		const w = { volume: 2.5, organicScore: 0.3 };
		const lowVol = { ...basePool, volume: 1000, organicScore: 95 };
		const highVol = { ...basePool, volume: 500000, organicScore: 40 };
		const weightedLowVol = heuristicScore(lowVol, w);
		const weightedHighVol = heuristicScore(highVol, w);
		// with volume boosted, high volume should win despite low organic
		expect(weightedHighVol).toBeGreaterThan(weightedLowVol);
	});
});

describe("rankPools with weights", () => {
	it("passes weights through to scoring", () => {
		const ranked = rankPools(
			[{ ...basePool, pool: "A", volume: 500000, organicScore: 40 }],
			{ minCandidate: 0, maxCandidates: 5, weights: { volume: 2.5 } },
		);
		expect(ranked.length).toBe(1);
	});
});
