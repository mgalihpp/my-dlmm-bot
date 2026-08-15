import { describe, expect, it } from "vitest";
import {
	type BriefingData,
	buildBriefingPrompt,
	formatBriefing,
	formatBriefingFallback,
} from "../src/telegram/agent/briefing.js";

const DATA: BriefingData = {
	portfolio: [
		{
			poolName: "WIF/SOL",
			amountSol: 0.5,
			pnlPct: 12.3,
			ageHours: 72,
			feePerTvl24h: "0.0042",
		},
	],
	deployedSol: 1.5,
	stats: {
		closes: 4,
		wins: 3,
		losses: 1,
		winRate: 75,
		avgPnlPct: 8.5,
		bestPnl: 20,
		worstPnl: -5,
		totalPnlPct: 34,
	},
	activity: { open: 1, hold: 0, tp: 1, sl: 0, close: 0, blocked: 2, failed: 0 },
	market: [
		{
			name: "BONK/SOL",
			heuristic: 87,
			feeActiveTvlRatio: 0.012,
			volume: 500_000,
			priceVsAthPct: 45,
			rugScore: 900,
			holders: 10_000,
			organicScore: 80,
			tvl: 150_000,
			volatility: 0.25,
			tokenAgeHours: 96,
			poolAgeHours: 48,
		},
	],
};

describe("buildBriefingPrompt", () => {
	it("contains portfolio, activity and market data", () => {
		const prompt = buildBriefingPrompt(DATA);
		expect(prompt).toContain("WIF/SOL");
		expect(prompt).toContain("BONK/SOL");
		expect(prompt).toContain("closes=4");
		expect(prompt).toContain("1.5");
		expect(prompt).toContain("ageHours=72");
		expect(prompt).toContain("feePerTvl24h=0.0042");
		expect(prompt).toContain("rugScore=900");
		expect(prompt).toContain("poolAgeHours=48");
		expect(prompt).toContain("fromAthPct=55.0%");
	});

	it("handles empty portfolio and market", () => {
		const prompt = buildBriefingPrompt({ ...DATA, portfolio: [], market: [] });
		expect(prompt).toContain("- none");
	});
});

describe("formatBriefing", () => {
	it("wraps narrative with header and escaped body", () => {
		const now = new Date(2026, 7, 9, 9, 0, 0);
		const text = formatBriefing("Ringkasan: WIF/SOL bagus.", now);
		expect(text).toContain("📋 Daily briefing");
		expect(text).toContain("2026\\-08\\-09");
		expect(text).toContain("Ringkasan: WIF/SOL bagus\\.");
	});
});

describe("formatBriefingFallback", () => {
	it("renders structured sections", () => {
		const now = new Date(2026, 7, 9, 9, 0, 0);
		const text = formatBriefingFallback(DATA, now);
		expect(text).toContain("WIF/SOL");
		expect(text).toContain("BONK/SOL");
		expect(text).toContain("🚀");
		expect(text).toContain("Deployed");
	});

	it("renders empty-state lines when no data", () => {
		const now = new Date(2026, 7, 9, 9, 0, 0);
		const text = formatBriefingFallback(
			{
				portfolio: [],
				deployedSol: 0,
				stats: {
					closes: 0,
					wins: 0,
					losses: 0,
					winRate: null,
					avgPnlPct: null,
					bestPnl: null,
					worstPnl: null,
					totalPnlPct: null,
				},
				activity: {
					open: 0,
					hold: 0,
					tp: 0,
					sl: 0,
					close: 0,
					blocked: 0,
					failed: 0,
				},
				market: [],
			},
			now,
		);
		expect(text).toContain("No open positions");
		expect(text).toContain("No pools screened");
	});
});
