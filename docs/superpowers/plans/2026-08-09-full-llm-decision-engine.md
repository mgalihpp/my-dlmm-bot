# Full-LLM Decision Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hybrid (heuristic + LLM advisory) decision step with the LLM directly deciding `open`/`hold` per candidate pool, skipping the cycle entirely when the LLM fails.

**Architecture:** One decision-step replacement. Screening, risk pre-filter, guardrails (hard blocking layer), and deterministic position sizing stay untouched. The heuristic becomes context in the prompt and candidate selection only. `engine.ts` orchestrates; `decision.ts` gains `validateOpenDecisions` (anti-hallucination); `llm.ts` gains a decision prompt/parser/request. Journal drops `favorability`/`score`; `llmStatus` becomes `"ok" | "failed" | "skipped"`.

**Tech Stack:** TypeScript (strict), Effect, grammY, AI SDK (`ai` + `@ai-sdk/openai-compatible`), Vitest.

## Global Constraints

- ESM-only: all relative imports end in `.js` (e.g. `./state.js`).
- Biome format: tab indent, double quotes, organize imports. Run `npm run format` after edits.
- Verify order: `npm run check && npm run typecheck && npm test`. Tests excluded from tsc.
- No new npm dependencies.
- Spec: `docs/superpowers/specs/2026-08-09-full-llm-decision-engine-design.md`.
- On LLM failure → skip cycle, no trades, journal `llmStatus: "failed"`, Telegram error notification.
- `minCandidate` config field stays valid but is no longer read by the decision path.

---

### Task 1: Add `validateOpenDecisions` to `decision.ts`

**Files:**
- Modify: `src/telegram/agent/decision.ts`
- Test: `test/agent-decision.test.ts`

**Interfaces:**
- Produces:
  - `export type OpenAction = "open" | "hold";`
  - `export interface OpenDecision { pool: string; action: OpenAction; rationale: string }`
  - `export function validateOpenDecisions(candidates: readonly Pick<ScreenedPool, "pool">[], decisions: readonly OpenDecision[]): { decisions: OpenDecision[]; dropped: number }`
- Consumes: `ScreenedPool` (type only, existing `../../domain/screened.js`). Keeps existing `tpslAction` untouched.

- [ ] **Step 1: Write the failing test**

Append to `test/agent-decision.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	tpslAction,
	validateOpenDecisions,
} from "../src/telegram/agent/decision.js";

const candidates = [{ pool: "PoolA" }, { pool: "PoolB" }, { pool: "PoolC" }];

describe("validateOpenDecisions", () => {
	it("keeps known pools in order", () => {
		const { decisions, dropped } = validateOpenDecisions(candidates, [
			{ pool: "PoolA", action: "open", rationale: "r" },
			{ pool: "PoolC", action: "hold", rationale: "h" },
		]);
		expect(decisions).toEqual([
			{ pool: "PoolA", action: "open", rationale: "r" },
			{ pool: "PoolC", action: "hold", rationale: "h" },
		]);
		expect(dropped).toBe(0);
	});

	it("drops unknown pools (anti-hallucination)", () => {
		const { decisions, dropped } = validateOpenDecisions(candidates, [
			{ pool: "Ghost", action: "open", rationale: "hallucinated" },
			{ pool: "PoolB", action: "open", rationale: "ok" },
		]);
		expect(decisions).toEqual([
			{ pool: "PoolB", action: "open", rationale: "ok" },
		]);
		expect(dropped).toBe(1);
	});

	it("keeps first duplicate occurrence, counts rest as dropped", () => {
		const { decisions, dropped } = validateOpenDecisions(candidates, [
			{ pool: "PoolA", action: "open", rationale: "first" },
			{ pool: "PoolA", action: "hold", rationale: "second" },
		]);
		expect(decisions).toEqual([
			{ pool: "PoolA", action: "open", rationale: "first" },
		]);
		expect(dropped).toBe(1);
	});

	it("passes an empty decision list through", () => {
		const { decisions, dropped } = validateOpenDecisions(candidates, []);
		expect(decisions).toEqual([]);
		expect(dropped).toBe(0);
	});
});

describe("tpslAction", () => {
	it("signals sl below stop-loss and tp above take-profit", () => {
		expect(tpslAction(-12, 25, -10)).toBe("sl");
		expect(tpslAction(30, 25, -10)).toBe("tp");
		expect(tpslAction(5, 25, -10)).toBe("hold");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-decision.test.ts`
