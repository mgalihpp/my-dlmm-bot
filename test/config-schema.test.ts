import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeVexisConfig } from "../src/services/Config.js";

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
