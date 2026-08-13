import { describe, expect, it } from "vitest";
import { JupiterApiError } from "../src/errors.js";
import { isSlippageError, slippageLadder } from "../src/services/Zap.js";

describe("slippageLadder", () => {
	it("doubles from base up to 500 bps", () => {
		expect(slippageLadder(100)).toEqual([100, 200, 400, 500]);
	});
	it("starts below base when base is small", () => {
		expect(slippageLadder(50)).toEqual([50, 100, 200, 400]);
	});
	it("caps at 500 without duplicating", () => {
		expect(slippageLadder(300)).toEqual([300, 500]);
		expect(slippageLadder(600)).toEqual([500]);
	});
	it("clamps zero to a sane floor", () => {
		expect(slippageLadder(0)).toEqual([10, 20, 40, 80]);
	});
});

describe("isSlippageError", () => {
	const err = (message: string) =>
		new JupiterApiError({ stage: "execute", message });
	it("matches slippage tolerance exceeded", () => {
		expect(
			isSlippageError(
				err("Jupiter swap failed: Slippage tolerance exceeded (sig=abc)"),
			),
		).toBe(true);
	});
	it("does not match transient errors", () => {
		expect(isSlippageError(err("fetch failed"))).toBe(false);
		expect(isSlippageError(err("Jupiter execute failed (500)"))).toBe(false);
	});
});