Expected: FAIL — `validateOpenDecisions` is not exported.

- [ ] **Step 3: Add `validateOpenDecisions` (additive — keep `combineScore`/`decideCandidates` for now)**

In `src/telegram/agent/decision.ts`, add after the existing `decideCandidates`:

```ts
export type OpenAction = "open" | "hold";

export interface OpenDecision {
	pool: string;
	action: OpenAction;
	rationale: string;
}

/** Anti-hallucination gate: only decisions for exact candidate pool ids survive. */
export function validateOpenDecisions(
	candidates: readonly Pick<ScreenedPool, "pool">[],
	decisions: readonly OpenDecision[],
): { decisions: OpenDecision[]; dropped: number } {
	const known = new Set(candidates.map((c) => c.pool));
	const seen = new Set<string>();
	const out: OpenDecision[] = [];
	let dropped = 0;
	for (const d of decisions) {
		if (!known.has(d.pool) || seen.has(d.pool)) {
			dropped += 1;
			continue;
		}
		seen.add(d.pool);
		out.push({ pool: d.pool, action: d.action, rationale: d.rationale });
	}
	return { decisions: out, dropped };
}
```

The file already imports `ScreenedPool` (`import type { ScreenedPool } from "../../domain/screened.js";`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-decision.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/decision.ts test/agent-decision.test.ts
git commit -m "feat(agent): add validateOpenDecisions anti-hallucination gate"
```

---

### Task 2: Add decision prompt, parser, and request to `llm.ts`

**Files:**
- Modify: `src/telegram/agent/llm.ts`
- Test: `test/agent-llm.test.ts`

**Interfaces:**
- Produces:
  - `export interface LlmOpenDecision { pool: string; action: "open" | "hold"; rationale: string }`
  - `export function buildOpenDecisionPrompt(candidates: readonly LlmCandidate[], weightsSummary?: string, portfolioContext?: string): string`
  - `export function parseOpenDecisionResponse(content: string): LlmOpenDecision[] | null` — `null` means malformed JSON (caller skips cycle)
  - `export async function requestOpenDecisions(opts: { cfg: ResolvedAgentConfig; candidates: readonly LlmCandidate[]; weightsSummary?: string; portfolioContext?: string }): Promise<{ decisions: LlmOpenDecision[] | null; failed: boolean }>`
- Consumes: `LlmCandidate` (existing), `ResolvedAgentConfig` (existing import), `createOpenAICompatible`/`generateText` (existing imports).

- [ ] **Step 1: Write the failing test**

Replace the contents of `test/agent-llm.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
	buildOpenDecisionPrompt,
	parseOpenDecisionResponse,
	parsePositionResponse,
} from "../src/telegram/agent/llm.js";

const candidates = [
	{
		pool: "PoolA",
		pair: "AAA/SOL",
		heuristic: 90,
		feeActiveTvlRatio: 0.2,
		organicScore: 95,
		holders: 4000,
		volume: 300000,
	},
];

describe("buildOpenDecisionPrompt", () => {
	it("includes candidates, open/hold instruction and portfolio context", () => {
		const prompt = buildOpenDecisionPrompt(
			candidates,
			undefined,
			"3/5 open positions, deployed 4.5/10 SOL cap",
		);
		expect(prompt).toContain("PoolA");
		expect(prompt).toContain("90");
		expect(prompt).toContain("OPEN");
		expect(prompt).toContain("3/5 open positions");
		expect(prompt).not.toContain("favorability");
	});

	it("appends signal weights summary when provided", () => {
		const prompt = buildOpenDecisionPrompt(
			candidates,
			"Signal weights (Darwinian, learned from PnL):\n- volume: 1.50",
		);
		expect(prompt).toContain("Darwinian");
	});

	it("includes optional risk fields when present", () => {
		const prompt = buildOpenDecisionPrompt([
			{
				pool: "Pool111",
				pair: "FOO/SOL",
				heuristic: 80,
				feeActiveTvlRatio: 0.05,
				organicScore: 70,
				holders: 1000,
				volume: 50000,
				priceVsAthPct: 60,
				rugScore: 1500,
				top10Pct: 40,
			},
		]);
		expect(prompt).toContain("rugScore=1500");
		expect(prompt).toContain("priceVsAthPct=60");
	});
});

