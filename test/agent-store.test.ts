import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { appendJournal, readJournal } from "../src/telegram/agent/journal.js";
import { loadState, saveState } from "../src/telegram/agent/state.js";

let dir = "";
const tmpFile = (name: string) => {
	if (!dir) dir = mkdtempSync(join(tmpdir(), "vexis-agent-"));
	return join(dir, name);
};
afterAll(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("journal", () => {
	it("appends and reads entries newest-first", () => {
		const f = tmpFile("journal.jsonl");
		appendJournal(
			{
				ts: "2026-08-08T00:00:00Z",
				cycle: 1,
				llmStatus: "ok",
				candidates: [],
			},
			f,
		);
		appendJournal(
			{
				ts: "2026-08-08T01:00:00Z",
				cycle: 2,
				llmStatus: "degraded",
				candidates: [
					{
						pool: "P1",
						poolName: "A/SOL",
						heuristicScore: 90,
						favorability: 0.5,
						rationale: "ok",
						score: 91,
						action: "open",
						guardrail: "pass",
						blockedReason: null,
						execution: "ok",
						txSignature: "sig",
					},
				],
			},
			f,
		);
		const entries = readJournal(1, f);
		expect(entries).toHaveLength(1);
		expect(entries[0].cycle).toBe(2);
		expect(entries[0].candidates[0].txSignature).toBe("sig");
	});
});

describe("state", () => {
	it("round-trips and falls back to defaults", () => {
		const f = tmpFile("state.json");
		expect(loadState(f).running).toBe(false);
		saveState(
			{
				running: true,
				cycle: 3,
				plans: [],
				executions: [],
				enabled: true,
				lastCycleAt: "x",
				llmStatus: "degraded",
			},
			f,
		);
		expect(loadState(f).running).toBe(true);
		expect(loadState(f).cycle).toBe(3);
	});

	it("round-trips cooldowns", () => {
		const f = tmpFile("state-cd.json");
		saveState(
			{
				enabled: true,
				running: false,
				lastCycleAt: null,
				llmStatus: "skipped",
				cycle: 0,
				plans: [],
				executions: [],
				cooldowns: [
					{
						pool: "P1",
						poolName: "A/SOL",
						baseMint: "mx",
						until: "2026-08-09T00:00:00Z",
						reason: "closed",
					},
				],
			},
			f,
		);
		expect(loadState(f).cooldowns).toHaveLength(1);
		expect(loadState(f).cooldowns[0].reason).toBe("closed");
	});
});
