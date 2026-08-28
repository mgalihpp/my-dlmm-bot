import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	fetchPortfolio: vi.fn(),
}));

vi.mock("~/components/portfolio/portfolio-page", () => ({
	PortfolioPage: () => null,
}));
vi.mock("~/lib/server/close.server", () => ({ closePosition: vi.fn() }));
vi.mock("~/lib/server/portfolio.server", () => mocks);
vi.mock("~/middleware/auth", () => ({ authMiddleware: {} }));

import { loader } from "./portfolio";

const critical = {
	ok: true,
	wallet: "wallet",
	rpc: "rpc",
	solPrice: 100,
	total: null,
	summary: {},
	pools: [],
	history: [],
};

describe("portfolio loader", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.fetchPortfolio.mockResolvedValue(critical);
	});

	it("returns the complete portfolio payload", async () => {
		const result = await loader({
			request: new Request("https://example.test/portfolio"),
		} as Parameters<typeof loader>[0]);

		expect(result).toEqual(critical);
		expect(mocks.fetchPortfolio).toHaveBeenCalledWith(1, null);
	});

	it("passes a valid closed positions page to the fetcher", async () => {
		await loader({
			request: new Request("https://example.test/portfolio?closedPage=3"),
		} as Parameters<typeof loader>[0]);

		expect(mocks.fetchPortfolio).toHaveBeenCalledWith(3, null);
	});

	it("passes wallet param to the fetcher", async () => {
		await loader({
			request: new Request("https://example.test/portfolio?wallet=W1"),
		} as Parameters<typeof loader>[0]);
		expect(mocks.fetchPortfolio).toHaveBeenCalledWith(1, "W1");
	});
});
