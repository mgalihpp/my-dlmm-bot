import { describe, expect, it } from "vitest";
import {
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "../src/web-react/app/lib/currency.js";
import {
	fmtPnl,
	fmtPnlPct,
	pnlSignForCurrency,
} from "../src/web-react/app/lib/format.js";

describe("fmtPnl", () => {
	it("keeps each PnL column in its own unit", () => {
		expect(fmtPnl("12", "0.1", "usd")).toBe("$12.00");
		expect(fmtPnl("12", "0.1", "sol")).toBe("0.100 SOL");
	});
});

describe("fmtPnlPct", () => {
	it("uses the percentage matching the selected currency", () => {
		expect(fmtPnlPct("12", "8", "usd")).toBe("+12.00%");
		expect(fmtPnlPct("12", "8", "sol")).toBe("+8.00%");
	});
});

describe("pnlSignForCurrency", () => {
	it("uses the selected currency value for the PnL color", () => {
		expect(pnlSignForCurrency("1", "-0.00000182", "sol")).toBe(-1);
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
