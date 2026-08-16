import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
	AgentJournalEntry,
	JournalCandidate,
} from "../src/telegram/agent/journal.js";
import type { AgentState } from "../src/telegram/agent/state.js";
import type { NarrativeCache } from "../src/shared/agent-narrative.js";
import {
	buildNarrativePrompt,
	buildRunSummary,
	dailyCut,
	isNarrativeStale,
	NARRATIVE_CUT_HOUR,
	NARRATIVE_DAY_MS,
	narrativeFor,
	narrativeSnapshot,
	newestEntryTs,
	readNarrativeCache,
	windowEntries,
	writeNarrativeCache,
} from "../src/shared/agent-narrative.js";

const LLM = {
	baseUrl: "http://localhost",
	model: "m",
	apiKey: "key",
	timeoutMs: 1000,
};

const cacheFile = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "vexis-narrative-"));
	return join(dir, "narrative.json");
};

describe("narrativeFor", () => {
	it("returns cached text when fresh", async () => {
		const now = Date.parse("2026-08-12T10:05:00.000Z");
		const file = cacheFile();
		const entryTs = new Date(
			dailyCut(NARRATIVE_CUT_HOUR, now) - 3_600_000,
		).toISOString();
		writeNarrativeCache(
			{
				at: "2026-08-12T10:04:00.000Z",
				coveringTs: entryTs,
				text: "Ringkasan.",
				source: "llm",
			},
			file,
		);
		const entries = [mkEntry(entryTs, 1, [])];
		const spy = vi.fn(async () => "generated");
		const out = await narrativeFor(entries, mkState(), LLM, now, file, spy);
		expect(out).toEqual({ text: "Ringkasan.", source: "llm" });
		expect(spy).not.toHaveBeenCalled();
	});
	it("generates via LLM when stale and persists result", async () => {
		const now = Date.parse("2026-08-12T10:30:00.000Z");
		const file = cacheFile();
		const entryTs = new Date(
			dailyCut(NARRATIVE_CUT_HOUR, now) - 3_600_000,
		).toISOString();
		const entries = [mkEntry(entryTs, 1, [])];
		const spy = vi.fn(async () => "Ringkasan baru.");
		const out = await narrativeFor(entries, mkState(), LLM, now, file, spy);
		expect(out).toEqual({ text: "Ringkasan baru.", source: "llm" });
		expect(spy).toHaveBeenCalledOnce();
		expect(readNarrativeCache(file)).toMatchObject({
			text: "Ringkasan baru.",
			source: "llm",
			coveringTs: entryTs,
		});
	});
	it("falls back to summary when LLM fails and caches fallback", async () => {
		const now = Date.parse("2026-08-12T10:30:00.000Z");
		const file = cacheFile();
		const entryTs = new Date(
			dailyCut(NARRATIVE_CUT_HOUR, now) - 3_600_000,
		).toISOString();
		const entries = [mkEntry(entryTs, 1, [])];
		const spy = vi.fn(async () => null);
		const out = await narrativeFor(entries, mkState(), LLM, now, file, spy);
		expect(out.source).toBe("fallback");
		expect(out.text).toBe(buildRunSummary(entries));
		expect(readNarrativeCache(file)).toMatchObject({ source: "fallback" });
	});
	it("skips LLM entirely when llm is null", async () => {
		const now = Date.parse("2026-08-12T10:30:00.000Z");
		const file = cacheFile();
		const entryTs = new Date(
			dailyCut(NARRATIVE_CUT_HOUR, now) - 3_600_000,
		).toISOString();
		const entries = [mkEntry(entryTs, 1, [])];
		const spy = vi.fn(async () => "unused");
		const out = await narrativeFor(entries, mkState(), null, now, file, spy);
		expect(out.source).toBe("fallback");
		expect(spy).not.toHaveBeenCalled();
	});
	it("survives a throwing callLlm", async () => {
		const now = Date.parse("2026-08-12T10:30:00.000Z");
		const file = cacheFile();
		const entryTs = new Date(
			dailyCut(NARRATIVE_CUT_HOUR, now) - 3_600_000,
		).toISOString();
		const entries = [mkEntry(entryTs, 1, [])];
		const spy = vi.fn(async () => {
			throw new Error("boom");
		});
		const out = await narrativeFor(entries, mkState(), LLM, now, file, spy);
		expect(out.source).toBe("fallback");
	});
});

