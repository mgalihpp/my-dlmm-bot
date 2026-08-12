import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	recordManualClose,
	recordManualCloseCooldown,
} from "../src/telegram/agent/manual-close.js";
import type { AgentState } from "../src/telegram/agent/state.js";

let dir = "";
const tmpFile = (name: string) => {
	if (!dir) dir = mkdtempSync(join(tmpdir(), "vexis-manual-close-"));
	return join(dir, name);
};
afterAll(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

function state(cooldowns: AgentState["cooldowns"]): AgentState {
	return {
		enabled: false,
		running: false,
		lastCycleAt: null,
		llmStatus: "skipped",
		cycle: 0,
		plans: [],
		executions: [],
		cooldowns,
	};
}

describe("recordManualCloseCooldown", () => {
	it("appends a cooldown entry with reason 'closed manually'", () => {
		const s = state([]);
		recordManualCloseCooldown(
			s,
			{ pool: "P1", poolName: "A/SOL", baseMint: "mintX" },
			60_000,
			tmpFile("cd1.json"),
		);
		expect(s.cooldowns).toHaveLength(1);
		expect(s.cooldowns[0]).toMatchObject({
			pool: "P1",
			poolName: "A/SOL",
			baseMint: "mintX",
			reason: "closed manually",
		});
		expect(Date.parse(s.cooldowns[0].until)).toBeGreaterThan(Date.now());
	});

	it("prunes expired entries while appending", () => {
		const s = state([
			{
				pool: "P0",
				poolName: "Old/SOL",
				baseMint: null,
				until: "2020-01-01T00:00:00.000Z",
				reason: "expired",
			},
		]);
		recordManualCloseCooldown(
			s,
			{ pool: "P1", poolName: "A/SOL", baseMint: null },
			60_000,
			tmpFile("cd2.json"),
		);
		expect(s.cooldowns).toHaveLength(1);
		expect(s.cooldowns[0].pool).toBe("P1");
	});
});

describe("recordManualClose", () => {
	it("is a no-op when the agent runtime is unavailable", async () => {
		await expect(
			recordManualClose(() => null, "P1", "A/SOL", null),
		).resolves.toBeUndefined();
	});
});
