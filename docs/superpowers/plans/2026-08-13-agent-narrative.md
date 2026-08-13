# Agent Log Narrative (Web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `/agent` web page a narrative — LLM-written Indonesian prose (with deterministic fallback) in the LATEST RUN panel, plus a chronological per-cycle timeline that surfaces each decision's rationale.

**Architecture:** New pure module `src/web/agent-narrative.ts` builds prompts and fallback summaries from journal + state only (no screening/PnL network calls), requests LLM text via the same `@ai-sdk/openai-compatible` pattern as `src/telegram/agent/briefing.ts`, and caches results in a gitignored JSON file with a TTL. `src/web/pages/agent.ts` becomes async (`AppConfig` provides the LLM config), renders the narrative prose in the briefing panel, and replaces the journal table with a timeline grouped per cycle. Everything narrative-related is pure and unit-tested; the LLM boundary is dependency-injected.

**Tech Stack:** TypeScript (strict, ESM), Effect, `ai` + `@ai-sdk/openai-compatible` (already dependencies), Vitest, Biome. No new dependencies.

## Global Constraints

- ESM only; local imports use `.js` extensions.
- Strict TypeScript; no `any`; no non-null assertions (use guards instead).
- No new dependencies; no changes to `.vexis-agent-journal.jsonl`, `.vexis-agent.json`, journal schema, or Telegram behavior.
- Narrative prose is Indonesian, plain text, no markdown, ≤ ~120 words.
- Narrative window: last 24h of journal entries (`NARRATIVE_DAY_MS = 24 * 3_600_000`).
- Cache TTL: 10 minutes (`NARRATIVE_TTL_MS = 10 * 60_000`); regenerate when no cache, newest entry ts > `coveringTs`, or cache older than TTL. On LLM failure persist the fallback text so at most one LLM attempt per 10 min.
- Cache file: `.vexis-agent-narrative.json` in `process.cwd()` — must be added to `.gitignore`.
- Web page stays read-only. LLM config comes from `resolveAgentConfigFrom(current).llm` via `AppConfig`.
- Verify with `npm run check`, `npm run typecheck`, `npm test` at the end.

---

### Task 1: Prompt builder + 24h window filter

**Files:**
- Create: `src/web/agent-narrative.ts` (this task adds the imports, `NARRATIVE_DAY_MS`, `windowEntries`, `truncate`, `buildNarrativePrompt`; later tasks extend this file)
- Test: `test/agent-narrative.test.ts`

**Interfaces:**
- Produces: `windowEntries(entries: readonly AgentJournalEntry[], nowMs: number): AgentJournalEntry[]`; `buildNarrativePrompt(entries: readonly AgentJournalEntry[], state: AgentState): string`. `entries` is chronological (oldest first); `state` is the `AgentState` from `src/telegram/agent/state.js`.

- [ ] **Step 1: Write the failing test**

Create `test/agent-narrative.test.ts`:

```ts
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
			{ ts: "2026-08-12T10:00:00.000Z", cycle: 3, llmStatus: "failed", candidates: [] },
		];
		expect(buildNarrativePrompt(entries, mkState())).toContain("llm=failed");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-narrative.test.ts`
Expected: FAIL — module `../src/web/agent-narrative.js` cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

Create `src/web/agent-narrative.ts`:

```ts
import type { AgentJournalEntry } from "../telegram/agent/journal.js";
import type { AgentState } from "../telegram/agent/state.js";

export const NARRATIVE_DAY_MS = 24 * 3_600_000;

export function windowEntries(
	entries: readonly AgentJournalEntry[],
	nowMs: number,
): AgentJournalEntry[] {
	const cutoff = nowMs - NARRATIVE_DAY_MS;
	return entries.filter((entry) => Date.parse(entry.ts) >= cutoff);
}

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function buildNarrativePrompt(
	entries: readonly AgentJournalEntry[],
	state: AgentState,
): string {
	const journalLines: string[] = [];
	for (const entry of entries) {
		const candidates = entry.candidates
			.map((candidate) => {
				const blocked =
					candidate.guardrail === "blocked"
						? ` blocked="${candidate.blockedReason ?? ""}"`
						: "";
				const failed =
					candidate.execution === "failed" ? " exec=failed" : "";
				const rationale =
					candidate.rationale === null
						? ""
						: ` rationale="${truncate(candidate.rationale, 80)}"`;
				return `- ${candidate.poolName || candidate.pool} action=${candidate.action}${blocked}${failed}${rationale}`;
			})
			.join("\n");
		journalLines.push(
			`#${entry.cycle} (llm=${entry.llmStatus})${candidates ? `\n${candidates}` : ""}`,
		);
	}
	const cooldowns =
		state.cooldowns.length > 0
			? state.cooldowns
					.map((c) => `- ${c.poolName || c.pool} until ${c.until} (${c.reason})`)
					.join("\n")
			: "- none";
	const executions =
		state.executions.length > 0
			? state.executions
					.slice(-5)
					.map((e) => `- ${e.at} ${e.action} ${e.pool}`)
					.join("\n")
			: "- none";
	return [
		"Anda adalah portfolio manager untuk bot likuiditas Solana DLMM. Ringkas aktivitas otomatis 24 jam terakhir dalam bahasa Indonesia, teks polos, tanpa markdown/emoji, maksimal 120 kata.",
		"Cakup: 1) apa yang terjadi (open/close dengan nama pool, TP/SL, blocked dengan alasan), 2) anomali (eksekusi gagal, cycle dengan llm=failed — keputusan saat itu hanya berbasis heuristik), 3) catatan risiko penutup (posisi di luar range, capital terpusat, blocked opens).",
		"",
		`Jurnal 24 jam terakhir (${entries.length} cycle):`,
		journalLines.join("\n") || "- kosong",
		"",
		"Cooldown aktif:",
		cooldowns,
		"",
		"Eksekusi terakhir:",
		executions,
		"",
		`Total cycle sejauh ini: ${state.cycle}.`,
	].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-narrative.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/web/agent-narrative.ts test/agent-narrative.test.ts
