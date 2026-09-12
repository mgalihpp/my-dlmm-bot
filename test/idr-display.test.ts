import { describe, expect, it } from "vitest";
import { formatIdr, usd } from "../src/format.js";
import { decodeVexisConfig } from "../src/services/Config.js";
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

describe("decodeVexisConfig usdToIdr", () => {
	it("accepts a valid rate and keeps it", () => {
		expect(decodeVexisConfig({ usdToIdr: 16500 })).toEqual({
			usdToIdr: 16500,
		});
	});

	it("stays backward compatible when the rate is missing", () => {
		expect(decodeVexisConfig({})).toEqual({});
		expect(decodeVexisConfig({ usdToIdr: null })).toEqual({
			usdToIdr: null,
		});
	});

	it("rejects non-positive and non-finite rates", () => {
		expect(() => decodeVexisConfig({ usdToIdr: 0 })).toThrow(/usdToIdr/);
		expect(() => decodeVexisConfig({ usdToIdr: -5 })).toThrow(/usdToIdr/);
		expect(() => decodeVexisConfig({ usdToIdr: Number.NaN })).toThrow(
			/usdToIdr/,
		);
		expect(() =>
			decodeVexisConfig({ usdToIdr: Number.POSITIVE_INFINITY }),
		).toThrow(/usdToIdr/);
	});

	it("rejects mistyped rates", () => {
		expect(() => decodeVexisConfig({ usdToIdr: "big" })).toThrow(/Invalid/);
	});
});
