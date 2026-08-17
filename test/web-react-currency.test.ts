import { describe, expect, it } from "vitest";
import { resolveCurrency } from "../src/web-react/app/lib/currency.js";

describe("resolveCurrency", () => {
	it("keeps the stored SOL preference when the URL has no currency", () => {
		expect(resolveCurrency(null, "sol")).toBe("sol");
	});

	it("uses the URL currency before the stored preference", () => {
		expect(resolveCurrency("usd", "sol")).toBe("usd");
	});

	it("defaults to USD for unknown values", () => {
		expect(resolveCurrency("eur", "eur")).toBe("usd");
	});
});
