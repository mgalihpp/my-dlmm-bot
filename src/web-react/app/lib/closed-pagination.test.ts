import { describe, expect, it } from "vitest";
import { parseClosedPageSize } from "./closed-pagination";

describe("parseClosedPageSize", () => {
	it("returns 10 for null", () => {
		expect(parseClosedPageSize(null)).toBe(10);
	});

	it("returns 10 for empty and non-numeric strings", () => {
		expect(parseClosedPageSize("")).toBe(10);
		expect(parseClosedPageSize("abc")).toBe(10);
	});

	it("returns 10 for numbers outside the allowlist", () => {
		expect(parseClosedPageSize("100")).toBe(10);
		expect(parseClosedPageSize("7")).toBe(10);
		expect(parseClosedPageSize("0")).toBe(10);
		expect(parseClosedPageSize("-25")).toBe(10);
	});

	it("passes through 10, 25, and 50", () => {
		expect(parseClosedPageSize("10")).toBe(10);
		expect(parseClosedPageSize("25")).toBe(25);
		expect(parseClosedPageSize("50")).toBe(50);
	});

	it("returns 10 for decimals", () => {
		expect(parseClosedPageSize("25.5")).toBe(10);
	});
});
