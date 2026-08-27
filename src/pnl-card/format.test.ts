import { describe, expect, it } from "vitest";
import type { ClosedPool } from "../domain/portfolio.js";
import {
	computeClosedStats,
	formatCardPct,
	formatCardUsd,
	pnlCardColor,
	pnlCardSign,
} from "./format.js";

function pool(pnlUsd: string): ClosedPool {
	return {
		poolAddress: `Pool-${pnlUsd}-${Math.random()}`,
		binStep: 10,
		baseFee: 0.05,
		lastClosedAt: null,
		tokenX: "SOL",
		tokenY: "USDC",
		tokenXMint: "So11111111111111111111111111111111111111112",
		tokenYMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		totalDeposit: "100",
		totalWithdrawal: "110",
		totalFee: "1",
		pnlUsd,
		pnlSol: "0.1",
		pnlPctChange: "5",
		pnlSolPctChange: "5",
	};
}

describe("pnlCardSign", () => {
	it("returns 1 for positive", () => expect(pnlCardSign("10")).toBe(1));
	it("returns -1 for negative", () => expect(pnlCardSign("-3")).toBe(-1));
	it("returns 0 for zero", () => expect(pnlCardSign("0")).toBe(0));
	it("returns 0 for null", () => expect(pnlCardSign(null)).toBe(0));
});

describe("pnlCardColor", () => {
	it("is green for positive", () => expect(pnlCardColor("5")).toBe("#22c55e"));
	it("is red for negative", () => expect(pnlCardColor("-5")).toBe("#ef4444"));
	it("is neutral for zero", () => expect(pnlCardColor("0")).toBe("#94a3b8"));
	it("is neutral for null", () => expect(pnlCardColor(null)).toBe("#94a3b8"));
	it("parses formatted currency strings", () =>
		expect(pnlCardSign("+$4,092.15")).toBe(1));
	it("parses formatted negative currency strings", () =>
		expect(pnlCardSign("-$210.00")).toBe(-1));
	it("colors formatted profit green", () =>
		expect(pnlCardColor("+$4,092.15")).toBe("#22c55e"));
	it("colors formatted loss red", () =>
		expect(pnlCardColor("-$210.00")).toBe("#ef4444"));
});

describe("formatCardUsd", () => {
	it("formats positive with +$", () =>
		expect(formatCardUsd("1234.5")).toBe("+$1,234.50"));
	it("formats negative with -$", () =>
		expect(formatCardUsd("-12.3")).toBe("-$12.30"));
	it("returns n/a for null", () => expect(formatCardUsd(null)).toBe("n/a"));
});

describe("formatCardPct", () => {
	it("formats pct with sign", () =>
		expect(formatCardPct("5.2")).toBe("+5.20%"));
	it("returns n/a for null", () => expect(formatCardPct(null)).toBe("n/a"));
});

describe("computeClosedStats", () => {
	it("handles empty", () => {
		const s = computeClosedStats([]);
		expect(s.totalClosed).toBe(0);
		expect(s.winRate).toBeNull();
		expect(s.avgPnlUsd).toBeNull();
		expect(s.bestUsd).toBeNull();
		expect(s.worstUsd).toBeNull();
	});

	it("computes winRate and avg", () => {
		const s = computeClosedStats([pool("10"), pool("-4"), pool("6")]);
		expect(s.totalClosed).toBe(3);
		expect(s.winRate).toBeCloseTo(2 / 3);
		expect(s.avgPnlUsd).toBe("+$4.00");
		expect(s.bestUsd).toBe("+$10.00");
		expect(s.worstUsd).toBe("-$4.00");
	});

	it("all losses gives 0 winRate", () => {
		const s = computeClosedStats([pool("-1"), pool("-2")]);
		expect(s.winRate).toBe(0);
	});

	it("all wins gives 1 winRate", () => {
		const s = computeClosedStats([pool("1"), pool("2")]);
		expect(s.winRate).toBe(1);
	});
});
