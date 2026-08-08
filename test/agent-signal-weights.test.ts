import { describe, expect, it } from "vitest";
import {
	recalculateWeights,
	signalSnapshot,
	weightsSummary,
} from "../src/telegram/agent/signalWeights.js";

const darwin = {
	enabled: true,
	windowDays: 60,
	recalcEvery: 5,
	boostFactor: 1.05,
	decayFactor: 0.95,
	weightFloor: 0.3,
	weightCeiling: 2.5,
	minSamples: 4,
};

const rec = (pnlPct: number, partial: Partial<Record<string, number>>) => ({
	closedAt: new Date().toISOString(),
	pnlPct,
	signals: {
		organicScore: 70,
		feeActiveTvlRatio: 0.05,
		volume: 50000,
		holders: 1000,
		binStep: 100,
		priceVsAthPct: 60,
		rugScore: 1500,
		top10Pct: 50,
		bundlePct: 20,
		botHoldersPct: 10,
		globalFeesSol: 40,
		activePositions: 200,
		...partial,
	},
});

describe("signalSnapshot", () => {
	it("extracts numeric signal values from a pool", () => {
		const snap = signalSnapshot({
			pool: "P",
			name: "n",
			baseSymbol: "b",
			baseMint: "m",
			quoteSymbol: "q",
			tvl: 0,
			activeTvl: 0,
			mcap: 0,
			holders: 100,
			organicScore: 60,
			quoteOrganic: 0,
			feeActiveTvlRatio: 0.02,
			volatility: 0,
			binStep: 110,
			baseFeePct: 0,
			volume: 500,
			fee: 0,
			activePositions: 50,
			openPositions: 60,
			tokenAgeHours: 1,
			score: 0,
			price: 1,
			priceChangePct: 0,
			fromAthPct: 0.5,
			volumeChangePct: 0,
			tokenXAddress: "m",
			rugScore: 800,
			priceVsAthPct: 70,
			top10Pct: 40,
			bundlePct: 10,
			botHoldersPct: 5,
			globalFeesSol: 35,
		} as never);
		expect(snap.priceVsAthPct).toBe(70);
		expect(snap.rugScore).toBe(800);
		expect(snap.activePositions).toBe(50);
	});
});

describe("recalculateWeights", () => {
	it("boosts signals that distinguish winners and decays weak ones", () => {
		// organicScore high in winners, low in losers → boosted.
		// volume high in losers, low in winners → decayed.
		const perf = [
			rec(10, { organicScore: 95, volume: 1000 }),
			rec(8, { organicScore: 90, volume: 2000 }),
			rec(5, { organicScore: 88, volume: 1500 }),
			rec(6, { organicScore: 92, volume: 1200 }),
			rec(-10, { organicScore: 30, volume: 500000 }),
			rec(-8, { organicScore: 40, volume: 400000 }),
			rec(-6, { organicScore: 45, volume: 450000 }),
			rec(-9, { organicScore: 35, volume: 480000 }),
		];
		const weights: Record<string, number> = Object.fromEntries(
			Object.keys(rec(0, {}).signals).map((s) => [s, 1]),
		);
		const { weights: next, changes } = recalculateWeights({
			perf,
			weights: weights as never,
			cfg: darwin,
		});
		const change = (name: string) => changes.find((c) => c.signal === name);
		const organic = change("organicScore");
		const volume = change("volume");
		expect(organic && organic.to > organic.from).toBe(true);
		expect(volume && volume.to < volume.from).toBe(true);
		expect(next.organicScore).toBeGreaterThan(1);
		expect(next.volume).toBeLessThan(1);
	});

	it("respects weight floor and ceiling", () => {
		const perf = [
			rec(1, { organicScore: 99, volume: 1 }),
			rec(1, { organicScore: 99, volume: 1 }),
			rec(-1, { organicScore: 1, volume: 999999 }),
			rec(-1, { organicScore: 1, volume: 999999 }),
		];
		const weights: Record<string, number> = Object.fromEntries(
			Object.keys(rec(0, {}).signals).map((s) => [s, 1]),
		);
		const first = recalculateWeights({
			perf,
			weights: weights as never,
			cfg: darwin,
		});
		const second = recalculateWeights({
			perf: perf.map((p) => ({ ...p, signals: { ...p.signals } })),
			weights: first.weights as never,
			cfg: { ...darwin, boostFactor: 2.5, decayFactor: 0.5 },
		});
		for (const val of Object.values(second.weights)) {
			expect(val).toBeGreaterThanOrEqual(darwin.weightFloor - 1e-9);
			expect(val).toBeLessThanOrEqual(darwin.weightCeiling + 1e-9);
		}
	});

	it("skips recalc below minSamples or without both wins/losses", () => {
		const weights = { organicScore: 1 } as never;
		const r1 = recalculateWeights({ perf: [rec(1, {})], weights, cfg: darwin });
		expect(r1.changes.length).toBe(0);
		const r2 = recalculateWeights({
			perf: [rec(1, {}), rec(1, {}), rec(1, {}), rec(1, {})],
			weights,
			cfg: darwin,
		});
		expect(r2.changes.length).toBe(0);
	});
});

describe("weightsSummary", () => {
	it("renders a multi-line summary sorted by weight", () => {
		const s = weightsSummary({
			volume: 1.5,
			organicScore: 0.5,
			holders: 1,
		} as never);
		expect(s).toContain("volume");
		expect(s).toContain("organicScore");
	});
});