git commit -m "feat(web): narrative prompt builder for agent log page"
```

---

### Task 2: Deterministic fallback summary

**Files:**
- Modify: `src/web/agent-narrative.ts` (add `buildRunSummary`)
- Modify: `test/agent-narrative.test.ts` (add describe block)

**Interfaces:**
- Consumes: `windowEntries` (not needed here — `buildRunSummary` receives already-windowed entries), `AgentJournalEntry`.
- Produces: `buildRunSummary(entries: readonly AgentJournalEntry[]): string` — 1–4 Indonesian sentences, no markdown.

- [ ] **Step 1: Write the failing test**

Append to `test/agent-narrative.test.ts` (keep the existing `mkEntry`, `mkCandidate`, `mkState` helpers):

```ts
import { buildNarrativePrompt, buildRunSummary, windowEntries } from "../src/web/agent-narrative.js";

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
		expect(out).toContain("1 open (SOL/USDC)");
		expect(out).toContain("1 TP");
		expect(out).toContain("1 SL");
		expect(out).toContain("1 blocked");
		expect(out).toContain("max positions");
	});
	it("mentions llm-failed cycles", () => {
		const entries = [
			{ ts: "2026-08-12T09:00:00.000Z", cycle: 9, llmStatus: "failed", candidates: [] },
			{ ts: "2026-08-12T10:00:00.000Z", cycle: 10, llmStatus: "ok", candidates: [] },
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
```

Note: the existing import line must change to include `buildRunSummary` (single import statement at top of file).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-narrative.test.ts`
Expected: FAIL — `buildRunSummary` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/web/agent-narrative.ts`:

```ts
export function buildRunSummary(
	entries: readonly AgentJournalEntry[],
): string {
	if (entries.length === 0) return "Belum ada aktivitas dalam 24 jam terakhir.";
	let opens = 0;
	let tp = 0;
	let sl = 0;
	let closes = 0;
	let blocked = 0;
	let failed = 0;
	const openNames: string[] = [];
	const blockedReasons: string[] = [];
	const llmFailedCycles: number[] = [];
	for (const entry of entries) {
		if (entry.llmStatus === "failed") llmFailedCycles.push(entry.cycle);
		for (const candidate of entry.candidates) {
			switch (candidate.action) {
				case "open":
					opens += 1;
					if (openNames.length < 3)
						openNames.push(candidate.poolName || candidate.pool);
					break;
				case "tp":
					tp += 1;
					break;
				case "sl":
					sl += 1;
					break;
				case "close":
					closes += 1;
					break;
				case "hold":
					break;
			}
			if (candidate.guardrail === "blocked") {
				blocked += 1;
				if (blockedReasons.length < 2 && candidate.blockedReason) {
					blockedReasons.push(candidate.blockedReason);
				}
			}
			if (candidate.execution === "failed") failed += 1;
		}
	}
	const first = entries[0].cycle;
	const last = entries[entries.length - 1].cycle;
	const cycleRange =
		first === last ? `Siklus ${last}` : `Siklus ${first}–${last}`;
	const bits: string[] = [];
	if (opens > 0)
		bits.push(`${opens} open${openNames.length > 0 ? ` (${openNames.join(", ")})` : ""}`);
	if (tp > 0) bits.push(`${tp} TP`);
	if (sl > 0) bits.push(`${sl} SL`);
	if (closes > 0) bits.push(`${closes} close`);
	const parts: string[] = [];
	if (blocked > 0) {
		parts.push(
			`${cycleRange}: ${bits.join(", ")}, ${blocked} blocked${blockedReasons.length > 0 ? ` (${blockedReasons.join("; ")})` : ""}.`,
		);
	} else {
		parts.push(`${cycleRange}: ${bits.join(", ") || "tidak ada keputusan eksekusi"}.`);
	}
	if (failed > 0) parts.push(`${failed} eksekusi gagal.`);
	if (llmFailedCycles.length > 0) {
		parts.push(
			`LLM gagal di siklus ${llmFailedCycles.join(", ")} — keputusan saat itu berbasis heuristik.`,
		);
	}
	return parts.join(" ");
}
```



- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-narrative.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/web/agent-narrative.ts test/agent-narrative.test.ts
git commit -m "feat(web): deterministic fallback summary for agent narrative"
```

---

### Task 3: Persisted TTL cache

**Files:**
- Modify: `src/web/agent-narrative.ts` (add `NarrativeCache`, `NarrativeResult`, `NARRATIVE_TTL_MS`, `newestEntryTs`, `isNarrativeStale`, `readNarrativeCache`, `writeNarrativeCache`)
- Modify: `test/agent-narrative.test.ts` (add describe blocks)
- Modify: `.gitignore` (add `.vexis-agent-narrative.json`)

**Interfaces:**
- Produces: `NarrativeCache { at: string; coveringTs: string; text: string; source: "llm" | "fallback" }`; `NarrativeResult { text: string; source: "llm" | "fallback" }`; `NARRATIVE_TTL_MS: number` (= 10 * 60_000); `newestEntryTs(entries: readonly AgentJournalEntry[]): string`; `isNarrativeStale(cache: NarrativeCache | null, journal: readonly AgentJournalEntry[], nowMs: number): boolean`; `readNarrativeCache(file?: string): NarrativeCache | null`; `writeNarrativeCache(cache: NarrativeCache, file?: string): void`.
- Consumes: `AgentJournalEntry`.

- [ ] **Step 1: Write the failing test**

Append to `test/agent-narrative.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	NARRATIVE_TTL_MS,
	buildNarrativePrompt,
	buildRunSummary,
	isNarrativeStale,
	newestEntryTs,
	readNarrativeCache,
	windowEntries,
	writeNarrativeCache,
} from "../src/web/agent-narrative.js";
import type { NarrativeCache } from "../src/web/agent-narrative.js";

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
		expect(isNarrativeStale(null, [], Date.now())).toBe(true);
	});
	it("false when fresh and covering latest entry", () => {
		const entries = [mkEntry("2026-08-12T09:00:00.000Z", 1, [])];
		expect(
			isNarrativeStale(CACHE, entries, Date.parse("2026-08-12T10:05:00.000Z")),
		).toBe(false);
	});
	it("true when a newer journal entry exists", () => {
		const entries = [mkEntry("2026-08-12T09:30:00.000Z", 1, [])];
		expect(
			isNarrativeStale(CACHE, entries, Date.parse("2026-08-12T10:05:00.000Z")),
		).toBe(true);
	});
	it("true when cache is older than the TTL", () => {
		const entries = [mkEntry("2026-08-12T09:00:00.000Z", 1, [])];
		expect(
			isNarrativeStale(
				CACHE,
				entries,
				Date.parse(CACHE.at) + NARRATIVE_TTL_MS + 1,
			),
		).toBe(true);
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
		writeNarrativeCache(CACHE, corrupt);
		writeNarrativeCache({ ...CACHE, at: "nope" }, corrupt);
		expect(readNarrativeCache(corrupt)).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-narrative.test.ts`
Expected: FAIL — `NARRATIVE_TTL_MS`, `isNarrativeStale`, etc. not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/web/agent-narrative.ts` (add to the existing imports: `existsSync, readFileSync, writeFileSync` from `node:fs`, `join` from `node:path`):

```ts
export interface NarrativeCache {
	at: string;
	coveringTs: string;
	text: string;
	source: "llm" | "fallback";
}

export interface NarrativeResult {
	text: string;
	source: "llm" | "fallback";
}

export const NARRATIVE_TTL_MS = 10 * 60_000;

const DEFAULT_CACHE_FILE = join(process.cwd(), ".vexis-agent-narrative.json");

export function newestEntryTs(entries: readonly AgentJournalEntry[]): string {
	let best = 0;
	for (const entry of entries) {
		const parsed = Date.parse(entry.ts);
		if (!Number.isNaN(parsed) && parsed > best) best = parsed;
	}
	return best > 0 ? new Date(best).toISOString() : "";
}

export function isNarrativeStale(
	cache: NarrativeCache | null,
	journal: readonly AgentJournalEntry[],
	nowMs: number,
): boolean {
	if (cache === null) return true;
	const newest = newestEntryTs(journal);
	if (newest.length > 0 && newest > cache.coveringTs) return true;
	return nowMs - Date.parse(cache.at) > NARRATIVE_TTL_MS;
}

export function readNarrativeCache(
	file: string = DEFAULT_CACHE_FILE,
): NarrativeCache | null {
	if (!existsSync(file)) return null;
	try {
		const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
		if (typeof raw !== "object" || raw === null) return null;
		const record = raw as Record<string, unknown>;
		if (
			typeof record.at !== "string" ||
			typeof record.coveringTs !== "string" ||
			typeof record.text !== "string"
		) {
			return null;
		}
		const source = record.source === "llm" ? "llm" : "fallback";
		return { at: record.at, coveringTs: record.coveringTs, text: record.text, source };
	} catch {
		return null;
	}
}

export function writeNarrativeCache(
	cache: NarrativeCache,
	file: string = DEFAULT_CACHE_FILE,
): void {
	try {
		writeFileSync(file, JSON.stringify(cache, null, 2), "utf8");
	} catch (e) {
		console.warn("[agent] narrative cache write failed:", e);
	}
}
```

Append `.vexis-agent-narrative.json` to `.gitignore` (after the `.vexis-portfolio-history.json` line):

```text
.vexis-agent-narrative.json
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-narrative.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add src/web/agent-narrative.ts test/agent-narrative.test.ts .gitignore
git commit -m "feat(web): persisted TTL cache for agent narrative"
```

---

### Task 4: LLM request + narrative orchestrator

**Files:**
- Modify: `src/web/agent-narrative.ts` (add `requestNarrative`, `narrativeFor`)
- Modify: `test/agent-narrative.test.ts` (add describe blocks)
- Test: `test/agent-narrative-request.test.ts` (create — tests the LLM boundary with a stubbed provider)

**Interfaces:**
- Consumes: `windowEntries`, `buildNarrativePrompt`, `buildRunSummary`, `newestEntryTs`, `isNarrativeStale`, `readNarrativeCache`, `writeNarrativeCache`, `NarrativeCache`, `NarrativeResult` (all from this module); `ResolvedAgentLlm` from `../src/services/Config.js`.
- Produces: `requestNarrative(llm: ResolvedAgentLlm, prompt: string): Promise<string | null>`; `narrativeFor(entries: readonly AgentJournalEntry[], state: AgentState, llm: ResolvedAgentLlm | null, nowMs?: number, callLlm?: (prompt: string) => Promise<string | null>): Promise<NarrativeResult>`. `callLlm` is dependency-injected so tests never touch the network; default calls `requestNarrative`.

- [ ] **Step 1: Write the failing test**

Create `test/agent-narrative-request.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { requestNarrative } from "../src/web/agent-narrative.js";

describe("requestNarrative", () => {
	it("returns null when no apiKey is configured", async () => {
		const out = await requestNarrative(
			{ baseUrl: "http://localhost", model: "m", apiKey: "", timeoutMs: 1000 },
			"prompt",
		);
		expect(out).toBeNull();
	});
});
```

Append to `test/agent-narrative.test.ts` (import `narrativeFor` and `buildRunSummary` — extend the existing import):

```ts
import { vi } from "vitest";
import {
	NARRATIVE_TTL_MS,
	buildNarrativePrompt,
	buildRunSummary,
	isNarrativeStale,
	narrativeFor,
	newestEntryTs,
	readNarrativeCache,
	windowEntries,
	writeNarrativeCache,
} from "../src/web/agent-narrative.js";

const LLM = {
	baseUrl: "http://localhost",
	model: "m",
	apiKey: "key",
	timeoutMs: 1000,
};

describe("narrativeFor", () => {
	it("returns cached text when fresh", async () => {
		const now = Date.parse("2026-08-12T10:05:00.000Z");
		const entries = [mkEntry("2026-08-12T09:00:00.000Z", 1, [])];
		const spy = vi.fn(async (prompt: string) => "generated");
		const out = await narrativeFor(entries, mkState(), LLM, now, spy);
		expect(out).toEqual({ text: "Ringkasan.", source: "llm" });
		expect(spy).not.toHaveBeenCalled();
	});
	it("generates via LLM when stale and persists result", async () => {
		const now = Date.parse("2026-08-12T10:30:00.000Z");
		const entries = [mkEntry("2026-08-12T09:00:00.000Z", 1, [])];
		const spy = vi.fn(async (prompt: string) => "Ringkasan baru.");
		const out = await narrativeFor(entries, mkState(), LLM, now, spy);
		expect(out).toEqual({ text: "Ringkasan baru.", source: "llm" });
		expect(spy).toHaveBeenCalledOnce();
		expect(readNarrativeCache()).toMatchObject({
			text: "Ringkasan baru.",
			source: "llm",
			coveringTs: "2026-08-12T09:00:00.000Z",
		});
	});
	it("falls back to summary when LLM fails and caches fallback", async () => {
		const now = Date.parse("2026-08-12T10:30:00.000Z");
		const entries = [mkEntry("2026-08-12T09:00:00.000Z", 1, [])];
		const spy = vi.fn(async () => null);
		const out = await narrativeFor(entries, mkState(), LLM, now, spy);
		expect(out.source).toBe("fallback");
		expect(out.text).toBe(buildRunSummary(entries));
		expect(readNarrativeCache()).toMatchObject({ source: "fallback" });
	});
	it("skips LLM entirely when llm is null", async () => {
		const now = Date.parse("2026-08-12T10:30:00.000Z");
		const entries = [mkEntry("2026-08-12T09:00:00.000Z", 1, [])];
		const spy = vi.fn(async () => "unused");
		const out = await narrativeFor(entries, mkState(), null, now, spy);
		expect(out.source).toBe("fallback");
		expect(spy).not.toHaveBeenCalled();
	});
	it("survives a throwing callLlm", async () => {
		const now = Date.parse("2026-08-12T10:30:00.000Z");
		const entries = [mkEntry("2026-08-12T09:00:00.000Z", 1, [])];
		const spy = vi.fn(async () => {
			throw new Error("boom");
		});
		const out = await narrativeFor(entries, mkState(), LLM, now, spy);
		expect(out.source).toBe("fallback");
	});
});
```

Note: `narrativeFor` tests that use `readNarrativeCache()`/`writeNarrativeCache` default path touch `process.cwd()` — this is a temp-independent but real file `.vexis-agent-narrative.json` in the repo root. It is gitignored (Task 3), so leaving it behind is acceptable; the `stale → generate` tests change it in place. Tests run in the repo root, and `isNarrativeStale` guards against cross-test pollution via `coveringTs`/`at`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-narrative.test.ts test/agent-narrative-request.test.ts`
Expected: FAIL — `requestNarrative`/`narrativeFor` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/web/agent-narrative.ts` (add imports: `createOpenAICompatible` from `@ai-sdk/openai-compatible`, `generateText` from `ai`, `ResolvedAgentLlm` type from `../services/Config.js`):

```ts
export async function requestNarrative(
	llm: ResolvedAgentLlm,
	prompt: string,
): Promise<string | null> {
	if (llm.apiKey.length === 0) return null;
	const provider = createOpenAICompatible({
		name: "vexis-narrative",
		baseURL: llm.baseUrl,
		apiKey: llm.apiKey,
	});
	try {
		const { text } = await generateText({
			model: provider(llm.model),
			messages: [{ role: "user", content: prompt }],
			temperature: 0,
			maxRetries: 1,
			timeout: llm.timeoutMs,
		});
		if (!text) return null;
		return text;
	} catch (e) {
		console.error(
			"[agent] narrative LLM request failed:",
			e instanceof Error ? e.message : String(e),
		);
		return null;
	}
}

export async function narrativeFor(
	entries: readonly AgentJournalEntry[],
	state: AgentState,
	llm: ResolvedAgentLlm | null,
	nowMs: number = Date.now(),
	callLlm: (prompt: string) => Promise<string | null> = (prompt) =>
		llm === null ? Promise.resolve(null) : requestNarrative(llm, prompt),
): Promise<NarrativeResult> {
	const windowed = windowEntries(entries, nowMs);
	const cached = readNarrativeCache();
	if (cached !== null && !isNarrativeStale(cached, windowed, nowMs)) {
		return { text: cached.text, source: cached.source };
	}
	const fallbackText = buildRunSummary(windowed);
	let text = fallbackText;
	let source: NarrativeResult["source"] = "fallback";
	if (llm !== null && llm.apiKey.length > 0) {
		try {
			const generated = await callLlm(buildNarrativePrompt(windowed, state));
			if (generated !== null && generated.trim().length > 0) {
				text = generated.trim();
				source = "llm";
			}
		} catch {
			// keep fallback text
		}
	}
	writeNarrativeCache({
		at: new Date(nowMs).toISOString(),
		coveringTs: newestEntryTs(windowed),
		text,
		source,
	});
	return { text, source };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-narrative.test.ts test/agent-narrative-request.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/agent-narrative.ts test/agent-narrative.test.ts test/agent-narrative-request.test.ts
git commit -m "feat(web): LLM narrative generation with fallback orchestrator"
```

---

### Task 5: Timeline grouping helper

**Files:**
- Modify: `src/web/pages/agent.ts` (extend `JournalRow` with `llmStatus`, update `journalRows`, add `TimelineGroup` + `timelineGroups`)
- Modify: `test/web-agent-page.test.ts` (add describe block)

**Interfaces:**
- Consumes: `LlmStatus` type from `../../telegram/agent/state.js` (add to existing import).
- Produces: `JournalRow` gains `readonly llmStatus: LlmStatus`; `TimelineGroup { cycle: number; ts: string; llmStatus: LlmStatus; rows: readonly JournalRow[] }`; `timelineGroups(rows: readonly JournalRow[]): TimelineGroup[]` — groups consecutive rows sharing a cycle (rows are already reverse-chronological), preserving order.

- [ ] **Step 1: Write the failing test**

Append to `test/web-agent-page.test.ts` (import `timelineGroups` and `journalRows` — extend the existing import from `../src/web/pages/agent.js`):

```ts
import { agentStats, journalRows, paginate, parseJournalFilter, renderAgent, timelineGroups } from "../src/web/pages/agent.js";

describe("timelineGroups", () => {
	it("groups consecutive rows by cycle in order", () => {
		const entries = [
			mkEntry(1, [mkCandidate({ action: "tp" }), mkCandidate({ action: "open" })]),
			mkEntry(2, [mkCandidate({ action: "sl" })]),
			mkEntry(3, []),
		];
		const groups = timelineGroups(journalRows(entries, "all"));
		expect(groups.map((g) => g.cycle)).toEqual([3, 2, 1]);
		expect(groups[2].rows).toHaveLength(2);
		expect(groups[0].rows[0].candidate).toBeNull();
	});
	it("preserves llmStatus per group", () => {
		const entries = [
			{ ts: "2026-08-12T10:00:00.000Z", cycle: 1, llmStatus: "failed" as const, candidates: [mkCandidate({ action: "open" })] },
		];
		const groups = timelineGroups(journalRows(entries, "all"));
		expect(groups[0].llmStatus).toBe("failed");
	});
	it("returns empty for empty rows", () => {
		expect(timelineGroups([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/web-agent-page.test.ts`
Expected: FAIL — `timelineGroups` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/web/pages/agent.ts`:

Change the import of state to include `LlmStatus`:

```ts
import { type AgentState, type LlmStatus, loadState } from "../../telegram/agent/state.js";
```

Replace the `JournalRow` interface (line ~103) and both `journalRows` push sites (lines ~115-126):

```ts
export interface JournalRow {
	readonly cycle: number;
	readonly ts: string;
	readonly llmStatus: LlmStatus;
	readonly candidate: JournalCandidate | null;
}
```

In `journalRows`, the empty-candidate push becomes:

```ts
			if (filter === "all")
				rows.push({
					cycle: entry.cycle,
					ts: entry.ts,
					llmStatus: entry.llmStatus,
					candidate: null,
				});
```

and the candidate push becomes:

```ts
			if (matches)
				rows.push({
					cycle: entry.cycle,
					ts: entry.ts,
					llmStatus: entry.llmStatus,
					candidate,
				});
```

Add after `journalRows`:

```ts
export interface TimelineGroup {
	readonly cycle: number;
	readonly ts: string;
	readonly llmStatus: LlmStatus;
	readonly rows: readonly JournalRow[];
}

export function timelineGroups(rows: readonly JournalRow[]): TimelineGroup[] {
	const groups: TimelineGroup[] = [];
	for (const row of rows) {
		const last = groups[groups.length - 1];
		if (last !== undefined && last.cycle === row.cycle) {
			groups[groups.length - 1] = {
				...last,
				rows: [...last.rows, row],
			};
		} else {
			groups.push({
				cycle: row.cycle,
				ts: row.ts,
				llmStatus: row.llmStatus,
				rows: [row],
			});
		}
	}
	return groups;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/web-agent-page.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/web/pages/agent.ts test/web-agent-page.test.ts
git commit -m "feat(web): timeline grouping helper for agent journal"
```

---

### Task 6: Timeline render + narrative briefing panel + CSS

**Files:**
- Modify: `src/web/pages/agent.ts` (replace `renderJournalTable` with `renderJournalTimeline`, update `briefingPanel`, update `renderAgent` signature + call site)
- Modify: `test/web-agent-page.test.ts` (pass narrative to `renderAgent` calls, add narrative + timeline assertions)
- Modify: `src/web/theme.ts` (add timeline CSS after line 396)

**Interfaces:**
- Consumes: `NarrativeResult` from `../../web/agent-narrative.js` (import in `src/web/pages/agent.ts`).
- Produces: `renderAgent(journal, state, opts, narrative: NarrativeResult | null = null): string` — 4th param defaults to `null` (fallback to the old one-sentence copy). Timeline HTML uses classes `timeline`, `timeline-cycle`, `timeline-head`, `timeline-entry`, `timeline-entry-head`, `timeline-pool`, `timeline-rationale`, `timeline-empty`, plus existing `badge`/`sub`/`mono`/`muted` helpers.

- [ ] **Step 1: Write the failing test**

Append to `test/web-agent-page.test.ts` (import `NarrativeResult` type; extend the agent.js import with `timelineGroups` already added in Task 5):

```ts
import type { NarrativeResult } from "../src/web/agent-narrative.js";

const NARRATIVE: NarrativeResult = { text: "Ringkasan prosa.", source: "llm" };

describe("renderAgent narrative + timeline", () => {
	it("renders narrative prose and source badge", () => {
		const html = renderAgent([mkEntry(1, [mkCandidate()])], mkState(), { action: "all", page: 1 }, NARRATIVE);
		expect(html).toContain("Ringkasan prosa.");
		expect(html).toContain(">GENERATED<");
	});
	it("renders fallback badge for fallback source", () => {
		const html = renderAgent([mkEntry(1, [])], mkState(), { action: "all", page: 1 }, { text: "x", source: "fallback" });
		expect(html).toContain(">FALLBACK<");
	});
	it("renders rationale, blocked reason and tx link in timeline entries", () => {
		const entries = [
			mkEntry(1, [
				mkCandidate({ poolName: "WIF/SOL", rationale: "volume naik", txSignature: "sig9" }),
				mkCandidate({ action: "open", guardrail: "blocked", blockedReason: "cooldown", execution: null, txSignature: null }),
			]),
		];
		const html = renderAgent(entries, mkState(), { action: "all", page: 1 }, NARRATIVE);
		expect(html).toContain('class="timeline-cycle"');
		expect(html).toContain("volume naik");
		expect(html).toContain("cooldown");
		expect(html).toContain('href="https://solscan.io/tx/sig9"');
		expect(html).toContain("WIF/SOL");
	});
	it("marks llm-failed cycles", () => {
		const entries = [
			{ ts: "2026-08-12T10:00:00.000Z", cycle: 9, llmStatus: "failed" as const, candidates: [mkCandidate({ action: "hold" })] },
		];
		const html = renderAgent(entries, mkState(), { action: "all", page: 1 }, NARRATIVE);
		expect(html).toContain("LLM FAILED");
	});
	it("falls back to the old copy when narrative is null", () => {
		const html = renderAgent([mkEntry(1, [mkCandidate({ action: "open" })])], mkState(), { action: "all", page: 1 });
		expect(html).toContain("1 open decisions across 1 cycles.");
	});
});
```

Also update every existing `renderAgent(...)` call in `test/web-agent-page.test.ts` that asserts on the briefing panel to pass `NARRATIVE` — except the new "falls back" test. The existing calls compile unchanged thanks to the default parameter; only the assertions that expect the old one-sentence copy must be checked (none of the existing assertions depend on the briefing copy — verified against the file: they assert stats, banner, chart, table cells, escaping).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/web-agent-page.test.ts`
Expected: FAIL — `renderJournalTimeline`/timeline classes not rendered; `renderAgent` doesn't accept narrative yet (TS error).

- [ ] **Step 3: Write minimal implementation**

In `src/web/pages/agent.ts`:

Add import:

```ts
import type { NarrativeResult } from "../agent-narrative.js";
```

(Note: `src/web/pages/agent.ts` already imports from `../../telegram/agent/journal.js` and `../templates.js`; `agent-narrative.js` sits in `src/web/`, so the relative path from `src/web/pages/` is `../agent-narrative.js`.)

Update `briefingPanel` — replace the function (lines 222-231):

```ts
function briefingPanel(
	stats: AgentStats,
	journal: readonly AgentJournalEntry[],
	narrative: NarrativeResult | null,
): string {
	const empty = journal.length === 0;
	const copy =
		narrative !== null
			? narrative.text
			: empty
				? "No decision cycles have been recorded yet."
				: `${stats.opens} open decisions across ${stats.cycles} cycles. ${stats.blocked} candidates were stopped by guardrails before execution.`;
	const sourceBadge =
		narrative === null
			? ""
			: narrative.source === "llm"
				? badge("GENERATED", "pass")
				: badge("FALLBACK", "neutral");
	return `<div class="panel"><div class="panel-head"><div><span class="eyebrow">LATEST RUN</span><b>Decision context</b></div>${badge(journal.length > 0 ? "DATA READY" : "NO DATA", journal.length > 0 ? "pass" : "neutral")}</div><p class="briefing">${escapeHtml(copy)}</p><div class="briefing-tags">${sourceBadge}${badge(`${stats.blocked} BLOCKED`, stats.blocked > 0 ? "review" : "neutral")}<span class="muted small">Read-only journal analysis</span></div></div>`;
}
```

Update `renderAgent` signature and its two call sites (lines 179-216): signature becomes

```ts
export function renderAgent(
	journal: readonly AgentJournalEntry[],
	state: AgentState | null,
	opts: AgentViewOptions,
	narrative: NarrativeResult | null = null,
): string {
```

Inside, change the panel call to `briefingPanel(stats, journal, narrative)` and replace `renderJournalTable(paged.rows)` with `renderJournalTimeline(timelineGroups(paged.rows))`.

Replace `renderJournalTable` (lines 291-315) with:

```ts
function renderJournalTimeline(groups: readonly TimelineGroup[]): string {
	return `<div class="timeline">${groups
		.map((group) => {
			const llmMarker =
				group.llmStatus === "failed"
					? badge("LLM FAILED", "blocked")
					: "";
			const body = group.rows
				.map((row) =>
					row.candidate === null
						? `<div class="timeline-empty">no candidates</div>`
						: renderTimelineEntry(row),
				)
				.join("\n");
			return `<div class="timeline-cycle"><div class="timeline-head"><span class="mono">#${group.cycle}</span>${llmMarker}<span class="muted small">${escapeHtml(tsLocal(group.ts))}</span></div>${body}</div>`;
		})
		.join("\n")}</div>`;
}

function renderTimelineEntry(row: JournalRow): string {
	const candidate = row.candidate;
	if (candidate === null) return "";
	const rationale = candidate.rationale
		? `<p class="timeline-rationale">${escapeHtml(candidate.rationale)}</p>`
		: "";
	const reason = candidate.blockedReason
		? `<div class="sub">${escapeHtml(candidate.blockedReason)}</div>`
		: "";
	return `<div class="timeline-entry"><div class="timeline-entry-head"><span class="timeline-pool">${escapeHtml(candidate.poolName || candidate.pool)}</span>${actionBadge(candidate)}${guardrailBadge(candidate)}${executionText(candidate)}</div>${rationale}${reason}</div>`;
}
```

Note: `renderTimelineEntry` duplicates the `row.candidate === null` guard (defensive — `timelineGroups` rows always carry candidates except empty cycles, which are handled in `renderJournalTimeline`).

In `src/web/theme.ts`, insert after line 396 (`.briefing-tags .muted { margin-left: auto; }`):

```css
.timeline { display: flex; flex-direction: column; gap: 14px; margin: 0 0 16px; }
.timeline-cycle { border: 1px solid var(--line); background: var(--panel); }
.timeline-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.timeline-head .mono { font-size: 11px; font-weight: 700; }
.timeline-head .muted { margin-left: auto; font: 10px monospace; }
.timeline-entry { display: grid; gap: 6px; padding: 12px 14px; border-bottom: 1px solid color-mix(in srgb, var(--line) 55%, transparent); }
.timeline-entry:last-child { border-bottom: 0; }
.timeline-entry-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.timeline-pool { font-size: 12px; font-weight: 600; }
.timeline-rationale { margin: 0; color: var(--foreground); font-size: 11px; line-height: 1.6; }
.timeline-empty { padding: 10px 14px; color: var(--muted); font-size: 11px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/web-agent-page.test.ts`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/web/pages/agent.ts src/web/theme.ts test/web-agent-page.test.ts
git commit -m "feat(web): narrative briefing panel and journal timeline"
```

---

### Task 7: Async agent page with LLM wiring

**Files:**
- Modify: `src/web/pages/agent.ts` (rewrite `agentContent` to `Effect.gen`, use `AppConfig` + `resolveAgentConfigFrom` + `narrativeFor`)

**Interfaces:**
- Consumes: `AppConfig` and `resolveAgentConfigFrom` from `../../services/Config.js`; `narrativeFor` from `../agent-narrative.js`.
- Produces: `agentContent(opts?: { action?: string | null; page?: number }): Effect.Effect<string, never, AppConfig>` — same output contract as before (HTML string or `errorBanner`), now requiring `AppConfig` in context (already provided by `AppLayer` in `startWebServer`, `src/web/server.ts:248`).

- [ ] **Step 1: Write the failing test**

No new unit test — `agentContent`'s effect is exercised through `startWebServer` (covered by `test/web-server-lifecycle.test.ts`, which mocks `AppLayer`). The compile-level contract change is verified by `npm run typecheck`. Verify existing tests still pass:

Run: `npx vitest run test/web-agent-page.test.ts test/web-server-lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 2: Verify typecheck fails on the current sync implementation only after the change (contract check)**

Run: `npm run typecheck`
Expected: PASS before this task's code change (baseline). The new code in Step 3 must keep it passing.

- [ ] **Step 3: Write minimal implementation**

In `src/web/pages/agent.ts`, replace the imports and `agentContent`:

Add imports:

```ts
import { AppConfig, resolveAgentConfigFrom } from "../../services/Config.js";
import { narrativeFor } from "../agent-narrative.js";
```

(Keep `readJournalAll`, `loadState`, `parseJournalFilter` imports; remove nothing else.)

Replace `agentContent` (lines 317-332):

```ts
export const agentContent = (opts?: {
	readonly action?: string | null;
	readonly page?: number;
}): Effect.Effect<string, never, AppConfig> =>
	Effect.gen(function* () {
		try {
			const configService = yield* AppConfig;
			const current = yield* configService.get;
			const llm = resolveAgentConfigFrom(current).llm;
			const journal = readJournalAll();
			const state = loadState();
			const narrative = yield* Effect.promise(() =>
				narrativeFor(journal, state, llm),
			);
			return renderAgent(journal, state, {
				action: parseJournalFilter(opts?.action),
				page: opts?.page ?? 1,
			}, narrative);
		} catch (error) {
			return errorBanner(
				error instanceof Error ? error.message : String(error),
			);
		}
	});
```

Note: `resolveAgentConfigFrom(current).llm` resolves apiKey from `agent.llm.apiKey` or `OPENAI_API_KEY` env (services/Config.ts:143). If neither is set, `llm.apiKey` is `""` and `narrativeFor` takes the fallback path (Task 4) — the page still renders. No route changes needed in `server.ts`: `agentRoute` already `yield* agentContent(...)` inside a `Effect.gen` that runs under `AppLayer`.

- [ ] **Step 4: Run verification**

Run: `npx vitest run test/web-agent-page.test.ts test/web-server-lifecycle.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/pages/agent.ts
git commit -m "feat(web): async agent log page with LLM narrative wiring"
```

---

### Task 8: Full verification

**Files:**
- None.

- [ ] **Step 1: Run full checks**

Run: `npm run check`
Expected: Biome clean.

Run: `npm run typecheck`
Expected: PASS.

Run: `npm test`
Expected: ALL PASS (existing suites + new `agent-narrative` / `agent-narrative-request` / updated `web-agent-page` tests).

- [ ] **Step 2: Manual smoke (optional, requires running bot + LLM config)**

Start the web server with the bot, open `http://127.0.0.1:8080/agent`:
- With `agent.llm.apiKey` configured: LATEST RUN panel shows Indonesian prose + `GENERATED` badge; `.vexis-agent-narrative.json` appears; reload within 10 min shows cached text without new LLM calls (check logs).
- Without apiKey: prose is the deterministic summary + `FALLBACK` badge.
- Journal section shows per-cycle timeline blocks with rationales, blocked reasons, tx links, and `LLM FAILED` markers where applicable; filters + pagination still work.

- [ ] **Step 3: Commit any leftover state-file noise**

`.vexis-agent-narrative.json` is gitignored (Task 3) — nothing to commit.

---

## Self-Review Notes

- Spec coverage: prompt builder (Task 1) ✓, fallback (Task 2) ✓, TTL cache persisted (Task 3) ✓, LLM request + orchestrator (Task 4) ✓, timeline grouping (Task 5) ✓, timeline render + panel + CSS (Task 6) ✓, async wiring + gitignore (Tasks 3, 7) ✓, tests/verification (Tasks 1-8) ✓.
- No placeholders: every task has real code + run commands.
- Type consistency: `NarrativeResult`/`NarrativeCache` defined in Task 3, used in Tasks 4/6/7; `JournalRow.llmStatus` added in Task 5, consumed in Tasks 5/6; `renderAgent` 4th param added in Task 6, used in Task 7; `timelineGroups` produced in Task 5, consumed in Task 6.
