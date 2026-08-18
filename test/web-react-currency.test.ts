import { describe, expect, it } from "vitest";
import {
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "../src/web-react/app/lib/currency.js";
import { fmtPnl } from "../src/web-react/app/lib/format.js";

describe("fmtPnl", () => {
	it("keeps each PnL column in its own unit", () => {
		expect(fmtPnl("12", "0.1", "usd")).toBe("$12.00");
		expect(fmtPnl("12", "0.1", "sol")).toBe("0.1000 SOL");
	});
});

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

describe("currency preference storage", () => {
	it("persists and reads a valid currency preference", () => {
		const storage = new Map<string, string>();
		const adapter = {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
		};

		writeStoredCurrency(adapter, "sol");

		expect(readStoredCurrency(adapter)).toBe("sol");
	});

	it("ignores invalid stored preferences", () => {
		const adapter = {
			getItem: () => "eur",
			setItem: () => {},
		};

		expect(readStoredCurrency(adapter)).toBeNull();
	});
});
