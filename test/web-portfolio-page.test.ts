import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import type {
	ClosedPool,
	OpenPool,
	PortfolioTotal,
	PositionPnLData,
} from "../src/domain/index.js";
import { AppConfigTest } from "../src/services/Config.js";
import { MeteoraApiLayer } from "../src/services/MeteoraApi.js";
import {
	closedPositionsContent,
	renderClosedDetail,
	renderPortfolio,
} from "../src/web/pages/portfolio.js";

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

const mkPos = (over: Partial<PositionPnLData> = {}): PositionPnLData => ({
	positionAddress: "posA",
	minPrice: "0.5",
	maxPrice: "2",
	lowerBinId: -34,
	upperBinId: 35,
	feePerTvl24h: "0.5",
	isClosed: true,
	pnlUsd: "10",
	pnlPctChange: "5.2",
	pnlSol: "0.1",
	pnlSolPctChange: "5.1",
	allTimeDeposits: {
		tokenX: { amount: "10", amountSol: null, usd: "5" },
		tokenY: { amount: "1", amountSol: "1", usd: "100" },
		total: { usd: "105", sol: "1" },
	},
	allTimeWithdrawals: {
		tokenX: { amount: "0", amountSol: null, usd: "0" },
		tokenY: { amount: "0", amountSol: "0", usd: "0" },
		total: { usd: "60", sol: "0.4" },
	},
	allTimeFees: {
		tokenX: { amount: "0.1", amountSol: null, usd: "0.05" },
		tokenY: { amount: "0.01", amountSol: "0.01", usd: "1" },
		total: { usd: "1.05", sol: "0.01" },
	},
	closedAt: 1_754_000_000,
	createdAt: 1_753_000_000,
	isOutOfRange: false,
	poolActiveBinId: 0,
	poolActivePrice: "1.5",
	...over,
});

describe("renderClosedDetail", () => {
	it("renders one row per closed position with deposit/withdraw/fees/pnl", () => {
		const html = renderClosedDetail("OLD/SOL", [
			mkPos(),
			mkPos({
				positionAddress: "posB",
				pnlUsd: "-5",
				pnlPctChange: "-8",
				pnlSol: "-0.05",
				closedAt: null,
			}),
		]);
		expect(html).toContain("CLOSED POSITIONS // OLD/SOL");
		expect(html).toContain("posA");
		expect(html).toContain("posB");
		expect(html).toContain("$105.00");
		expect(html).toContain("$60.00");
		expect(html).toContain("$1.05");
		expect(html).toContain("+5.20%");
		expect(html).toContain("-8.00%");
		expect(html).toContain("loss");
		expect(html).toContain("https://solscan.io/account/posA");
	});

	it("filters out open positions and shows an empty message", () => {
		const html = renderClosedDetail("A/SOL", [mkPos({ isClosed: false })]);
		expect(html).toContain("No closed positions");
		expect(html).not.toContain("posA");
	});

	it("shows placeholders for null closedAt and null pnlSol", () => {
		const html = renderClosedDetail("A/SOL", [
			mkPos({ closedAt: null, pnlSol: null }),
		]);
		expect(html).toContain(">posA</a>");
	});
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

	it("adds chevron and detail row for each closed pool", () => {
		const html = renderPortfolio({
			total: mkTotal(),
			open: [],
			closed: [mkClosed()],
		});
		expect(html).toContain('class="chevron"');
		expect(html).toContain('class="detail-row"');
		expect(html).toContain("/partials/closed-positions?pool=pool2");
		expect(html).toContain("__vexisClosedBound");
		expect(html).toContain('closest("tr.closed-row")');
		expect(html).toContain('closest("a")');
	});

	it("does not emit chevron script when there are no closed pools", () => {
		const html = renderPortfolio({ total: mkTotal(), open: [], closed: [] });
		expect(html).not.toContain('class="chevron"');
		expect(html).not.toContain("__vexisClosedBound");
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

const closedPnlBody = {
	totalCount: 1,
	page: 1,
	pageSize: 100,
	hasNext: false,
	positions: [
		{
			positionAddress: "posA",
			minPrice: "0.5",
			maxPrice: "2",
			lowerBinId: -34,
			upperBinId: 35,
			feePerTvl24h: "0.5",
			isClosed: true,
			pnlUsd: "10",
			pnlPctChange: "5.2",
			pnlSol: "0.1",
			pnlSolPctChange: "5.1",
			allTimeDeposits: {
				tokenX: { amount: "10", amountSol: null, usd: "5" },
				tokenY: { amount: "1", amountSol: "1", usd: "100" },
				total: { usd: "105", sol: "1" },
			},
			allTimeWithdrawals: {
				tokenX: { amount: "0", amountSol: null, usd: "0" },
				tokenY: { amount: "0", amountSol: "0", usd: "0" },
				total: { usd: "60", sol: "0.4" },
			},
			allTimeFees: {
				tokenX: { amount: "0.1", amountSol: null, usd: "0.05" },
				tokenY: { amount: "0.01", amountSol: "0.01", usd: "1" },
				total: { usd: "1.05", sol: "0.01" },
			},
			closedAt: 1_754_000_000,
			createdAt: 1_753_000_000,
			isOutOfRange: false,
			poolActiveBinId: 0,
			poolActivePrice: "1.5",
		},
	],
	tokenX: "OLD",
	tokenXPrice: "1",
	tokenY: "SOL",
	tokenYPrice: "150",
	solPrice: "150",
	rewardTokenX: null,
	rewardTokenXPrice: "0",
	rewardTokenY: null,
	rewardTokenYPrice: "0",
};

const mockClient = (
	handler: (url: string) => { body: unknown; status?: number },
) =>
	Layer.succeed(
		HttpClient.HttpClient,
		HttpClient.make((req) => {
			const { body, status } = handler(req.url);
			return Effect.succeed(
				HttpClientResponse.fromWeb(
					HttpClientRequest.get(req.url),
					new Response(JSON.stringify(body), {
						status: status ?? 200,
						headers: { "content-type": "application/json" },
					}),
				),
			);
		}),
	);

const layerWith = (
	handler: (url: string) => { body: unknown; status?: number },
) =>
	MeteoraApiLayer.pipe(
		Layer.provide(mockClient(handler)),
		Layer.provideMerge(AppConfigTest({ wallet: "Wallet111" })),
	);

describe("closedPositionsContent", () => {
	it("renders closed positions detail for a pool", async () => {
		const result = await Effect.runPromise(
			closedPositionsContent("PoolX", "OLD/SOL").pipe(
				Effect.provide(
					layerWith((url) =>
						url.includes("/positions/PoolX/pnl")
							? { body: closedPnlBody }
							: { body: { error: "unexpected" }, status: 404 },
					),
				),
			),
		);
		expect(result).toContain("CLOSED POSITIONS // OLD/SOL");
		expect(result).toContain("posA");
		expect(result).toContain("$105.00");
	});

	it("returns an empty string when no pool is given", async () => {
		const result = await Effect.runPromise(
			closedPositionsContent("", "").pipe(
				Effect.provide(layerWith(() => ({ body: {} }))),
			),
		);
		expect(result).toBe("");
	});

	it("shows an error message when the API call fails", async () => {
		const result = await Effect.runPromise(
			closedPositionsContent("PoolX", "OLD/SOL").pipe(
				Effect.provide(
					layerWith(() => ({ body: { error: "nope" }, status: 500 })),
				),
			),
		);
		expect(result).toContain("Failed to load closed positions");
	});
});
