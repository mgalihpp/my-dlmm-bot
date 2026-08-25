import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolsPayload } from "~/lib/pools";

const mocks = vi.hoisted(() => ({
	fetchPoolsCritical: vi.fn(),
	fetchPoolsDeferred: vi.fn(),
}));

vi.mock("~/lib/server/pools.server", () => ({
	fetchPoolsCritical: mocks.fetchPoolsCritical,
	fetchPoolsDeferred: mocks.fetchPoolsDeferred,
}));
vi.mock("~/middleware/auth", () => ({ authMiddleware: {} }));

import { loader } from "./pools";

const payload: PoolsPayload = {
	ok: true,
	timeframe: "30m",
	total: 1,
	filtered: 1,
	pools: [],
	solPrice: 100,
	fetchedAt: 1,
	wallet: "wallet",
	rpc: "rpc",
};

describe("pools loader", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.fetchPoolsCritical.mockResolvedValue(payload);
		mocks.fetchPoolsDeferred.mockResolvedValue([]);
	});

	it("awaits critical data and defers enrichment", async () => {
		const result = await loader({
			request: new Request("https://example.test/pools"),
		} as Parameters<typeof loader>[0]);

		expect(result.critical).toEqual(payload);
		expect(result.deferred).toBeInstanceOf(Promise);
		expect(mocks.fetchPoolsDeferred).toHaveBeenCalledWith(payload.pools);
	});
});
