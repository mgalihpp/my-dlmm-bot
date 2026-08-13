import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadState } from "../src/telegram/alerts.js";

let dir = "";
const tmpFile = (name: string) => {
	if (!dir) dir = mkdtempSync(join(tmpdir(), "vexis-alerts-"));
	return join(dir, name);
};
afterAll(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("alerts loadState", () => {
	it("returns defaults when the file is missing or corrupt", () => {
		const missing = loadState(tmpFile("missing.json"));
		expect(missing.positionCheckEnabled).toBe(false);
		expect(missing.lastOpenSnapshot).toEqual([]);
		expect(missing.watchlistSnapshot).toEqual([]);
		const f = tmpFile("corrupt.json");
		writeFileSync(f, "nope", "utf8");
		expect(loadState(f).lastOpenSnapshot).toEqual([]);
	});

	it("coerces scalars and drops malformed snapshots", () => {
		const f = tmpFile("shape.json");
		writeFileSync(
			f,
			JSON.stringify({
				portfolioHours: "24",
				positionCheckEnabled: 1,
				lastPnlUsd: 12.5,
				lastOpenSnapshot: [
					{
						poolAddress: "P1",
						tokenX: "SOL",
						tokenY: "USDC",
						tokenXMint: "x",
						tokenYMint: "y",
						pnl: "1.2",
						pnlPctChange: "5",
						pnlSol: null,
						pnlSolPctChange: null,
						balances: "1/2",
						unclaimedFees: "0",
						openPositionCount: 1,
						listPositions: ["pos1"],
						outOfRange: null,
					},
					{ poolAddress: 42 },
					"junk",
					null,
				],
				watchlistEnabled: true,
				watchlistSnapshot: [{ walletAddress: "w1", pools: [] }, "junk"],
			}),
			"utf8",
		);
		const s = loadState(f);
		expect(s.portfolioHours).toBe(0);
		expect(s.positionCheckEnabled).toBe(false);
		expect(s.lastPnlUsd).toBe(12.5);
		expect(s.watchlistEnabled).toBe(true);
		expect(s.lastOpenSnapshot).toHaveLength(1);
		expect(s.lastOpenSnapshot[0].poolAddress).toBe("P1");
		expect(s.watchlistSnapshot).toHaveLength(1);
		expect(s.watchlistSnapshot[0].walletAddress).toBe("w1");
	});
});
