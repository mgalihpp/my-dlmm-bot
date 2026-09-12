import { describe, expect, it } from "vitest";
import { formatIdr, usd } from "../src/format.js";
import { parseUsdIdrRate } from "../src/lib/usd-idr.js";
import { tgUsd } from "../src/telegram/format.js";
import {
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "../src/web-react/app/lib/currency.js";
import { fmtIdr } from "../src/web-react/app/lib/format.js";
import { fmtAmount } from "../src/web-react/app/lib/pools.js";

describe("formatIdr", () => {
	it("renders whole rupiah with id-ID grouping", () => {
		expect(formatIdr(100, 16500)).toBe("Rp1.650.000");
	});

	it("rounds fractional rupiah to 0 digits", () => {
		expect(formatIdr(1.5, 16500)).toBe("Rp24.750");
	});
});

describe("usd with rate", () => {
	it("is unchanged without a rate", () => {
		expect(usd(100)).toBe("$100.00");
		expect(usd(100, null)).toBe("$100.00");
	});

	it("appends the dual Rp value when a rate is set", () => {
		expect(usd(100, 16500)).toBe("$100.00 (Rp1.650.000)");
	});

	it("ignores a non-positive rate", () => {
		expect(usd(100, 0)).toBe("$100.00");
	});
});

describe("tgUsd with rate", () => {
	it("is unchanged without a rate", () => {
		expect(tgUsd(100)).toBe("$100\\.00");
	});

	it("escapes every MarkdownV2 special char in the dual form", () => {
		expect(tgUsd(100, 16500)).toBe("$100\\.00 \\(Rp1\\.650\\.000\\)");
	});
});

describe("fmtIdr and fmtAmount", () => {
	it("renders Rp only for the idr branch", () => {
		expect(fmtIdr(100, 16500)).toBe("Rp1.650.000");
		expect(fmtAmount(100, "idr", null, 3, 16500)).toBe("Rp1.650.000");
	});
	it("falls back to USD when the rate is missing", () => {
		expect(fmtIdr(100, null)).toBe("$100.00");
		expect(fmtAmount(100, "idr", null, null)).toBe("$100.00");
	});

	it("leaves usd and sol branches untouched", () => {
		expect(fmtAmount(100, "usd", null)).toBe("$100.00");
		expect(fmtAmount(165, "sol", 165)).toBe("1.000 SOL");
	});
});

describe("currency storage with idr", () => {
	const adapterFor = (initial?: string) => {
		const storage = new Map<string, string>();
		if (initial !== undefined) storage.set("k", initial);
		return {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
		};
	};

	it("persists and reads idr", () => {
		const storage = new Map<string, string>();
		const adapter = {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
		};
		writeStoredCurrency(adapter, "k", "idr");
		expect(readStoredCurrency(adapter, "k")).toBe("idr");
	});

	it("resolves idr from the URL and from storage", () => {
		expect(resolveCurrency("idr", null)).toBe("idr");
		expect(resolveCurrency(null, "idr")).toBe("idr");
	});

	it("keeps legacy values resolving as before", () => {
		expect(resolveCurrency(null, "sol")).toBe("sol");
		expect(resolveCurrency("eur", "eur")).toBe("usd");
		expect(readStoredCurrency(adapterFor("eur"), "k")).toBeNull();
	});
});

describe("parseUsdIdrRate", () => {
	it("accepts the live er-api shape", () => {
		expect(
			parseUsdIdrRate({ result: "success", rates: { IDR: 17606.126888 } }),
		).toBe(17606.126888);
	});

	it("rejects missing or mistyped IDR", () => {
		expect(parseUsdIdrRate({ result: "success", rates: {} })).toBeNull();
		expect(parseUsdIdrRate({ rates: { IDR: "big" } })).toBeNull();
		expect(parseUsdIdrRate(null)).toBeNull();
		expect(parseUsdIdrRate({ nope: true })).toBeNull();
	});

	it("rejects non-positive and non-finite rates", () => {
		expect(parseUsdIdrRate({ rates: { IDR: 0 } })).toBeNull();
		expect(parseUsdIdrRate({ rates: { IDR: -5 } })).toBeNull();
		expect(parseUsdIdrRate({ rates: { IDR: Number.NaN } })).toBeNull();
		expect(
			parseUsdIdrRate({ rates: { IDR: Number.POSITIVE_INFINITY } }),
		).toBeNull();
	});
});
