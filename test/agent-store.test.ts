import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { appendJournal, readJournal } from "../src/telegram/agent/journal.js";
import {
	clearCooldowns,
	loadState,
	saveState,
} from "../src/telegram/agent/state.js";

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
				llmStatus: "failed",
				candidates: [
					{
						pool: "P1",
						poolName: "A/SOL",
						heuristicScore: 90,
						rationale: "ok",
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

	it("caps the file to maxLines, keeping the newest entries", () => {
		const f = tmpFile("journal-cap.jsonl");
		for (let i = 1; i <= 6; i++) {
			appendJournal(
				{
					ts: `2026-08-08T00:0${i}:00Z`,
					cycle: i,
					llmStatus: "ok",
					candidates: [],
				},
				f,
				3,
			);
		}
		const entries = readJournal(10, f);
		expect(entries.map((e) => e.cycle)).toEqual([4, 5, 6]);
	});

	it("keeps every line while under maxLines", () => {
		const f = tmpFile("journal-under.jsonl");
		for (let i = 1; i <= 2; i++) {
			appendJournal(
				{
					ts: `2026-08-08T00:0${i}:00Z`,
					cycle: i,
					llmStatus: "ok",
					candidates: [],
				},
				f,
				5,
			);
		}
		expect(readJournal(10, f)).toHaveLength(2);
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
				cooldowns: [],
				enabled: true,
				lastCycleAt: "x",
				llmStatus: "failed",
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

	it("clearCooldowns empties the list and persists", () => {
		const f = tmpFile("state-clear.json");
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
						until: "2099-01-01T00:00:00Z",
						reason: "tp",
					},
				],
			},
			f,
		);
		clearCooldowns(loadState(f), f);
		expect(loadState(f).cooldowns).toHaveLength(0);
	});

	it("falls back to defaults when state file is not an object", () => {
		const f = tmpFile("state-array.json");
		writeFileSync(f, "[1,2,3]", "utf8");
		const s = loadState(f);
		expect(s.enabled).toBe(false);
		expect(s.plans).toEqual([]);
		expect(s.cooldowns).toEqual([]);
	});

	it("drops malformed entries and coerces bad scalars", () => {
		const f = tmpFile("state-shape.json");
		writeFileSync(
			f,
			JSON.stringify({
				enabled: "yes",
				running: 1,
				cycle: "3",
				llmStatus: "banana",
				lastCycleAt: 123,
				plans: [{ pool: "P1", poolName: "A/SOL" }, { pool: 42 }, "junk", null],
				executions: [
					{
						at: "2026-01-01T00:00:00Z",
						action: "open",
						pool: "P1",
						txSignature: null,
					},
					{ at: 5 },
				],
				cooldowns: [
					{
						pool: "P2",
						poolName: "B/SOL",
						until: "2026-01-01T00:00:00Z",
						reason: "closed",
					},
					{},
				],
			}),
			"utf8",
		);
		const s = loadState(f);
		expect(s.enabled).toBe(false);
		expect(s.running).toBe(false);
		expect(s.cycle).toBe(0);
		expect(s.llmStatus).toBe("skipped");
		expect(s.lastCycleAt).toBeNull();
		expect(s.plans).toHaveLength(1);
		expect(s.plans[0].pool).toBe("P1");
		expect(s.plans[0].amountSol).toBe(0);
		expect(s.executions).toHaveLength(1);
		expect(s.executions[0].action).toBe("open");
		expect(s.cooldowns).toHaveLength(1);
		expect(s.cooldowns[0].pool).toBe("P2");
	});
});
