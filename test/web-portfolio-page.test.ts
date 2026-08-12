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
	it("renders terminal stats and portfolio values", () => {
		const html = renderPortfolio({ total: mkTotal(), open: [], closed: [] });
		expect(html).toContain("PnL SOL");
		expect(html).toContain("Realized PnL");
		expect(html).toContain("$123.45");
		expect(html).toContain("1.2345 ");
		expect(html).toContain("+12.34%");
		expect(html).toContain('class="profit"');
		expect(html).toContain('class="stat-sub loss"');
		expect(html).toContain('class="sol-icon"');
		expect(html).toContain('class="stats-grid portfolio-stats"');
		expect(html).toContain('class="grid-two"');
	});

	it("colors PnL cards red when values are negative", () => {
		const html = renderPortfolio({
			total: mkTotal({
				totalPnlSol: "-0.5",
				totalPnlSolPctChange: "-2",
				totalPnlUsd: "-50",
				totalPnlPctChange: "-5",
			}),
			open: [],
			closed: [],
		});
		expect(html).toContain('<strong class="loss">-0.5000');
		expect(html).toContain('<strong class="loss">$-50.00');
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
		expect(html).toContain("loss");
		expect(html).toContain('class="profit">0.2000 ');
	});

	it("shows empty states when no positions", () => {
		const html = renderPortfolio({ total: mkTotal(), open: [], closed: [] });
		expect(html).toContain("No open positions");
		expect(html).toContain("No closed positions");
	});

	it("renders PnL SOL curve from pnl snapshots", () => {
		const html = renderPortfolio(
			{ total: mkTotal(), open: [mkOpen({ balances: "100" })], closed: [] },
			[
				{
					ts: 1_754_000_000,
					pnlUsd: 10,
					pnlSol: 1,
					balanceUsd: 100,
					feesUsd: 5,
				},
				{
					ts: 1_754_000_060,
					pnlUsd: 20,
					pnlSol: 2,
					balanceUsd: 120,
					feesUsd: 5,
				},
			],
		);
		expect(html).toContain("PNL SOL");
		expect(html).toContain("2.0000 ");
		expect(html).toContain("+200.00%");
		expect(html).toContain("<polyline");
		expect(html).toContain('stroke="var(--profit)"');
		expect(html).toContain('class="eyebrow"');
		expect(html).toContain('data-tip="');
	});

	it("uses 0 SOL as the baseline for the PnL SOL percent", () => {
		const html = renderPortfolio(
			{ total: mkTotal(), open: [mkOpen({ balances: "100" })], closed: [] },
			[
				{
					ts: 1_754_000_000,
					pnlUsd: 0,
					pnlSol: 0.000831236,
					balanceUsd: 100,
					feesUsd: 5,
				},
				{
					ts: 1_754_000_060,
					pnlUsd: 0,
					pnlSol: 0,
					balanceUsd: 100,
					feesUsd: 5,
				},
			],
		);
		expect(html).toContain("0.00%");
	});

	it("colors the PnL SOL curve red when last value is negative", () => {
		const html = renderPortfolio(
			{ total: mkTotal(), open: [mkOpen({ balances: "100" })], closed: [] },
			[
				{
					ts: 1_754_000_000,
					pnlUsd: -1,
					pnlSol: -1,
					balanceUsd: 100,
					feesUsd: 5,
				},
				{
					ts: 1_754_000_060,
					pnlUsd: -2,
					pnlSol: -2,
					balanceUsd: 100,
					feesUsd: 5,
				},
			],
		);
		expect(html).toContain("PNL SOL");
		expect(html).toContain("-2.0000 ");
		expect(html).toContain('stroke="var(--loss)"');
	});

	it("lists open positions with total pnl in SOL in allocation panel", () => {
		const html = renderPortfolio({
			total: mkTotal(),
			open: [
				mkOpen({ tokenX: "AAA", tokenY: "SOL", pnlSol: "0.15" }),
				mkOpen({ tokenX: "BBB", tokenY: "SOL", pnlSol: "0.2" }),
			],
			closed: [],
		});
		expect(html).toContain("OPEN POSITIONS");
		expect(html).toContain("AAA/SOL");
		expect(html).toContain("0.1500 ");
		expect(html).toContain("0.2000 ");
		expect(html).toContain("TOTAL PNL");
		expect(html).toContain("0.3500 ");
		expect(html).toContain('class="allocation-ring"');
	});

	it("shows out-of-range stat card", () => {
		const html = renderPortfolio({
			total: mkTotal(),
			open: [
				mkOpen({
					openPositionCount: 2,
					positionsOutOfRange: ["p1", "p2"],
					outOfRange: true,
				}),
				mkOpen({ openPositionCount: 1 }),
			],
			closed: [],
		});
		expect(html).toContain("Out of range");
		expect(html).toContain("<strong>2</strong>");
		expect(html).toContain("1 of 2 pools");
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
