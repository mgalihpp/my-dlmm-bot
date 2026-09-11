import { describe, expect, it } from "vitest";
import { inferStrategyFromBinWeights } from "../src/lib/strategy-infer.js";

describe("inferStrategyFromBinWeights", () => {
	it("returns null for empty or all-zero weights", () => {
		expect(inferStrategyFromBinWeights([])).toBeNull();
		expect(inferStrategyFromBinWeights([0, 0, 0])).toBeNull();
	});

	it("returns null for a single nonzero bin", () => {
		expect(inferStrategyFromBinWeights([0, 0, 10, 0, 0])).toBeNull();
	});

	it("infers spot for flat weights", () => {
		expect(inferStrategyFromBinWeights([5, 5, 5, 5, 5])).toBe("spot");
		expect(inferStrategyFromBinWeights([10, 11, 10, 11, 10])).toBe("spot");
	});

	it("infers curve for a centered peak with low edges", () => {
		expect(inferStrategyFromBinWeights([1, 3, 8, 3, 1])).toBe("curve");
	});

	it("infers bidask for descending weights", () => {
		expect(inferStrategyFromBinWeights([8, 6, 4, 2, 1])).toBe("bidask");
	});

	it("infers bidask for bimodal weights", () => {
		expect(inferStrategyFromBinWeights([8, 1, 1, 1, 8])).toBe("bidask");
	});

	it("infers bidask when the peak sits at an edge", () => {
		expect(inferStrategyFromBinWeights([1, 2, 3, 4, 12])).toBe("bidask");
	});
});
