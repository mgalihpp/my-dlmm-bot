import { describe, expect, it } from "vitest";
import type { ScreenedPool } from "../src/domain/screened.js";
import {
	combineScore,
	decideCandidates,
	tpslAction,
} from "../src/telegram/agent/decision.js";

const pool = (over: Partial<ScreenedPool> = {}): ScreenedPool =>
	({
		pool: "PoolA",
		name: "A/SOL",
		baseSymbol: "A",
		baseMint: "mx",
		quoteSymbol: "SOL",
		tvl: 1,
		activeTvl: 1,
		mcap: 1,
		holders: 1,
		organicScore: 1,
		quoteOrganic: 1,
		feeActiveTvlRatio: 1,
		volatility: 1,
		binStep: 1,
		baseFeePct: 0,
		volume: 1,
		fee: 1,
		activePositions: 1,
		openPositions: 1,
		tokenAgeHours: 1,
		score: 0,
		price: 1,
		priceChangePct: null,
		volumeChangePct: null,
		fromAthPct: null,
		tokenXAddress: "mx",
		rugScore: null,
		...over,
	}) as ScreenedPool;

describe("combineScore", () => {
	it("blends 80/20 and pivots to heuristic when no signal", () => {
		expect(combineScore(80, null)).toBe(80);
		expect(combineScore(80, 1)).toBe(84); // 0.8*80 + 0.2*100
		expect(combineScore(80, -1)).toBe(64);
	});
});

describe("decideCandidates", () => {
	it("opens when combined score crosses threshold", () => {
		const p = pool({
			feeActiveTvlRatio: 0.3,
			organicScore: 90,
			holders: 3_000,
			volume: 200_000,
			binStep: 25,
		});
		const out = decideCandidates({
			pools: [p],
			signals: [{ pool: "PoolA", favorability: 0.5, rationale: "ok" }],
			minScoreToOpen: 70,
		});
		expect(out[0].action).toBe("open");
	});

	it("holds when below threshold", () => {
		const p = pool();
		const out = decideCandidates({
			pools: [p],
			signals: [],
			minScoreToOpen: 95,
		});
		expect(out[0].action).toBe("hold");
	});

	it("opens on strong LLM favorability even below heuristic threshold", () => {
		const p = pool(); // low heuristic score
		const out = decideCandidates({
			pools: [p],
			signals: [
				{ pool: "PoolA", favorability: 0.6, rationale: "llm likes it" },
			],
			minScoreToOpen: 95,
		});
		expect(out[0].action).toBe("open");
		expect(out[0].score).toBeLessThan(95);
	});

	it("weak favorability does not override the threshold", () => {
		const p = pool();
		const out = decideCandidates({
			pools: [p],
			signals: [{ pool: "PoolA", favorability: 0.3, rationale: "meh" }],
			minScoreToOpen: 95,
		});
		expect(out[0].action).toBe("hold");
	});
});

describe("tpslAction", () => {
	it("signals sl below stop-loss and tp above take-profit", () => {
		expect(tpslAction(-12, 25, -10)).toBe("sl");
		expect(tpslAction(30, 25, -10)).toBe("tp");
		expect(tpslAction(5, 25, -10)).toBe("hold");
	});
});
