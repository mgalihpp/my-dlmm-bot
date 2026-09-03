import { describe, expect, it } from "vitest";
import { decodeVexisConfig } from "../src/services/Config.js";

describe("decodeVexisConfig", () => {
	it("accepts empty and minimal configs", () => {
		expect(decodeVexisConfig({})).toEqual({});
		expect(decodeVexisConfig({ wallet: "abc" })).toEqual({ wallet: "abc" });
	});
	it("rejects non-objects", () => {
		expect(() => decodeVexisConfig(null)).toThrow(/expected object/);
		expect(() => decodeVexisConfig([])).toThrow(/expected object/);
	});
	it("rejects mistyped top-level fields", () => {
		expect(() => decodeVexisConfig({ wallet: 42 })).toThrow(/Invalid/);
		expect(() => decodeVexisConfig({ pageSize: "big" })).toThrow(/Invalid/);
	});
	it("rejects bad strategy enum", () => {
		expect(() => decodeVexisConfig({ create: { strategy: "yolo" } })).toThrow(
			/Invalid/,
		);
	});
	it("rejects out-of-range slippage", () => {
		expect(() => decodeVexisConfig({ create: { slippageBps: -1 } })).toThrow(
			/slippageBps/,
		);
		expect(() => decodeVexisConfig({ create: { slippageBps: 99999 } })).toThrow(
			/slippageBps/,
		);
	});
	it("accepts a valid create block", () => {
		const cfg = decodeVexisConfig({
			create: { strategy: "bidask", slippageBps: 100, autoSwap: false },
		});
		expect(cfg.create?.strategy).toBe("bidask");
		expect(cfg.create?.slippageBps).toBe(100);
	});
});