describe("parseOpenDecisionResponse", () => {
	it("parses a plain JSON array", () => {
		const out = parseOpenDecisionResponse(
			JSON.stringify([{ pool: "PoolA", action: "open", rationale: "strong" }]),
		);
		expect(out).toEqual([
			{ pool: "PoolA", action: "open", rationale: "strong" },
		]);
	});

	it("strips markdown code fences", () => {
		const body =
			"```json\n" +
			JSON.stringify([{ pool: "PoolA", action: "hold", rationale: "meh" }]) +
			"\n```";
		const out = parseOpenDecisionResponse(body);
		expect(out).toEqual([{ pool: "PoolA", action: "hold", rationale: "meh" }]);
	});

	it("treats invalid action as hold and skips missing pool", () => {
		const out = parseOpenDecisionResponse(
			JSON.stringify([
				{ pool: "PoolA", action: "sell", rationale: "x" },
				{ pool: "PoolB", action: "open", rationale: "y" },
				{ action: "open" },
			]),
		);
		expect(out).toEqual([
			{ pool: "PoolA", action: "hold", rationale: "x" },
			{ pool: "PoolB", action: "open", rationale: "y" },
		]);
	});

	it("accepts an empty array (LLM said open nothing)", () => {
		expect(parseOpenDecisionResponse("[]")).toEqual([]);
	});

	it("accepts an object with a decisions key", () => {
		const out = parseOpenDecisionResponse(
			JSON.stringify({
				decisions: [{ pool: "PoolA", action: "open", rationale: "r" }],
			}),
		);
		expect(out).toEqual([{ pool: "PoolA", action: "open", rationale: "r" }]);
	});

	it("returns null on garbage (malformed → skip cycle)", () => {
		expect(parseOpenDecisionResponse("not json at all")).toBeNull();
		expect(parseOpenDecisionResponse('{"foo":1}')).toBeNull();
	});
});

