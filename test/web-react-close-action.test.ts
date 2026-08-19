import { describe, expect, it, vi } from "vitest";

const closePosition = vi.fn().mockResolvedValue({ ok: true, sig: "sig" });

vi.mock("../src/web-react/app/lib/server/close.server.js", () => ({
	closePosition,
}));

const { action } = await import("../src/web-react/app/routes/portfolio.tsx");

describe("portfolio close action", () => {
	it("passes the pool name to the close service", async () => {
		const request = new Request("http://localhost/portfolio", {
			method: "POST",
			body: new URLSearchParams({
				op: "close",
				pool: "pool-address",
				position: "position-address",
				poolName: "BOT/SOL",
			}),
		});

		await action({ request } as never);

		expect(closePosition).toHaveBeenCalledWith(
			"pool-address",
			"position-address",
			"BOT/SOL",
		);
	});
});
