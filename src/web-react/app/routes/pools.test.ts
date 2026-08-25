import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolsPayload } from "~/lib/pools";

const mocks = vi.hoisted(() => ({
	fetchPools: vi.fn(),
}));

vi.mock("~/lib/server/pools.server", () => ({
	fetchPools: mocks.fetchPools,
}));
vi.mock("~/middleware/auth", () => ({ authMiddleware: {} }));

import { loader } from "./pools";

const payload: PoolsPayload = {
	ok: true,
	timeframe: "30m",
	total: 1,
	pools: [],
	solPrice: 100,
	fetchedAt: 1,
	wallet: "wallet",
	rpc: "rpc",
};

describe("pools loader", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.fetchPools.mockResolvedValue(payload);
	});

	it("returns the complete pools payload", async () => {
		const result = await loader({
			request: new Request("https://example.test/pools"),
		} as Parameters<typeof loader>[0]);

		expect(result).toEqual(payload);
		expect(mocks.fetchPools).toHaveBeenCalledWith(null);
	});
});
