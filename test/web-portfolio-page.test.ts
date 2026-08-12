import { describe, expect, it } from "vitest";
import type {
	ClosedPool,
	OpenPool,
	PortfolioTotal,
} from "../src/domain/index.js";
import { renderPortfolio } from "../src/web/pages/portfolio.js";

const mkTotal = (over: Partial<PortfolioTotal> = {}): PortfolioTotal => ({
	totalPnlUsd: "123.45",
	totalPnlSol: "1.2345",
	totalPnlPctChange: "12.34",
	totalPnlSolPctChange: "-5.67",
	...over,
});

const mkOpen = (over: Partial<OpenPool> = {}): OpenPool => ({
	poolAddress: "pool1",
	binStep: 10,
	baseFee: 0.5,
	tokenX: "TOKENX",
	tokenY: "SOL",
	tokenXMint: "mintx",
	tokenYMint: "minty",
	balances: "100.5",
	unclaimedFees: "1.25",
	feePerTvl24h: "0.01",
	pnl: "12.3",
	pnlPctChange: "10.5",
	pnlSol: "0.15",
	pnlSolPctChange: "8.2",
	totalDeposit: "88.2",
	openPositionCount: 1,
	listPositions: ["pos1"],
	positionsOutOfRange: [],
	outOfRange: false,
	poolPrice: 1.5,
	...over,
});

const mkClosed = (over: Partial<ClosedPool> = {}): ClosedPool => ({
	poolAddress: "pool2",
	binStep: 10,
	baseFee: 0.5,
	lastClosedAt: 1_754_000_000,
	tokenX: "OLD",
	tokenY: "SOL",
	tokenXMint: "mintx",
	tokenYMint: "minty",
	totalDeposit: "50",
	totalWithdrawal: "60",
	totalFee: "2.5",
	pnlUsd: "12.5",
	pnlSol: "0.2",
	pnlSolPctChange: "10",
	pnlPctChange: "25",
	...over,
});

describe("renderPortfolio", () => {
	it("renders summary cards with PnL", () => {
		const html = renderPortfolio({ total: mkTotal(), open: [], closed: [] });
		expect(html).toContain("PnL USD");
		expect(html).toContain("PnL SOL");
		expect(html).toContain("$123.45");
		expect(html).toContain("1.235 ◎");
	});

	it("renders open position rows with escaped pool name and badges", () => {
		const html = renderPortfolio({
			total: mkTotal(),
			open: [mkOpen({ tokenX: "<b>X</b>", outOfRange: true })],
			closed: [],
		});
		expect(html).toContain("&lt;b&gt;X&lt;/b&gt;");
		expect(html).toContain(">OOR<");
		expect(html).toContain('href="https://app.meteora.ag/dlmm/pool1"');
		expect(html).toContain("+10.50%");
	});

	it("renders closed positions with realized pnl class", () => {
		const html = renderPortfolio({
			total: mkTotal(),
			open: [],
			closed: [mkClosed({ pnlPctChange: "-8" })],
		});
		expect(html).toContain("OLD/SOL");
		expect(html).toContain("-8.00%");
		expect(html).toContain("neg");
	});

	it("shows empty states when no positions", () => {
		const html = renderPortfolio({ total: mkTotal(), open: [], closed: [] });
		expect(html).toContain("No open positions");
		expect(html).toContain("No closed positions");
	});

	it("computes totals from open pools", () => {
		const html = renderPortfolio({
			total: mkTotal(),
			open: [
				mkOpen({ balances: "100", unclaimedFees: "1.25" }),
				mkOpen({ balances: "50", unclaimedFees: "0.75" }),
			],
			closed: [],
		});
		expect(html).toContain("$150.00");
		expect(html).toContain("$2.00");
	});
});
