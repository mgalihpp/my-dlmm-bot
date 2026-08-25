import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	fetchPortfolioCritical: vi.fn(),
	fetchPortfolioDeferred: vi.fn(),
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
		mocks.fetchPortfolioCritical.mockResolvedValue(critical);
		mocks.fetchPortfolioDeferred.mockResolvedValue({});
	});

	it("awaits critical data and defers enrichment", async () => {
		const result = await loader({
			request: new Request("https://example.test/portfolio"),
		} as Parameters<typeof loader>[0]);

		expect(result.critical).toEqual(critical);
		expect(result.deferred).toBeInstanceOf(Promise);
		expect(mocks.fetchPortfolioDeferred).toHaveBeenCalledWith(
			critical.wallet,
			critical.pools,
			1,
		);
	});
});
