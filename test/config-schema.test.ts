import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	decodeVexisConfig,
	resolveCreatePresetFrom,
} from "../src/services/Config.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

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
	it("accepts null xAmount/yAmount (unset amounts)", () => {
		const cfg = decodeVexisConfig({
			create: { strategy: "bidask", xAmount: null, yAmount: null },
		});
		expect(cfg.create?.xAmount).toBeNull();
		expect(cfg.create?.yAmount).toBeNull();
	});
	it("accepts null for resettable string/boolean fields", () => {
		const cfg = decodeVexisConfig({
			wallet: null,
			rpcUrl: null,
			dev: null,
			web: { port: null, password: null },
		});
		expect(cfg.wallet).toBeNull();
		expect(cfg.rpcUrl).toBeNull();
		expect(cfg.dev).toBeNull();
		expect(cfg.web?.port).toBeNull();
		expect(cfg.web?.password).toBeNull();
	});
	it("accepts null across the create block and resolves preset defaults", () => {
		const cfg = decodeVexisConfig({
			create: {
				strategy: null,
				mode: null,
				range: { type: null, minBin: null, maxPct: null },
				amountPresets: null,
				autoSwap: null,
				slippageBps: null,
			},
		});
		const preset = resolveCreatePresetFrom(cfg);
		expect(preset.strategy).toBe("bidask");
		expect(preset.mode).toBe("single-y");
		expect(preset.range.type).toBe("default");
		expect(preset.amountPresets).toEqual([0.1, 0.25, 0.5, 1]);
		expect(preset.autoSwap).toBe(false);
		expect(preset.slippageBps).toBe(100);
	});
	it("preserves explicit create range values through preset resolution", () => {
		const preset = resolveCreatePresetFrom(
			decodeVexisConfig({
				create: { strategy: "curve", range: { type: "bin", minBin: -5 } },
			}),
		);
		expect(preset.strategy).toBe("curve");
		expect(preset.range.type).toBe("bin");
		expect(preset.range.minBin).toBe(-5);
	});
	it("accepts null for unset numeric fields", () => {
		const cfg = decodeVexisConfig({
			pageSize: null,
			alertInterval: null,
			web: { port: null, password: "pw" },
		});
		expect(cfg.pageSize).toBeNull();
		expect(cfg.alertInterval).toBeNull();
		expect(cfg.web?.port).toBeNull();
		expect(cfg.web?.password).toBe("pw");
	});
	it("decodes the shipped example config", () => {
		const raw: unknown = JSON.parse(
			readFileSync(join(repoRoot, "vexis.config.example.json"), "utf8"),
		);
		const cfg = decodeVexisConfig(raw);
		expect(cfg.web?.password).toBe("change-me");
	});
});
