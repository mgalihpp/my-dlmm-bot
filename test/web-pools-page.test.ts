import { describe, expect, it } from "vitest";
import type { ScreenedPool } from "../src/domain/index.js";
import type { ScreenResult } from "../src/lib/screening.js";
import { renderPools } from "../src/web/pages/pools.js";

const TIMEFRAMES = ["5m", "30m", "1h", "2h", "4h", "12h", "24h"];

const mkPool = (over: Partial<ScreenedPool> = {}): ScreenedPool => ({
	pool: "poolA",
	name: "Token/SOL",
	baseSymbol: "Token",
	baseMint: "mintA",
	baseIcon: null,
	quoteSymbol: "SOL",
	quoteIcon: null,
	tvl: 10000,
	activeTvl: 8000,
	mcap: 50000,
	holders: 1200,
	organicScore: 75,
	quoteOrganic: 80,
	feeActiveTvlRatio: 0.05,
	volatility: 0.1,
	binStep: 25,
	baseFeePct: 0.5,
	volume: 5000,
	fee: 250,
	activePositions: 3,
	openPositions: 1,
	tokenAgeHours: 48,
	score: 1000,
	price: 0.0042,
	priceChangePct: 5.5,
	volumeChangePct: 12.3,
	fromAthPct: 0.1,
	tokenXAddress: "mintA",
	rugScore: 92,
	...over,
});

const mkResult = (pools: ScreenedPool[]): ScreenResult => ({
	pools,
	total: 120,
	filtered: 3,
});

describe("renderPools", () => {
	it("renders counts and timeframe selection", () => {
		const html = renderPools(mkResult([mkPool()]), { timeframe: "30m" });
		expect(html).toContain("1 shown");
		expect(html).toContain("120 POOLS");
		expect(html).toContain("3 filtered");
		for (const timeframe of TIMEFRAMES) {
			expect(html).toContain(`value="${timeframe}"`);
		}
		expect(html).toContain('value="30m" selected');
	});

	it("renders pool rows with escaped data and links", () => {
		const html = renderPools(
			mkResult([mkPool({ name: "<scr>", baseSymbol: "X", rugScore: null })]),
			{ timeframe: "5m" },
		);
		expect(html).toContain("&lt;scr&gt;");
		expect(html).toContain('href="https://app.meteora.ag/dlmm/poolA"');
		expect(html).toContain("$50,000.00");
	});

	it("renders token icon and falls back when absent", () => {
		const withIcon = renderPools(
			mkResult([mkPool({ baseIcon: "https://img/x.png" })]),
			{ timeframe: "5m" },
		);
		expect(withIcon).toContain(
			'<img class="token-icon" src="https://img/x.png"',
		);
		const without = renderPools(mkResult([mkPool({ baseIcon: null })]), {
			timeframe: "5m",
		});
		expect(without).not.toContain("token-icon");
	});

	it("shows empty state when no pools", () => {
		const html = renderPools(mkResult([]), { timeframe: "5m" });
		expect(html).toContain("No pools found");
		expect(html).toContain("0 shown");
	});

	it("marks non-selected timeframe without selected attr", () => {
		const html = renderPools(mkResult([]), { timeframe: "1h" });
		expect(html).toContain('value="30m"');
		expect(html).not.toContain('value="30m" selected');
	});

	it("badges low rug score as good and high as risky", () => {
		const low = renderPools(mkResult([mkPool({ rugScore: 5 })]), {
			timeframe: "5m",
		});
		expect(low).toContain('<span class="badge pass">5</span>');
		const mid = renderPools(mkResult([mkPool({ rugScore: 600 })]), {
			timeframe: "5m",
		});
		expect(mid).toContain('<span class="badge review">600</span>');
		const high = renderPools(mkResult([mkPool({ rugScore: 2000 })]), {
			timeframe: "5m",
		});
		expect(high).toContain('<span class="badge blocked">2000</span>');
		expect(low).not.toContain(">blocked<");
	});

	it("renders trend as sparkline plus percentage", () => {
		const html = renderPools(
			mkResult([mkPool({ priceChangePct: 5.5, priceSeries: [1, 1.2, 1.1] })]),
			{ timeframe: "5m" },
		);
		expect(html).toContain('class="trend-cell profit"');
		expect(html).toContain("<polyline");
		expect(html).toContain("+5.50%");
	});
});
