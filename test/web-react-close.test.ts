import { describe, expect, it } from "vitest";
import {
	pickCloseSig,
	validateCloseInput,
} from "../src/web-react/app/lib/server/close.server.js";

describe("validateCloseInput", () => {
	it("returns null when both pool and position are present", () => {
		expect(validateCloseInput("pool1", "pos1")).toBeNull();
	});
	it("returns an error when pool or position is missing/empty", () => {
		expect(validateCloseInput("", "pos1")).toBe(
			"pool and position are required",
		);
		expect(validateCloseInput("pool1", "")).toBe(
			"pool and position are required",
		);
		expect(validateCloseInput("pool1", "  ")).toBe(
			"pool and position are required",
		);
	});
});

describe("pickCloseSig", () => {
	it("prefers zapSig over closeSig", () => {
		expect(pickCloseSig({ closeSig: "close", zapSig: "zap" })).toBe("zap");
	});
	it("falls back to closeSig", () => {
		expect(pickCloseSig({ closeSig: "close" })).toBe("close");
	});
	it("returns empty string when neither is present", () => {
		expect(pickCloseSig({})).toBe("");
	});
});
