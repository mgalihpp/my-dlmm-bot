import { describe, expect, it } from "vitest";
import type { ScreenedPool } from "../src/domain/index.js";
import type { ScreenResult } from "../src/lib/screening.js";
import {
	buildPoolsPayload,
	fmtAmount,
	matchesSearch,
	organicBucket,
	organicFilter,
	rugBucket,
	sortPools,
	toSol,
} from "../src/web-react/app/lib/pools.js";

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

describe("organicBucket", () => {
	it("maps score thresholds", () => {
		expect(organicBucket(80)).toBe("pass");
		expect(organicBucket(79)).toBe("review");
		expect(organicBucket(60)).toBe("review");
		expect(organicBucket(59)).toBe("blocked");
	});
});

describe("rugBucket", () => {
	it("maps null to na and score thresholds", () => {
		expect(rugBucket(null)).toBe("na");
		expect(rugBucket(undefined)).toBe("na");
		expect(rugBucket(250)).toBe("pass");
		expect(rugBucket(251)).toBe("review");
		expect(rugBucket(1250)).toBe("review");
		expect(rugBucket(1251)).toBe("blocked");
	});
});

describe("toSol", () => {
	it("divides usd by solPrice, null-safe", () => {
		expect(toSol(200, 100)).toBe(2);
		expect(toSol(null, 100)).toBeNull();
		expect(toSol(200, null)).toBeNull();
		expect(toSol(200, 0)).toBeNull();
	});
});

describe("fmtAmount", () => {
	it("formats usd or converted sol", () => {
		expect(fmtAmount(200, "usd", 100)).toBe("$200.00");
		expect(fmtAmount(200, "sol", 100)).toContain("2");
		expect(fmtAmount(200, "sol", null)).toBe("-");
	});
});

describe("matchesSearch", () => {
	it("matches name, symbols, and address case-insensitively", () => {
		const pool = mkPool();
		expect(matchesSearch(pool, "")).toBe(true);
		expect(matchesSearch(pool, "token")).toBe(true);
		expect(matchesSearch(pool, "SOL")).toBe(true);
		expect(matchesSearch(pool, "poola")).toBe(true);
		expect(matchesSearch(pool, "zzz")).toBe(false);
	});
});

describe("organicFilter", () => {
	it("filters by bucket and passes all", () => {
		const pool = mkPool({ organicScore: 75 });
		expect(organicFilter(pool, "all")).toBe(true);
		expect(organicFilter(pool, "review")).toBe(true);
		expect(organicFilter(pool, "pass")).toBe(false);
		expect(organicFilter(pool, "blocked")).toBe(false);
	});
});

describe("sortPools", () => {
	it("sorts by numeric key asc/desc", () => {
		const a = mkPool({ pool: "A", tvl: 100 });
		const b = mkPool({ pool: "B", tvl: 300 });
		const c = mkPool({ pool: "C", tvl: 200 });
		expect(sortPools([a, b, c], "tvl", "desc").map((p) => p.pool)).toEqual([
			"B",
			"C",
			"A",
		]);
		expect(sortPools([a, b, c], "tvl", "asc").map((p) => p.pool)).toEqual([
			"A",
			"C",
			"B",
		]);
	});

	it("sorts by name and handles null fromAthPct", () => {
		const a = mkPool({ pool: "A", name: "Alpha" });
		const b = mkPool({ pool: "B", name: "beta" });
		expect(sortPools([b, a], "pool", "asc").map((p) => p.pool)).toEqual([
			"A",
			"B",
		]);
		const withNull = mkPool({ pool: "N", fromAthPct: null });
		const withVal = mkPool({ pool: "V", fromAthPct: 0.5 });
		expect(
			sortPools([withNull, withVal], "fromAthPct", "desc").map((p) => p.pool),
		).toEqual(["V", "N"]);
	});
});

describe("buildPoolsPayload", () => {
	it("passes through result fields and solPrice", () => {
		const payload = buildPoolsPayload(mkResult([mkPool()]), 150, "30m");
		expect(payload.ok).toBe(true);
		expect(payload.timeframe).toBe("30m");
		expect(payload.total).toBe(120);
		expect(payload.filtered).toBe(3);
		expect(payload.pools).toHaveLength(1);
		expect(payload.solPrice).toBe(150);
		expect(payload.fetchedAt).toBeTypeOf("number");
	});
});
