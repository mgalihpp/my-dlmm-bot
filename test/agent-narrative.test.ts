import { describe, expect, it } from "vitest";
import type {
	AgentJournalEntry,
	JournalCandidate,
} from "../src/telegram/agent/journal.js";
import type { AgentState } from "../src/telegram/agent/state.js";
import { buildNarrativePrompt, buildRunSummary, windowEntries } from "../src/web/agent-narrative.js";

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

describe("buildRunSummary", () => {
	it("renders cycle range, action counts and blocked reasons", () => {
		const entries = [
			mkEntry("2026-08-12T09:00:00.000Z", 40, [
				mkCandidate({ poolName: "SOL/USDC", action: "open" }),
				mkCandidate({
					poolName: "JUP/SOL",
					action: "open",
					guardrail: "blocked",
					blockedReason: "max positions",
				}),
			]),
			mkEntry("2026-08-12T10:00:00.000Z", 41, [
				mkCandidate({ poolName: "WIF/SOL", action: "tp" }),
				mkCandidate({ poolName: "BONK/SOL", action: "sl" }),
			]),
		];
		const out = buildRunSummary(entries);
		expect(out).toContain("Siklus 40–41");
		expect(out).toContain("2 open (SOL/USDC, JUP/SOL)");
		expect(out).toContain("1 TP");
		expect(out).toContain("1 SL");
		expect(out).toContain("1 blocked");
		expect(out).toContain("max positions");
	});
	it("mentions llm-failed cycles", () => {
		const entries = [
			{ ts: "2026-08-12T09:00:00.000Z", cycle: 9, llmStatus: "failed" as const, candidates: [] },
			{ ts: "2026-08-12T10:00:00.000Z", cycle: 10, llmStatus: "ok" as const, candidates: [] },
		];
		expect(buildRunSummary(entries)).toContain("LLM gagal di siklus 9");
	});
	it("reports failed executions", () => {
		const entries = [
			mkEntry("2026-08-12T10:00:00.000Z", 5, [
				mkCandidate({ action: "close", execution: "failed" }),
			]),
		];
		expect(buildRunSummary(entries)).toContain("1 eksekusi gagal");
	});
	it("handles empty journal", () => {
		expect(buildRunSummary([])).toBe(
			"Belum ada aktivitas dalam 24 jam terakhir.",
		);
	});
	it("handles entries with no decisions", () => {
		const entries = [mkEntry("2026-08-12T10:00:00.000Z", 3, [])];
		expect(buildRunSummary(entries)).toContain(
			"tidak ada keputusan eksekusi",
		);
	});
});
