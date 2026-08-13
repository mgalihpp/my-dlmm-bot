import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	computeLift,
	HIGHER_IS_BETTER,
	loadSignalWeights,
	recalculateWeights,
	recordClosePerf,
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

describe("signalWeights directionality", () => {
	it("treats rugScore and binStep as lower-is-better (matches heuristic)", () => {
		const wins = [
			rec(10, { rugScore: 100, binStep: 20 }),
			rec(8, { rugScore: 200, binStep: 30 }),
		];
		const losses = [
			rec(-10, { rugScore: 2200, binStep: 110 }),
			rec(-8, { rugScore: 2400, binStep: 120 }),
		];
		const rugLift = computeLift("rugScore", wins, losses, 2);
		const binLift = computeLift("binStep", wins, losses, 2);
		expect(rugLift).not.toBeNull();
		expect(binLift).not.toBeNull();
		expect(rugLift!).toBeGreaterThan(0);
		expect(binLift!).toBeGreaterThan(0);
	});

	it("excludes rugScore and binStep from HIGHER_IS_BETTER", () => {
		expect(HIGHER_IS_BETTER.has("rugScore")).toBe(false);
		expect(HIGHER_IS_BETTER.has("binStep")).toBe(false);
	});
});

describe("recordClosePerf", () => {
	const signals = (organicScore: number) => ({
		organicScore,
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
	});

	it("appends a perf sample and persists the file", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-sw-"));
		const file = join(dir, "weights.json");
		const res = recordClosePerf({
			signals: signals(70),
			pnlPct: 5,
			darwin: { ...darwin, recalcEvery: 100 },
			file,
		});
		expect(res.recalcCount).toBe(0);
		const saved = JSON.parse(readFileSync(file, "utf8"));
		expect(saved.perf).toHaveLength(1);
		expect(saved.perf[0].pnlPct).toBe(5);
		expect(saved.closesSinceRecalc).toBe(1);
	});

	it("recalculates weights once closesSinceRecalc reaches recalcEvery", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-sw-"));
		const file = join(dir, "weights.json");
		const cfg = { ...darwin, recalcEvery: 2, minSamples: 2 };
		const first = recordClosePerf({
			signals: signals(90),
			pnlPct: 10,
			darwin: cfg,
			file,
		});
		expect(first.recalcCount).toBe(0);
		const second = recordClosePerf({
			signals: signals(30),
			pnlPct: -10,
			darwin: cfg,
			file,
		});
		expect(second.recalcCount).toBe(1);
		const saved = JSON.parse(readFileSync(file, "utf8"));
		expect(saved.recalcCount).toBe(1);
		expect(saved.closesSinceRecalc).toBe(0);
		expect(saved.history).toHaveLength(1);
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

describe("loadSignalWeights", () => {
	it("falls back to defaults for a corrupt file", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-sw-"));
		const file = join(dir, "corrupt.json");
		writeFileSync(file, "{not json", "utf8");
		const data = loadSignalWeights(file);
		expect(data.weights.organicScore).toBe(1);
		expect(data.perf).toEqual([]);
		expect(data.history).toEqual([]);
	});

	it("coerces non-array perf/history and non-record weights", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-sw-"));
		const file = join(dir, "shape.json");
		writeFileSync(
			file,
			JSON.stringify({
				weights: { organicScore: 2 },
				lastRecalc: null,
				recalcCount: "3",
				closesSinceRecalc: 1,
				history: "junk",
				perf: [
					{ closedAt: "2026-01-01T00:00:00Z", pnlPct: 5, signals: {} },
					"junk",
				],
			}),
			"utf8",
		);
		const data = loadSignalWeights(file);
		expect(data.weights.organicScore).toBe(2);
		expect(data.weights.volume).toBe(1);
		expect(data.history).toEqual([]);
		expect(data.perf).toHaveLength(1);
		expect(data.recalcCount).toBe(0);
	});
});
