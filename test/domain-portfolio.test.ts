import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { OpenPool } from "../src/domain/portfolio.js";

const basePool = {
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
};

describe("OpenPool schema", () => {
	it("decodes a pool with positionsRange", () => {
		const decoded = Schema.decodeUnknownSync(OpenPool)({
			...basePool,
			positionsRange: [
				{
					address: "Pos1",
					minPrice: "0.5",
					maxPrice: "2",
					poolActivePrice: "1.5",
				},
			],
		});
		expect(decoded.positionsRange?.[0]).toEqual({
			address: "Pos1",
			minPrice: "0.5",
			maxPrice: "2",
			poolActivePrice: "1.5",
		});
	});
	it("decodes a pool without positionsRange", () => {
		const decoded = Schema.decodeUnknownSync(OpenPool)({ ...basePool });
		expect(decoded.positionsRange).toBeUndefined();
	});
});
