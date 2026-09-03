import { describe, expect, it } from "vitest";
import {
	assertValidCliAmount,
	assertValidPubkey,
	assertValidStrategy,
	bpsToSlippagePct,
	clampPageSize,
	parseHumanAmountStrict,
	redactConfig,
} from "../src/lib/validation.js";

describe("assertValidPubkey", () => {
	it("accepts a real address", () => {
		const pk = assertValidPubkey(
			"pool",
			"So11111111111111111111111111111111111111112",
		);
		expect(pk.toBase58()).toBe("So11111111111111111111111111111111111111112");
	});
	it("rejects garbage", () => {
		expect(() => assertValidPubkey("pool", "not-a-key")).toThrow(
			/Invalid pool/,
		);
		expect(() => assertValidPubkey("pool", "")).toThrow();
	});
});

describe("parseHumanAmountStrict", () => {
	it("scales valid amounts", () => {
		expect(parseHumanAmountStrict("1", 6).toString()).toBe("1000000");
		expect(parseHumanAmountStrict("0", 6).toString()).toBe("0");
	});
	it("rejects empty, garbage, and negatives", () => {
		expect(() => parseHumanAmountStrict("", 6)).toThrow();
		expect(() => parseHumanAmountStrict("abc", 6)).toThrow();
		expect(() => parseHumanAmountStrict("-1", 6)).toThrow(/negative/);
	});
});

describe("bpsToSlippagePct", () => {
	it("maps bps to percent and clamps", () => {
		expect(bpsToSlippagePct(100)).toBe(1);
		expect(bpsToSlippagePct(0)).toBe(0);
		expect(bpsToSlippagePct(-5)).toBe(0);
		expect(bpsToSlippagePct(20000)).toBe(100);
		expect(bpsToSlippagePct(Number.NaN)).toBe(1);
	});
});

describe("assertValidStrategy", () => {
	it("accepts the three strategies", () => {
		expect(assertValidStrategy("spot")).toBe("spot");
		expect(assertValidStrategy("bidask")).toBe("bidask");
		expect(assertValidStrategy("curve")).toBe("curve");
	});
	it("rejects anything else", () => {
		expect(() => assertValidStrategy("yolo")).toThrow(/Invalid strategy/);
		expect(() => assertValidStrategy("")).toThrow();
	});
});

describe("assertValidCliAmount", () => {
	it("accepts non-negative numbers", () => {
		expect(() => assertValidCliAmount("x-amount", "0.5")).not.toThrow();
		expect(() => assertValidCliAmount("x-amount", "0")).not.toThrow();
	});
	it("rejects garbage and negatives", () => {
		expect(() => assertValidCliAmount("x-amount", "abc")).toThrow(
			/Invalid x-amount/,
		);
		expect(() => assertValidCliAmount("x-amount", "-1")).toThrow();
	});
});

describe("clampPageSize", () => {
	it("clamps to 1..50 with a 50 fallback", () => {
		expect(clampPageSize(10)).toBe(10);
		expect(clampPageSize(500)).toBe(50);
		expect(clampPageSize(0)).toBe(1);
		expect(clampPageSize(Number.NaN)).toBe(50);
	});
});

describe("redactConfig", () => {
	it("masks secrets at any depth", () => {
		const out = redactConfig({
			wallet: "abc",
			privateKey: "sekret",
			agent: { llm: { apiKey: "k", model: "m" } },
			web: { password: "p" },
			telegramBotToken: "t",
		});
		expect(out.wallet).toBe("abc");
		expect(out.privateKey).toBe("***");
		expect(out.agent.llm.apiKey).toBe("***");
		expect(out.agent.llm.model).toBe("m");
		expect(out.web.password).toBe("***");
		expect(out.telegramBotToken).toBe("***");
	});
});