describe("parsePositionResponse", () => {
	it("parses valid close and hold decisions", () => {
		const out = parsePositionResponse(
			'[{"pool":"P1","action":"close","rationale":"OOR, losing fees"},{"pool":"P2","action":"hold","rationale":"wait"}]',
		);
		expect(out).toEqual([
			{ pool: "P1", action: "close", rationale: "OOR, losing fees" },
			{ pool: "P2", action: "hold", rationale: "wait" },
		]);
	});

	it("treats invalid action as hold", () => {
		const out = parsePositionResponse(
			'[{"pool":"P1","action":"sell","rationale":"x"}]',
		);
		expect(out[0].action).toBe("hold");
	});

	it("ignores empty pool and malformed responses", () => {
		expect(parsePositionResponse('[{"pool":"","action":"close"}]')).toEqual([]);
		expect(parsePositionResponse("not json")).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-llm.test.ts`
Expected: FAIL — `buildOpenDecisionPrompt` and `parseOpenDecisionResponse` are not exported.

- [ ] **Step 3: Add the three new functions (additive — keep old `buildPrompt`/`parseLlmResponse`/`requestSignals` for now)**

In `src/telegram/agent/llm.ts`, add after `requestSignals`:

```ts
export interface LlmOpenDecision {
	pool: string;
	action: "open" | "hold";
	rationale: string;
}

export function buildOpenDecisionPrompt(
	candidates: readonly LlmCandidate[],
	weightsSummary?: string,
	portfolioContext?: string,
): string {
	const table = candidates
		.map(
			(c) =>
				`- pool=${c.pool} pair=${c.pair} heuristic=${c.heuristic} feeTvlRatio=${c.feeActiveTvlRatio.toFixed(4)} organic=${c.organicScore} holders=${c.holders} volume=${c.volume}${c.priceVsAthPct != null ? ` priceVsAthPct=${c.priceVsAthPct}` : ""}${c.rugScore != null ? ` rugScore=${c.rugScore}` : ""}${c.top10Pct != null ? ` top10Pct=${c.top10Pct}` : ""}${c.bundlePct != null ? ` bundlePct=${c.bundlePct}` : ""}${c.botHoldersPct != null ? ` botHoldersPct=${c.botHoldersPct}` : ""}${c.globalFeesSol != null ? ` globalFeesSol=${c.globalFeesSol}` : ""}${c.activePositions != null ? ` activePositions=${c.activePositions}` : ""}`,
		)
		.join("\n");
	return [
		"You are a portfolio manager for a DLMM liquidity bot. Candidate pools below passed deterministic screening.",
		"Decide for EACH whether to OPEN a new position now or HOLD.",
		"- OPEN = strong fee potential, acceptable risk, fits portfolio context",
		"- HOLD = wait or avoid",
		"Use the heuristic score as context, not the only factor. Weigh risk fields.",
		'Reply with a JSON array only, never markdown: [{"pool":"<exact pool id>","action":"open|hold","rationale":"..."}]',
		"",
		"Candidates:",
		table,
		...(weightsSummary ? ["", weightsSummary] : []),
		...(portfolioContext ? ["", portfolioContext] : []),
	].join("\n");
}

/** Returns null when the body is not parseable as a JSON array — caller skips the cycle. */
export function parseOpenDecisionResponse(
	content: string,
): LlmOpenDecision[] | null {
	const cleaned = content
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "");
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		return null;
	}
	const arr = Array.isArray(parsed)
		? parsed
		: (parsed as { decisions?: unknown }).decisions;
	if (!Array.isArray(arr)) return null;
	const out: LlmOpenDecision[] = [];
	for (const item of arr) {
		const o = item as { pool?: unknown; action?: unknown; rationale?: unknown };
		if (typeof o.pool !== "string" || o.pool === "") continue;
		out.push({
			pool: o.pool,
			action: o.action === "open" ? "open" : "hold",
			rationale: typeof o.rationale === "string" ? o.rationale : "",
		});
	}
	return out;
}

export async function requestOpenDecisions(opts: {
	cfg: ResolvedAgentConfig;
	candidates: readonly LlmCandidate[];
	weightsSummary?: string;
	portfolioContext?: string;
}): Promise<{ decisions: LlmOpenDecision[] | null; failed: boolean }> {
	const { cfg } = opts;
	if (!cfg.llm.apiKey) return { decisions: null, failed: true };
	// no candidates is a normal state, not an LLM failure
	if (opts.candidates.length === 0) return { decisions: [], failed: false };
	const provider = createOpenAICompatible({
		name: "vexis-llm",
		baseURL: cfg.llm.baseUrl,
		apiKey: cfg.llm.apiKey,
	});
	try {
		const { text } = await generateText({
			model: provider(cfg.llm.model),
			messages: [
				{
					role: "user",
					content: buildOpenDecisionPrompt(
						opts.candidates,
						opts.weightsSummary,
						opts.portfolioContext,
					),
				},
			],
			temperature: 0,
			maxRetries: 1,
			timeout: cfg.llm.timeoutMs,
		});
		if (!text) return { decisions: null, failed: true };
		const decisions = parseOpenDecisionResponse(text);
		if (decisions === null) return { decisions: null, failed: true };
		return { decisions, failed: false };
	} catch (e) {
		// timeout / network: skip cycle, no trades
		console.error(
			"[agent] LLM request failed:",
			e instanceof Error ? e.message : String(e),
		);
		return { decisions: null, failed: true };
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-llm.test.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/llm.ts test/agent-llm.test.ts
git commit -m "feat(agent): add LLM open/hold decision prompt, parser, request"
```

---

### Task 3: Drop `favorability`/`score` from journal schema

**Files:**
- Modify: `src/telegram/agent/journal.ts`
- Modify: `src/telegram/agent/engine.ts` (three JournalCandidate construction sites)
- Modify: `test/agent-format.test.ts`, `test/agent-store.test.ts`, `test/agent-stats.test.ts` (fixtures)

**Interfaces:**
- Consumes: `JournalCandidate` now lacks `favorability` and `score`. `AgentJournalEntry` unchanged otherwise.
- Produces: nothing new.

- [ ] **Step 1: Update the schema**

In `src/telegram/agent/journal.ts`, delete two lines from `JournalCandidate`:

```ts
export interface JournalCandidate {
	pool: string;
	poolName: string;
	heuristicScore: number;
	rationale: string | null;
	action: JournalAction;
	guardrail: "pass" | "blocked";
	blockedReason: string | null;
	execution: "ok" | "failed" | null;
	txSignature: string | null;
}
```

(Removed: `favorability: number | null;` and `score: number;`.)

- [ ] **Step 2: Update the three construction sites in `engine.ts`**

In `src/telegram/agent/engine.ts`:

1. TP/SL entry (~lines 420-432): delete `favorability: null,` and `score: 0,` lines from the candidate object.
2. OOR base (~lines 500-512): delete `favorability: null,` and `score: 0,`.
3. Screening decision-loop base (~lines 725-737): delete `favorability: d.favorability,` and `score: d.score,`.

- [ ] **Step 3: Update test fixtures**

`test/agent-format.test.ts`:
- Lines ~128-130: delete `favorability: 0.5,` and `score: 81,`.
- Lines ~276-278: delete `favorability: 0.5,` and `score: 81,`.

`test/agent-store.test.ts`:
- Lines ~39-41: delete `favorability: 0.5,` and `score: 91,`.

`test/agent-stats.test.ts`:
- Four candidate fixtures (~lines 47-49, 60-62, 73-75, 86-88): delete each `favorability: ...` and `score: ...` pair.

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS (type-only test fixtures excluded from tsc but run by vitest; runtime assertions unaffected).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/telegram/agent/journal.ts src/telegram/agent/engine.ts test/agent-format.test.ts test/agent-store.test.ts test/agent-stats.test.ts
git commit -m "refactor(agent): drop favorability and score from journal schema"
```

---

### Task 4: Rework `llmStatus` and `formatCycleSummary`

**Files:**
- Modify: `src/telegram/agent/state.ts`
- Modify: `src/telegram/agent/journal.ts`
- Modify: `src/telegram/agent/format.ts`
- Modify: `src/telegram/agent/engine.ts` (summary call site)
- Modify: `test/agent-format.test.ts`, `test/agent-store.test.ts`

**Interfaces:**
- Produces: `LlmStatus = "ok" | "failed" | "skipped"` (was `"ok" | "degraded" | "skipped"`).
- Consumes: `formatCycleSummary(entries, llmStatus: LlmStatus, cooldowns, nowMs)` (second param was `degraded: boolean`).

- [ ] **Step 1: Update `state.ts`**

In `src/telegram/agent/state.ts` line 4:

```ts
export type LlmStatus = "ok" | "failed" | "skipped";
```

- [ ] **Step 2: Update `journal.ts` to use the shared type**

In `src/telegram/agent/journal.ts`, add the import and update the field:

```ts
import type { LlmStatus } from "./state.js";
```

and change `AgentJournalEntry`:

```ts
export interface AgentJournalEntry {
	ts: string;
	cycle: number;
	llmStatus: LlmStatus;
	candidates: JournalCandidate[];
}
```

- [ ] **Step 3: Update `format.ts`**

- Add `LlmStatus` to the existing `./state.js` import (line 14):
  `import type { AgentCooldown, AgentState, LlmStatus } from "./state.js";`
- Change `formatCycleSummary` signature (line 110-115):

```ts
export function formatCycleSummary(
	entries: readonly AgentJournalEntry[],
	llmStatus: LlmStatus,
	cooldowns: readonly AgentCooldown[] = [],
	nowMs: number = Date.now(),
): string {
```

- Replace the degraded line (line 127):

```ts
	if (llmStatus === "failed") lines.push("❌ LLM failed — cycle skipped");
	else if (llmStatus === "skipped") lines.push("— no LLM signal (skipped)");
```

- [ ] **Step 4: Update the summary call site in `engine.ts`**

At line ~957-961, pass `journal.llmStatus` instead of the old `degraded` variable:

```ts
	const summary = formatCycleSummary(
		readJournal(1),
		journal.llmStatus,
		rt.state.cooldowns,
	);
```

- [ ] **Step 5: Update tests**

`test/agent-format.test.ts`:
- Line ~118: rename test `"renders blocks and degraded"` → `"renders blocks"`.
- Line ~139: `formatCycleSummary([entry], false)` → `formatCycleSummary([entry], "ok")`.

`test/agent-store.test.ts`:
- Lines ~33 and ~72: `llmStatus: "degraded"` → `llmStatus: "failed"`.

- [ ] **Step 6: Run check, typecheck, test**

Run: `npm run check && npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/telegram/agent/state.ts src/telegram/agent/journal.ts src/telegram/agent/format.ts src/telegram/agent/engine.ts test/agent-format.test.ts test/agent-store.test.ts
git commit -m "refactor(agent): llmStatus ok/failed/skipped, summary takes status"
```

---

### Task 5: Rewire the screening decision step in `engine.ts` to full-LLM

**Files:**
- Modify: `src/telegram/agent/engine.ts` (lines ~21, ~49-53, ~661-714, ~724-967)

**Interfaces:**
- Consumes: `requestOpenDecisions` (Task 2), `validateOpenDecisions`, `OpenDecision` (Task 1), `formatError`, `notify` (both exist in engine.ts imports).
- Produces: new evaluatePlans decision flow; loop variable `d: OpenDecision` with `pool: ScreenedPool` looked up via `poolByAddr`.

- [ ] **Step 1: Update imports**

Line 21:
```ts
import { tpslAction, validateOpenDecisions } from "./decision.js";
```

(`OpenDecision` is not named in engine.ts — the loop infers it from `validated`, so importing the type would trip `noUnusedLocals`.)

Lines 49-53: replace `requestSignals` with `requestOpenDecisions`:
```ts
import {
	type LlmCandidate,
	type OorPosition,
	requestOpenDecisions,
	requestPositionDecisions,
} from "./llm.js";
```

- [ ] **Step 2: Replace the decision-setup block (lines ~661-714)**

Replace from `const ranked = rankPools(...)` through `const decisions = decideCandidates({...});` with:

```ts
	const ranked = rankPools(candidatePools, {
		// heuristic selects WHICH pools the LLM sees; it does not gate the decision
		minCandidate: 0,
		maxCandidates: cfg.maxCandidates,
		weights,
	});
	const llmCandidates: LlmCandidate[] = ranked.map((p) => ({
		pool: p.pool,
		pair: `${p.baseSymbol}/${p.quoteSymbol}`,
		heuristic: heuristicScore(p, weights),
		feeActiveTvlRatio: p.feeActiveTvlRatio,
		organicScore: p.organicScore,
		holders: p.holders,
		volume: p.volume,
		priceVsAthPct: p.priceVsAthPct ?? null,
		rugScore: p.rugScore ?? null,
		top10Pct: p.top10Pct ?? null,
		bundlePct: p.bundlePct ?? null,
		botHoldersPct: p.botHoldersPct ?? null,
		globalFeesSol: p.globalFeesSol ?? null,
		activePositions: p.activePositions,
	}));
	liveLines.push(`🧠 LLM: thinking...`);
	await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
	const portfolioContext = `${openPositions}/${cfg.maxOpenPositions} open positions, deployed ${deployedSol.toFixed(2)}/${cfg.maxTotalSol} SOL cap`;
	const { decisions: rawDecisions, failed } = await requestOpenDecisions({
		cfg,
		candidates: llmCandidates,
		weightsSummary: weightsSummary(weights),
		portfolioContext,
	});
	journal.llmStatus =
		llmCandidates.length === 0 ? "skipped" : failed ? "failed" : "ok";
	// `rawDecisions` is `LlmOpenDecision[] | null`; null only pairs with failed.
	// Narrowing on `failed || rawDecisions === null` lets TS treat it as non-null below.
	if (failed || rawDecisions === null) {
		logError("LLM: request failed — cycle skipped");
		liveLines[liveLines.length - 1] = "❌ LLM failed — cycle skipped";
		await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
		rt.state.llmStatus = "failed";
		appendJournal(journal);
		saveState(rt.state);
		await notify(
			bot,
			chatId,
			cfg.notifLevel,
			"error",
			formatError(
				"LLM decision",
				new Error("LLM request failed — cycle skipped"),
			),
		);
		return;
	}
	logInfo(
		`LLM: ${llmCandidates.length} candidates → ${rawDecisions.length} decisions`,
	);
	for (const d of rawDecisions) {
		logInfo(`llm ${d.pool}: ${d.action} — ${d.rationale}`);
	}
	liveLines[liveLines.length - 1] =
		`🧠 LLM: ${llmCandidates.length} candidates → ${rawDecisions.length} decisions`;
	await liveSend(bot, chatId, live, formatLive(cycle, liveLines));

	const { decisions: validated, dropped } = validateOpenDecisions(
		ranked,
		rawDecisions,
	);
	if (dropped > 0) {
		logInfo(`LLM: ${dropped} decision(s) ignored (unknown pool or duplicate)`);
	}
	const poolByAddr = new Map(ranked.map((p) => [p.pool, p] as const));
```

- [ ] **Step 3: Rewrite the decision loop (lines ~724-952)**

Replace `for (const d of decisions) {` and the `base` construction plus every `d.pool.*` / `d.score` reference with:

```ts
	for (const d of validated) {
		const pool = poolByAddr.get(d.pool);
		if (!pool) continue; // defensive — validation already filtered
		const h = heuristicScore(pool, weights);
		const base: JournalCandidate = {
			pool: pool.pool,
			poolName: pool.name,
			heuristicScore: h,
			rationale: d.rationale,
			action: d.action,
			guardrail: "pass",
			blockedReason: null,
			execution: null,
			txSignature: null,
		};
		if (d.action === "hold") {
			journal.candidates.push(base);
			logInfo(`decide: ${pool.name} heuristic ${h} → hold`);
			await liveDecision(`➖ ${pool.name} hold (heuristic ${h})`);
			continue;
		}
```

Then, throughout the rest of the loop body (the dup/cooldown/risk/guard/budget/execute branches), mechanically replace:
- `d.pool.pool` → `pool.pool`
- `d.pool.name` → `pool.name`
- `d.pool.baseMint` → `pool.baseMint`
- `d.pool` (bare, e.g. `checkRisks({ pool: d.pool, ... })`, `signalSnapshot(d.pool)`, `registerAction(d.pool.pool, ...)`) → `pool`
- `score ${d.score}` → `heuristic ${h}` (in all `logInfo` and `liveDecision` strings)

Keep `d.rationale` and `d.action` as-is. The executor body (resolveCreatePreset → buildCreateParams → `dlmm.createPosition` → push plan/execution → journal `execution: "ok"` → notify) stays identical except for the `pool.` renames above.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run full verify**

Run: `npm run check && npm run typecheck && npm test`
Expected: all PASS. Note `combineScore`/`decideCandidates`/`requestSignals`/`buildPrompt`/`parseLlmResponse` still exist but are now unused — Task 6 removes them.

- [ ] **Step 6: Commit**

```bash
git add src/telegram/agent/engine.ts
git commit -m "feat(agent): LLM decides open/hold; skip cycle on LLM failure"
```

---

### Task 6: Remove dead advisory code and rewrite its tests

**Files:**
- Modify: `src/telegram/agent/decision.ts`
- Modify: `src/telegram/agent/llm.ts`
- Modify: `test/agent-decision.test.ts`, `test/agent-llm.test.ts`

**Interfaces:**
- Consumes: nothing (all dead code). Keeps: `validateOpenDecisions`, `OpenDecision`, `OpenAction`, `tpslAction`; `LlmCandidate`, `LlmOpenDecision`, `buildOpenDecisionPrompt`, `parseOpenDecisionResponse`, `requestOpenDecisions`, OOR functions.

- [ ] **Step 1: Slim `decision.ts`**

Replace the whole file with:

```ts
import type { ScreenedPool } from "../../domain/screened.js";

export type OpenAction = "open" | "hold";

export interface OpenDecision {
	pool: string;
	action: OpenAction;
	rationale: string;
}

/** Anti-hallucination gate: only decisions for exact candidate pool ids survive. */
export function validateOpenDecisions(
	candidates: readonly Pick<ScreenedPool, "pool">[],
	decisions: readonly OpenDecision[],
): { decisions: OpenDecision[]; dropped: number } {
	const known = new Set(candidates.map((c) => c.pool));
	const seen = new Set<string>();
	const out: OpenDecision[] = [];
	let dropped = 0;
	for (const d of decisions) {
		if (!known.has(d.pool) || seen.has(d.pool)) {
			dropped += 1;
			continue;
		}
		seen.add(d.pool);
		out.push({ pool: d.pool, action: d.action, rationale: d.rationale });
	}
	return { decisions: out, dropped };
}

export function tpslAction(
	pnlPct: number,
	tpPct: number,
	slPct: number,
): "tp" | "sl" | "hold" {
	if (tpPct != null && pnlPct >= tpPct) return "tp";
	if (slPct != null && pnlPct <= slPct) return "sl";
	return "hold";
}
```

(Removed: `AgentAction`, `CandidateDecision`, `combineScore`, `decideCandidates`, and the `heuristicScore`/`LlmSignal` imports.)

- [ ] **Step 2: Slim `llm.ts`**

Remove: `LlmSignal` interface, `clampFav`, `buildPrompt`, `parseLlmResponse`, `requestSignals`. Keep everything else (including `LlmCandidate`, OOR types/functions, and the Task 2 additions).

- [ ] **Step 3: Rewrite `test/agent-decision.test.ts`**

Replace the file with the Task 1 test content (the `validateOpenDecisions` + `tpslAction` describes only — no `combineScore`/`decideCandidates`).

- [ ] **Step 4: `test/agent-llm.test.ts` already matches**

The file from Task 2 Step 1 already imports only the kept functions. Verify no references to `buildPrompt`, `parseLlmResponse`, or `favorability` remain.

- [ ] **Step 5: Run full verify**

Run: `npm run check && npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/telegram/agent/decision.ts src/telegram/agent/llm.ts test/agent-decision.test.ts test/agent-llm.test.ts
git commit -m "refactor(agent): remove heuristic-merge advisory layer"
```

---

### Task 7: Deprecate `minCandidate` in config

**Files:**
- Modify: `src/domain/config.ts`

- [ ] **Step 1: Add deprecation comment**

In `src/domain/config.ts`, on the `AgentConfig` field (line ~109):

```ts
	/** @deprecated No longer gates opening — the LLM decides. Kept for config-file compatibility. */
	minCandidate?: number;
```

Leave `ResolvedAgentConfig.minCandidate` (in `src/services/Config.ts`) as-is — it stays resolved but unused by the decision path.

- [ ] **Step 2: Run check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/domain/config.ts
git commit -m "docs(agent): mark minCandidate deprecated"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full verify**

Run: `npm run check && npm run typecheck && npm test`
Expected: all PASS with no warnings.

- [ ] **Step 2: Confirm no stale references**

Run: `rg -n "favorability|degraded|requestSignals|buildPrompt|parseLlmResponse|combineScore|decideCandidates" src test`
Expected: no matches (except possibly `src/telegram/agent/llm.ts` OOR code which never used those names — confirm none).

- [ ] **Step 3: Commit any stragglers**

```bash
git add -A
git commit -m "chore(agent): full-LLM decision engine complete" --allow-empty-message
```

(If Step 2 is clean, skip this commit — Task 6/7 commits already captured everything.)
