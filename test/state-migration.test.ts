import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	clearCooldowns,
	ensureWalletState,
	getWalletState,
	loadState,
	saveState,
} from "../src/telegram/agent/state.js";

describe("state migration", () => {
	it("migrates v1 flat state to v2 sharded", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-"));
		const file = join(dir, ".vexis-agent.json");
		const v1 = {
			enabled: true,
			cycle: 5,
			plans: [
				{
					pool: "P1",
					poolName: "SOL/USDC",
					baseMint: null,
					amountSol: 0.5,
					positionAddress: "Pos1",
					openedAt: new Date().toISOString(),
				},
			],
			cooldowns: [],
			executions: [],
			oorSince: {},
		};
		writeFileSync(file, JSON.stringify(v1));
		const state = loadState(file) as unknown as Record<string, unknown>;
		expect(state.version).toBe(2);
		expect(Object.keys(state.wallets as Record<string, unknown>).length).toBe(
			1,
		);
		// hybrid flat fields preserved
		expect((state as unknown as { cycle: number }).cycle).toBe(5);
		expect((state.global as { cycle: number }).cycle).toBe(5);
	});

	it("keeps cooldowns isolated per wallet", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-"));
		const file = join(dir, ".vexis-agent2.json");
		const state = loadState(file);
		ensureWalletState(state, "WalletA", "main");
		ensureWalletState(state, "WalletB", "scalping");
		state.wallets.WalletA.cooldowns = [
			{
				pool: "P1",
				poolName: "A/SOL",
				baseMint: null,
				until: new Date(Date.now() + 100000).toISOString(),
				reason: "closed",
			},
		];
		state.wallets.WalletB.cooldowns = [];
		saveState(state, file);
		const reloaded = loadState(file);
		expect(reloaded.wallets.WalletA.cooldowns).toHaveLength(1);
		expect(reloaded.wallets.WalletB.cooldowns).toHaveLength(0);
	});

	it("v1 with no data produces empty wallets", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-"));
		const file = join(dir, ".vexis-agent3.json");
		writeFileSync(
			file,
			JSON.stringify({
				enabled: false,
				cycle: 0,
				plans: [],
				cooldowns: [],
				executions: [],
				oorSince: {},
			}),
		);
		const state = loadState(file) as unknown as Record<string, unknown>;
		expect(Object.keys(state.wallets as Record<string, unknown>).length).toBe(
			0,
		);
		expect((state.global as { enabled: boolean }).enabled).toBe(false);
	});

	it("v2 round-trips wallets", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-"));
		const file = join(dir, ".vexis-agent4.json");
		const state = loadState(file);
		const w = ensureWalletState(state, "WalletX");
		w.plans = [
			{
				pool: "P2",
				poolName: "B/SOL",
				baseMint: null,
				amountSol: 1,
				positionAddress: "PosX",
				openedAt: null,
			},
		];
		w.enabled = true;
		state.global.enabled = true;
		saveState(state, file);
		const reloaded = loadState(file);
		expect(reloaded.wallets.WalletX.plans[0].pool).toBe("P2");
		expect(reloaded.global.enabled).toBe(true);
	});

	it("getWalletState returns empty for unknown wallet", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-"));
		const file = join(dir, ".vexis-agent5.json");
		const state = loadState(file);
		const ws = getWalletState(state, "UnknownWallet");
		expect(ws.wallet).toBe("UnknownWallet");
		expect(ws.plans).toEqual([]);
	});

	it("clearCooldowns clears per wallet and hybrid flat", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-"));
		const file = join(dir, ".vexis-agent6.json");
		const state = loadState(file);
		ensureWalletState(state, "WA");
		state.wallets.WA.cooldowns = [
			{
				pool: "P1",
				poolName: "A",
				baseMint: null,
				until: new Date(Date.now() + 1000).toISOString(),
				reason: "x",
			},
		];
		// also ensure hybrid flat has cooldowns via save/reload? For this test we directly call clearCooldowns
		clearCooldowns(state, file);
		const reloaded = loadState(file);
		expect(reloaded.wallets.WA.cooldowns).toHaveLength(0);
		expect(reloaded.cooldowns).toHaveLength(0);
	});
});
