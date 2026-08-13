import { describe, expect, it } from "vitest";
import type {
	AgentJournalEntry,
	JournalCandidate,
} from "../src/telegram/agent/journal.js";
import type { AgentState } from "../src/telegram/agent/state.js";
import { buildNarrativePrompt, windowEntries } from "../src/web/agent-narrative.js";

const mkCandidate = (over: Partial<JournalCandidate> = {}): JournalCandidate => ({
	pool: "poolA",
	poolName: "Token/SOL",
	heuristicScore: 80,
	rationale: "solid",
	action: "open",
	guardrail: "pass",
	blockedReason: null,
	execution: "ok",
	txSignature: null,
	...over,
});

const mkEntry = (
	ts: string,
	cycle: number,
	candidates: JournalCandidate[],
): AgentJournalEntry => ({ ts, cycle, llmStatus: "ok", candidates });

const mkState = (): AgentState => ({
	enabled: true,
	running: true,
	lastCycleAt: "2026-08-12T10:00:00.000Z",
	llmStatus: "ok",
	cycle: 42,
	plans: [],
	executions: [],
	cooldowns: [],
});

describe("windowEntries", () => {
	const now = Date.parse("2026-08-12T12:00:00.000Z");
	it("keeps only entries inside the last 24h", () => {
		const entries = [
			mkEntry("2026-08-11T11:59:00.000Z", 1, []),
			mkEntry("2026-08-11T12:00:00.000Z", 2, []),
			mkEntry("2026-08-12T11:00:00.000Z", 3, []),
		];
		expect(windowEntries(entries, now).map((e) => e.cycle)).toEqual([2, 3]);
	});
	it("returns empty for empty journal", () => {
		expect(windowEntries([], now)).toEqual([]);
	});
});

describe("buildNarrativePrompt", () => {
	it("includes cycle headers, actions, pool names and trimmed rationale", () => {
		const entries = [
			mkEntry("2026-08-12T10:00:00.000Z", 7, [
				mkCandidate({ action: "open", rationale: "x".repeat(200) }),
				mkCandidate({
					action: "open",
					guardrail: "blocked",
					blockedReason: "cooldown",
				}),
				mkCandidate({ action: "tp", execution: "failed" }),
			]),
		];
		const prompt = buildNarrativePrompt(entries, mkState());
		expect(prompt).toContain("#7");
		expect(prompt).toContain("Token/SOL");
		expect(prompt).toContain("action=open");
		expect(prompt).toContain("blocked=\"cooldown\"");
		expect(prompt).toContain("exec=failed");
		expect(prompt).toContain("llm=ok");
		expect(prompt).toContain("...");
		expect(prompt.length).toBeLessThan(2500);
	});
	it("handles empty journal and empty state sections", () => {
		const prompt = buildNarrativePrompt([], mkState());
		expect(prompt).toContain("- kosong");
		expect(prompt).toContain("- none");
	});
	it("marks llm-failed cycles", () => {
		const entries = [
			{ ts: "2026-08-12T10:00:00.000Z", cycle: 3, llmStatus: "failed" as const, candidates: [] },
		];
		expect(buildNarrativePrompt(entries, mkState())).toContain("llm=failed");
	});
});