const mkCandidate = (
	over: Partial<JournalCandidate> = {},
): JournalCandidate => ({
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

describe("dailyCut", () => {
	it("returns today at the cut hour when already past it", () => {
		const today9 = new Date();
		today9.setHours(NARRATIVE_CUT_HOUR, 0, 0, 0);
		const after = today9.getTime() + 60_000;
		expect(dailyCut(NARRATIVE_CUT_HOUR, after)).toBe(today9.getTime());
	});
	it("returns the previous day when before the cut hour", () => {
		const today9 = new Date();
		today9.setHours(NARRATIVE_CUT_HOUR, 0, 0, 0);
		const before = today9.getTime() - 60_000;
		expect(dailyCut(NARRATIVE_CUT_HOUR, before)).toBe(
			today9.getTime() - NARRATIVE_DAY_MS,
		);
	});
});

describe("windowEntries", () => {
	it("keeps only entries inside the briefing-aligned window ending at the 9am cut", () => {
		const now = Date.parse("2026-08-12T12:00:00.000Z");
		const cut = dailyCut(NARRATIVE_CUT_HOUR, now);
		const start = cut - NARRATIVE_DAY_MS;
		const at = (ms: number) => new Date(ms).toISOString();
		const entries = [
			mkEntry(at(start - 1), 0, []),
			mkEntry(at(start), 1, []),
			mkEntry(at(cut - 1), 2, []),
			mkEntry(at(cut), 3, []),
			mkEntry(at(cut + 1), 4, []),
		];
		expect(windowEntries(entries, now).map((e) => e.cycle)).toEqual([1, 2, 3]);
	});
	it("returns empty for empty journal", () => {
		expect(windowEntries([], Date.parse("2026-08-12T12:00:00.000Z"))).toEqual(
			[],
		);
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
		expect(prompt).toContain('blocked="cooldown"');
		expect(prompt).toContain("exec=failed");
		expect(prompt).toContain("llm=ok");
		expect(prompt).toContain("...");
		expect(prompt).toContain("Deployed:");
		expect(prompt).toContain("Stats:");
		expect(prompt.length).toBeLessThan(2500);
	});
	it("handles empty journal and empty state sections", () => {
		const prompt = buildNarrativePrompt([], mkState());
		expect(prompt).toContain("- kosong");
		expect(prompt).toContain("- none");
		expect(prompt).toContain("Deployed:");
		expect(prompt).toContain("posisi aktif:");
	});
	it("marks llm-failed cycles", () => {
		const entries = [
			{
				ts: "2026-08-12T10:00:00.000Z",
				cycle: 3,
				llmStatus: "failed" as const,
				candidates: [],
			},
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
			{
				ts: "2026-08-12T09:00:00.000Z",
				cycle: 9,
				llmStatus: "failed" as const,
				candidates: [],
			},
			{
				ts: "2026-08-12T10:00:00.000Z",
				cycle: 10,
				llmStatus: "ok" as const,
				candidates: [],
			},
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
		expect(buildRunSummary(entries)).toContain("tidak ada keputusan eksekusi");
	});
});

const CACHE: NarrativeCache = {
	at: "2026-08-12T10:00:00.000Z",
	coveringTs: "2026-08-12T09:00:00.000Z",
	text: "Ringkasan.",
	source: "llm",
};

describe("newestEntryTs", () => {
	it("returns the newest entry ts as ISO", () => {
		const entries = [
			mkEntry("2026-08-12T08:00:00.000Z", 1, []),
			mkEntry("2026-08-12T10:00:00.000Z", 2, []),
		];
		expect(newestEntryTs(entries)).toBe("2026-08-12T10:00:00.000Z");
	});
	it("returns empty string for empty journal", () => {
		expect(newestEntryTs([])).toBe("");
	});
});

describe("isNarrativeStale", () => {
	it("true when no cache exists", () => {
		expect(isNarrativeStale(null, [])).toBe(true);
	});
	it("false when covering the latest entry", () => {
		const entries = [mkEntry("2026-08-12T09:00:00.000Z", 1, [])];
		expect(isNarrativeStale(CACHE, entries)).toBe(false);
	});
	it("true when a newer journal entry exists", () => {
		const entries = [mkEntry("2026-08-12T09:30:00.000Z", 1, [])];
		expect(isNarrativeStale(CACHE, entries)).toBe(true);
	});
	it("false when no newer entries even long after the cache was written", () => {
		const entries = [mkEntry("2026-08-12T09:00:00.000Z", 1, [])];
		expect(isNarrativeStale(CACHE, entries)).toBe(false);
	});
});

describe("narrative cache file", () => {
	it("round-trips a cache entry", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-narrative-"));
		const file = join(dir, "cache.json");
		writeNarrativeCache(CACHE, file);
		expect(readNarrativeCache(file)).toEqual(CACHE);
	});
	it("returns null for missing or corrupt files", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-narrative-"));
		const missing = join(dir, "missing.json");
		expect(readNarrativeCache(missing)).toBeNull();
		const corrupt = join(dir, "corrupt.json");
		writeFileSync(corrupt, "{not json", "utf8");
		expect(readNarrativeCache(corrupt)).toBeNull();
	});
});

describe("narrativeSnapshot", () => {
	it("returns cached text when fresh", () => {
		const now = Date.parse("2026-08-12T10:05:00.000Z");
		const file = cacheFile();
		writeNarrativeCache(
			{
				at: "2026-08-12T10:00:00.000Z",
				coveringTs: "2026-08-12T09:00:00.000Z",
				text: "Ringkasan cache.",
				source: "llm",
			},
			file,
		);
		const entries = [mkEntry("2026-08-12T09:00:00.000Z", 1, [])];
		expect(narrativeSnapshot(entries, now, file)).toEqual({
			text: "Ringkasan cache.",
			source: "llm",
		});
	});
	it("returns the deterministic fallback when stale, without touching the LLM", () => {
		const now = Date.parse("2026-08-12T10:30:00.000Z");
		const file = cacheFile();
		writeNarrativeCache(
			{
				at: "2026-08-12T09:05:00.000Z",
				coveringTs: "2026-08-11T09:00:00.000Z",
				text: "Ringkasan lama.",
				source: "llm",
			},
			file,
		);
		const entries = [
			mkEntry("2026-08-11T10:00:00.000Z", 3, [
				mkCandidate({
					poolName: "WIF/SOL",
					action: "open",
					guardrail: "pass",
					execution: "ok",
				}),
			]),
		];
		expect(narrativeSnapshot(entries, now, file)).toEqual({
			text: buildRunSummary(windowEntries(entries, now)),
			source: "fallback",
		});
	});
	it("returns the deterministic fallback when no cache exists", () => {
		const now = Date.parse("2026-08-12T10:30:00.000Z");
		const file = cacheFile();
		const entries = [mkEntry("2026-08-12T09:00:00.000Z", 1, [])];
		const out = narrativeSnapshot(entries, now, file);
		expect(out.source).toBe("fallback");
		expect(out.text).toBe(buildRunSummary(windowEntries(entries, now)));
	});
});

describe("narrativeFor single-flight", () => {
	it("dedupes concurrent generations for the same cache file", async () => {
		const now = Date.parse("2026-08-12T10:30:00.000Z");
		const file = cacheFile();
		const entries = [mkEntry("2026-08-12T09:00:00.000Z", 1, [])];
		let resolveLlm: (text: string) => void = () => {};
		const gate = new Promise<string>((resolve) => {
			resolveLlm = resolve;
		});
		let calls = 0;
		const spy = vi.fn(async () => {
			calls += 1;
			return gate;
		});
		const first = narrativeFor(entries, mkState(), LLM, now, file, spy);
		const second = narrativeFor(entries, mkState(), LLM, now, file, spy);
		await Promise.resolve();
		expect(calls).toBe(1);
		resolveLlm("Ringkasan single-flight.");
		const [a, b] = await Promise.all([first, second]);
		expect(a).toEqual({ text: "Ringkasan single-flight.", source: "llm" });
		expect(b).toEqual(a);
		expect(calls).toBe(1);
	});
});
