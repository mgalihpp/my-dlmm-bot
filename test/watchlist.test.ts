import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadState } from "../src/services/Watchlist.js";

let dir = "";
const tmpFile = (name: string) => {
	if (!dir) dir = mkdtempSync(join(tmpdir(), "vexis-watchlist-"));
	return join(dir, name);
};
afterAll(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("watchlist loadState", () => {
	it("returns empty wallets when the file is missing or corrupt", () => {
		expect(loadState(tmpFile("missing.json")).wallets).toEqual([]);
		const f = tmpFile("corrupt.json");
		writeFileSync(f, "{nope", "utf8");
		expect(loadState(f).wallets).toEqual([]);
	});

	it("drops malformed wallet entries and coerces fields", () => {
		const f = tmpFile("shape.json");
		writeFileSync(
			f,
			JSON.stringify({
				wallets: [
					{
						address: "wallet1",
						label: "main",
						addedAt: "2026-01-01T00:00:00Z",
					},
					{ label: "no address" },
					{ address: 42 },
					"junk",
					null,
				],
			}),
			"utf8",
		);
		const wallets = loadState(f).wallets;
		expect(wallets).toHaveLength(1);
		expect(wallets[0].address).toBe("wallet1");
		expect(wallets[0].label).toBe("main");
		expect(wallets[0].addedAt).toBe("2026-01-01T00:00:00Z");
	});

	it("fills missing addedAt for valid entries", () => {
		const f = tmpFile("addedat.json");
		writeFileSync(f, JSON.stringify({ wallets: [{ address: "w1" }] }), "utf8");
		const wallets = loadState(f).wallets;
		expect(wallets).toHaveLength(1);
		expect(typeof wallets[0].addedAt).toBe("string");
	});
});
