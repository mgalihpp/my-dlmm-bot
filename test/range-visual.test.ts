import { describe, expect, it } from "vitest";
import {
	normalizeRangeStrategy,
	resolveRangeAnchor,
	resolveRangeBarHeight,
	resolveRangeBarHeights,
} from "../src/web-react/app/components/portfolio/range-visual.js";

describe("resolveRangeAnchor", () => {
	it("prefers poolActivePrice from ranges over current", () => {
		const ranges = [
			{
				minPrice: "0.000002",
				maxPrice: "0.000006",
				poolActivePrice: "0.000004",
			},
		];
		const { effectiveCurrent } = resolveRangeAnchor(ranges, 0.000005, 100000);
		expect(effectiveCurrent).toBe(0.000004);
	});

	it("scales mcap when effective current differs from pool current", () => {
		const ranges = [
			{
				minPrice: "0.000002",
				maxPrice: "0.000006",
				poolActivePrice: "0.000004",
			},
		];
		const { effectiveCurrent, effectiveMcap } = resolveRangeAnchor(
			ranges,
			0.000005,
			100000,
		);
		expect(effectiveCurrent).toBe(0.000004);
		// mcap was 100k at 0.000005, so at 0.000004 it should be 80k
		expect(effectiveMcap).toBe(80000);
	});

	it("falls back to current when no poolActivePrice present", () => {
		const ranges = [{ minPrice: "0.000002", maxPrice: "0.000006" }];
		const { effectiveCurrent, effectiveMcap } = resolveRangeAnchor(
			ranges,
			0.000005,
			50000,
		);
		expect(effectiveCurrent).toBe(0.000005);
		expect(effectiveMcap).toBe(50000);
	});

	it("falls back to current when poolActivePrice is null or invalid", () => {
		const ranges = [
			{
				minPrice: "0.000002",
				maxPrice: "0.000006",
				poolActivePrice: null,
			},
		];
		const { effectiveCurrent } = resolveRangeAnchor(ranges, 0.000005, 100000);
		expect(effectiveCurrent).toBe(0.000005);
	});

	it("picks first valid poolActivePrice among multiple ranges", () => {
		const ranges = [
			{ minPrice: "0.000001", maxPrice: "0.000002", poolActivePrice: null },
			{
				minPrice: "0.000002",
				maxPrice: "0.000006",
				poolActivePrice: "0.000003",
			},
			{
				minPrice: "0.000006",
				maxPrice: "0.000010",
				poolActivePrice: "0.000009",
			},
		];
		const { effectiveCurrent } = resolveRangeAnchor(ranges, 0.000005, 100000);
		expect(effectiveCurrent).toBe(0.000003);
	});

	it("returns null current when both sources are missing", () => {
		const { effectiveCurrent, effectiveMcap } = resolveRangeAnchor(
			[],
			null,
			100000,
		);
		expect(effectiveCurrent).toBeNull();
		expect(effectiveMcap).toBe(100000);
	});
});

describe("normalizeRangeStrategy", () => {
	it("passes through known strategies", () => {
		expect(normalizeRangeStrategy("spot")).toBe("spot");
		expect(normalizeRangeStrategy("bidask")).toBe("bidask");
		expect(normalizeRangeStrategy("curve")).toBe("curve");
	});

	it("is case-insensitive and trims whitespace", () => {
		expect(normalizeRangeStrategy(" Spot ")).toBe("spot");
		expect(normalizeRangeStrategy("BIDASK")).toBe("bidask");
		expect(normalizeRangeStrategy("Curve")).toBe("curve");
	});

	it("falls back to bidask for nullish or unknown input", () => {
		expect(normalizeRangeStrategy(null)).toBe("bidask");
		expect(normalizeRangeStrategy(undefined)).toBe("bidask");
		expect(normalizeRangeStrategy("")).toBe("bidask");
		expect(normalizeRangeStrategy("symmetric")).toBe("bidask");
	});
});

describe("resolveRangeBarHeight", () => {
	const legacyBidask = (progress: number) =>
		((11 + (1 - progress) * 28) / 86) * 100;

	it("bidask is pixel-identical to the legacy formula", () => {
		for (const p of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
			expect(resolveRangeBarHeight("bidask", p)).toBe(legacyBidask(p));
		}
	});

	it("spot is flat at the bidask midpoint", () => {
		const heights = resolveRangeBarHeights("spot", 48);
		for (const h of heights) expect(h).toBe(heights[0]);
		expect(heights[0]).toBe(((11 + 14) / 86) * 100);
	});

	it("curve is symmetric with a center peak matching the bidask max", () => {
		const heights = resolveRangeBarHeights("curve", 48);
		for (let i = 0; i < heights.length; i++) {
			expect(heights[i]).toBeCloseTo(heights[heights.length - 1 - i], 10);
		}
		const peak = Math.max(...heights);
		expect(heights[Math.floor(heights.length / 2)]).toBeCloseTo(peak, 10);
		// Exact center reaches the bidask max; sampled peak sits just below it.
		expect(resolveRangeBarHeight("curve", 0.5)).toBe(legacyBidask(0));
		expect(peak).toBeCloseTo(legacyBidask(0), 1);
		// Valleys sit near the baseline, well below the peak.
		expect(heights[0]).toBeLessThan(peak / 2);
	});

	it("strategies render differently from each other", () => {
		const spot = resolveRangeBarHeights("spot", 11);
		const bidask = resolveRangeBarHeights("bidask", 11);
		const curve = resolveRangeBarHeights("curve", 11);
		expect(spot).not.toEqual(bidask);
		expect(curve).not.toEqual(bidask);
		expect(curve).not.toEqual(spot);
	});
});
