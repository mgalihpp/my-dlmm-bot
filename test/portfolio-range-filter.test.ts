import { describe, expect, it } from "vitest";
import { matchesRangeFilter } from "../src/web-react/app/components/portfolio/positions-table.js";

const inRange = { outOfRange: false, positionsOutOfRange: [] };
const outOfRange = { outOfRange: true, positionsOutOfRange: [] };

describe("matchesRangeFilter", () => {
	it("keeps only in-range pools for the in-range filter", () => {
		expect(matchesRangeFilter(inRange, "in-range")).toBe(true);
		expect(matchesRangeFilter(outOfRange, "in-range")).toBe(false);
	});

	it("keeps only out-of-range pools for the OOR filter", () => {
		expect(matchesRangeFilter(inRange, "oor")).toBe(false);
		expect(matchesRangeFilter(outOfRange, "oor")).toBe(true);
	});
});
