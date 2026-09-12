import { describe, expect, it } from "vitest";
import { fmtMoney, solscanUrl } from "./format";

describe("solscanUrl", () => {
	it("links transaction signatures to the transaction page", () => {
		const signature =
			"4SQhmFCpwquAG2o3RabmbMQdLgi5uc55u5PvwBGhwusA1pu4C8safJCfcCJxDbsBr7aukxFuo9DDjsM1H4ubm2Cm";

		expect(solscanUrl(signature)).toBe(`https://solscan.io/tx/${signature}`);
	});
});

describe("fmtMoney", () => {
	it("renders USD with suffix and two decimals", () => {
		expect(fmtMoney(100, "usd", 16500)).toBe("100.00 USD");
	});
	it("renders SOL with suffix and three decimals", () => {
		expect(fmtMoney(1.5, "sol", 16500)).toBe("1.500 SOL");
	});
	it("converts USD to compact rupiah with a live rate", () => {
		expect(fmtMoney(100, "idr", 16500)).toBe("Rp1,65jt");
		expect(fmtMoney(20, "idr", 1000)).toBe("Rp20k");
		expect(fmtMoney(100, "idr", 1000)).toBe("Rp100k");
	});
	it("falls back to USD when the rate is missing", () => {
		expect(fmtMoney(100, "idr", null)).toBe("$100.00");
	});
});
