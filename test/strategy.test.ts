import { describe, expect, it } from "vitest";
import { normalizeStrategy } from "../src/domain/onchain.js";

describe("normalizeStrategy", () => {
	it("passes through known strategies", () => {
		expect(normalizeStrategy("spot")).toBe("spot");
		expect(normalizeStrategy("bidask")).toBe("bidask");
		expect(normalizeStrategy("curve")).toBe("curve");
	});

	it("is case-insensitive and trims whitespace", () => {
		expect(normalizeStrategy(" Spot ")).toBe("spot");
		expect(normalizeStrategy("BIDASK")).toBe("bidask");
		expect(normalizeStrategy("Curve")).toBe("curve");
	});

	it("falls back to bidask for nullish input", () => {
		expect(normalizeStrategy(null)).toBe("bidask");
		expect(normalizeStrategy(undefined)).toBe("bidask");
	});

	it("falls back to bidask for wrong-typed or unknown input", () => {
		expect(normalizeStrategy("")).toBe("bidask");
		expect(normalizeStrategy("symmetric")).toBe("bidask");
		expect(normalizeStrategy(42)).toBe("bidask");
		expect(normalizeStrategy({ strategy: "spot" })).toBe("bidask");
		expect(normalizeStrategy(["curve"])).toBe("bidask");
	});
});
