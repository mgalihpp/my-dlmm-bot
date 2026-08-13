import { describe, expect, it } from "vitest";
import { buildCreateParams } from "../src/telegram/agent/params.js";

describe("buildCreateParams", () => {
	it("emits a single-sided-SOL position with pct range", () => {
		const p = buildCreateParams({
			poolAddress: "PoolAddr",
			strategy: "bidask",
			range: { type: "default" },
			amountSol: 0.5,
		});
		expect(p.poolAddress).toBe("PoolAddr");
		expect(p.strategy).toBe("bidask");
		expect(p.totalXAmount).toBe("0");
		expect(p.totalYAmount).toBe("0.5");
		expect(p.singleSidedY).toBe(true);
		expect(p.amountsAreHuman).toBe(true);
		expect(p.minBinId).toBe(-69);
		expect(p.maxBinId).toBe(0);
		expect(p.relativeBins).toBe(true);
	});

	it("honors an explicit pct range override", () => {
		const p = buildCreateParams({
			poolAddress: "PoolAddr",
			strategy: "curve",
			range: { type: "pct", minPct: -0.5, maxPct: 0 },
			amountSol: 1,
		});
		expect(p.strategy).toBe("curve");
		expect(p.minPct).toBeCloseTo(-0.5);
		expect(p.maxPct).toBe(0);
	});

	it("honors an explicit bin range override", () => {
		const p = buildCreateParams({
			poolAddress: "PoolAddr",
			strategy: "spot",
			range: { type: "bin", minBin: -10, maxBin: 10 },
			amountSol: 0.2,
		});
		expect(p.minBinId).toBe(-10);
		expect(p.maxBinId).toBe(10);
	});
});
