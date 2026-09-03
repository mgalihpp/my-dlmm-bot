import { describe, expect, it } from "vitest";
import type { ClosedPool } from "../src/domain/portfolio.js";
import {
	buildOverviewCacheKey,
	dedupeClosedPools,
	isPastMonthOpts,
} from "../src/web-react/app/lib/server/portfolio.server.js";

function pool(address: string): ClosedPool {
	return {
		poolAddress: address,
		binStep: 10,
		baseFee: 1,
		lastClosedAt: 1_700_000_000,
		tokenX: "SOL",
		tokenY: "USDC",
		tokenXMint: "mintX",
		tokenYMint: "mintY",
		totalDeposit: "1",
		totalWithdrawal: "1",
		totalFee: "0.01",
		pnlUsd: "1",
		pnlSol: "0.01",
		pnlSolPctChange: "1",
		pnlPctChange: "1",
	};
}

describe("buildOverviewCacheKey", () => {
	it("keys the fast pools-only summary separately from full fetches", () => {
		expect(buildOverviewCacheKey("W", { poolsOnly: true })).toBe(
			"W:pools-only",
		);
		expect(buildOverviewCacheKey("W")).toBe("W:all");
		expect(buildOverviewCacheKey("W", { month: "2026-07" })).toBe("W:2026-07");
		expect(buildOverviewCacheKey("W", { day: "2026-07-01" })).toBe(
			"W:2026-07-01",
		);
	});
});

describe("isPastMonthOpts", () => {
	it("treats only past months as immutable", () => {
		expect(isPastMonthOpts({ month: "2026-07" }, "2026-08")).toBe(true);
		expect(isPastMonthOpts({ month: "2026-08" }, "2026-08")).toBe(false);
		expect(isPastMonthOpts({ month: "2026-09" }, "2026-08")).toBe(false);
		expect(
			isPastMonthOpts({ month: "2026-07", poolsOnly: true }, "2026-08"),
		).toBe(false);
		expect(isPastMonthOpts({ day: "2026-07-01" }, "2026-08")).toBe(false);
		expect(isPastMonthOpts(undefined, "2026-08")).toBe(false);
	});
});

describe("dedupeClosedPools", () => {
	it("drops pagination duplicates keeping first-seen order", () => {
		const out = dedupeClosedPools([pool("A"), pool("B"), pool("A")]);
		expect(out.map((p) => p.poolAddress)).toEqual(["A", "B"]);
	});

	it("passes through empty and unique lists", () => {
		expect(dedupeClosedPools([])).toEqual([]);
		expect(dedupeClosedPools([pool("A")]).map((p) => p.poolAddress)).toEqual([
			"A",
		]);
	});
});
