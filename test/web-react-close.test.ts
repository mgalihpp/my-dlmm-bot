import { describe, expect, it } from "vitest";
import {
	pickCloseSig,
	validateCloseInput,
} from "../src/web-react/app/lib/server/close.server.js";

const VALID_ADDRESS = "So11111111111111111111111111111111111111112";

describe("validateCloseInput", () => {
	it("returns null when both pool and position are valid addresses", () => {
		expect(validateCloseInput(VALID_ADDRESS, VALID_ADDRESS)).toBeNull();
	});
	it("returns an error when pool or position is missing/empty", () => {
		expect(validateCloseInput("", VALID_ADDRESS)).toBe(
			"pool and position are required",
		);
		expect(validateCloseInput(VALID_ADDRESS, "")).toBe(
			"pool and position are required",
		);
		expect(validateCloseInput(VALID_ADDRESS, "  ")).toBe(
			"pool and position are required",
		);
	});
	it("rejects malformed base58 addresses", () => {
		expect(validateCloseInput("pool1", VALID_ADDRESS)).toBe(
			"pool is not a valid address",
		);
		expect(validateCloseInput(VALID_ADDRESS, "pos1")).toBe(
			"position is not a valid address",
		);
		expect(
			validateCloseInput("0OIl0OIl0OIl0OIl0OIl0OIl0OIl0", VALID_ADDRESS),
		).toBe("pool is not a valid address");
		expect(validateCloseInput("1".repeat(31), VALID_ADDRESS)).toBe(
			"pool is not a valid address",
		);
		expect(validateCloseInput("1".repeat(45), VALID_ADDRESS)).toBe(
			"pool is not a valid address",
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
