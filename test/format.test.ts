import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ClosedPool, OpenPool } from "../src/domain/portfolio.js";
import { formatNum, pair, shortAddr, timeAgo } from "../src/format.js";
import {
	escapeMarkdown,
	formatRangeBar,
	tgBold,
	tgClosedPools,
	tgCode,
	tgOpenPools,
	tgUsd,
} from "../src/telegram/format.js";

describe("formatNum", () => {
	it("formats with 2 decimals and thousands separators", () => {
		expect(formatNum(1234567.891)).toBe("1,234,567.89");
		expect(formatNum("42")).toBe("42.00");
		expect(formatNum(0.5, 3)).toBe("0.500");
	});
	it("passes through non-numeric strings", () => {
		expect(formatNum("n/a")).toBe("n/a");
	});
});

describe("shortAddr", () => {
	it("shortens long addresses", () => {
		expect(shortAddr("So11111111111111111111111111111111111111112")).toBe(
			"So11…1112",
		);
	});
	it("keeps short strings", () => {
		expect(shortAddr("abc")).toBe("abc");
	});
});

describe("pair", () => {
	it("joins with slash and defaults ?", () => {
		expect(pair("AAA", "SOL")).toBe("AAA/SOL");
		expect(pair(undefined as unknown as string, "SOL")).toBe("?/SOL");
	});
});

describe("timeAgo", () => {
	it("null is dash", () => {
		expect(timeAgo(null)).toBe("-");
	});
	it("renders hours", () => {
		expect(timeAgo(Date.now() / 1000 - 7200)).toBe("2h ago");
	});
});

describe("escapeMarkdown", () => {
	it("escapes every MarkdownV2 special char", () => {
		expect(escapeMarkdown("_*[]()~`>#+-=|{}.!\\")).toBe(
			"\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!\\\\",
		);
	});
	it("leaves plain text alone", () => {
		expect(escapeMarkdown("hello world 42")).toBe("hello world 42");
	});
});

describe("tg helpers", () => {
	it("tgBold escapes content", () => {
		expect(tgBold("a.b")).toBe("*a\\.b*");
	});
	it("tgCode strips backticks", () => {
		expect(tgCode("a`b")).toBe("`ab`");
	});
	it("tgUsd formats and escapes", () => {
		expect(tgUsd(1234.5)).toBe("$1,234\\.50");
	});
});

describe("formatRangeBar", () => {
	it("renders the 20-cell tick bar matching the agent style", () => {
		expect(formatRangeBar(0.9, 0.5, 1.5)).toBe(
			"▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ in\\-range",
		);
	});
});

describe("tgClosedPools", () => {
	const makeClosedPool = (overrides: Partial<ClosedPool>): ClosedPool =>
		Schema.decodeUnknownSync(ClosedPool)({
			poolAddress: "Pool1",
			binStep: 25,
			baseFee: 0.25,
			lastClosedAt: 1755000000,
			tokenX: "MIM",
			tokenY: "SOL",
			tokenXMint: "MintX",
			tokenYMint: "So11111111111111111111111111111111111111112",
			totalDeposit: "7.61",
			totalWithdrawal: "7.62",
			totalFee: "0.02",
			pnlUsd: "0.03",
			pnlSol: "0.0003",
			pnlSolPctChange: "0.35",
			pnlPctChange: "0.35",
			...overrides,
		});

	it("formats lastClosedAt as a real date from unix seconds", () => {
		const out = tgClosedPools([makeClosedPool({})]);
		expect(out).toContain("Closed: 2025\\-08\\-12");
		expect(out).not.toContain("1970");
	});

	it("omits the closed line when lastClosedAt is null", () => {
		const out = tgClosedPools([makeClosedPool({ lastClosedAt: null })]);
		expect(out).not.toContain("Closed:");
	});
});

describe("tgOpenPools range bars", () => {
	const makePool = (overrides: Partial<OpenPool>): OpenPool =>
		Schema.decodeUnknownSync(OpenPool)({
			poolAddress: "Pool1",
			binStep: 25,
			baseFee: 0.25,
			tokenX: "JUP",
			tokenY: "SOL",
			tokenXMint: "MintX",
			tokenYMint: "So11111111111111111111111111111111111111112",
			balances: "100",
			unclaimedFees: "1.5",
			feePerTvl24h: "0.5",
			pnl: "10",
			pnlPctChange: "5.2",
			pnlSol: "0.1",
			pnlSolPctChange: "5.1",
			totalDeposit: "50",
			openPositionCount: 1,
			listPositions: ["Pos1"],
			positionsOutOfRange: [],
			outOfRange: false,
			poolPrice: 1.5,
			...overrides,
		});

	it("renders an in-range bar for a single position", () => {
		const out = tgOpenPools([
			makePool({
				positionsRange: [
					{
						address: "Pos1",
						minPrice: "0.5",
						maxPrice: "1.5",
						poolActivePrice: "0.9",
					},
				],
			}),
		]);
		expect(out).toContain("Range: ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ in\\-range");
	});

	it("marks below and above per position in multi-position pools", () => {
		const out = tgOpenPools([
			makePool({
				openPositionCount: 2,
				listPositions: ["Pos1", "Pos2"],
				positionsOutOfRange: ["Pos1", "Pos2"],
				positionsRange: [
					{
						address: "Pos1",
						minPrice: "0.5",
						maxPrice: "1.5",
						poolActivePrice: "0.2",
					},
					{
						address: "Pos2",
						minPrice: "0.5",
						maxPrice: "1.5",
						poolActivePrice: "5",
					},
				],
			}),
		]);
		expect(out).toContain("below");
		expect(out).toContain("above");
	});

	it("omits the bar when no range data exists", () => {
		const out = tgOpenPools([makePool({})]);
		expect(out).not.toContain("Range:");
	});

	it("falls back to pool price when poolActivePrice is null", () => {
		const out = tgOpenPools([
			makePool({
				poolPrice: 0.9,
				positionsRange: [
					{
						address: "Pos1",
						minPrice: "0.5",
						maxPrice: "1.5",
						poolActivePrice: null,
					},
				],
			}),
		]);
		expect(out).toContain("Range: ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ in\\-range");
	});
});
