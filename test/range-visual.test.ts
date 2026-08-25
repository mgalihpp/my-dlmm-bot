import { describe, expect, it } from "vitest";
import { resolveRangeAnchor } from "../src/web-react/app/components/portfolio/range-visual.js";

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
