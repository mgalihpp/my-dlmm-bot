# Agent OOR Decisions + Pool/Token Cooldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect out-of-range DLMM positions and let the LLM decide hold/close (auto close+zap-out), add a per-pool/per-base-token cooldown, split agent scheduling into a 60s TP/SL fast path and an `intervalMinutes` full path, and show a "thinking" indicator while the LLM runs.

**Architecture:** The 60s event fiber runs only TP/SL checks; the `intervalMinutes` fiber runs the full cycle (TP/SL + OOR LLM decision + screening + LLM + opens). OOR positions are collected in `evaluateTpSl`, decided by a new `requestPositionDecisions` LLM call, and closed via the existing `zap.closeAndZapOut`. A cooldown list persisted in agent state (pool + baseMint) is applied after screening, before ranking/LLM, and recorded on close/block.

**Tech Stack:** TypeScript (ESM, strict), Effect, grammY, vitest, biome.

## Global Constraints

- ESM-only — imports use `.js` extensions: `import { x } from "./foo.js"`.
- Biome: tab indent, double quotes. Run `npm run check` (biome check) before committing.
- TypeScript strict, no unused locals/params. Tests are excluded from `tsc`.
- Verify order: `npm run check && npm run typecheck && npm test`.
- Tagged errors in `src/errors.ts` (`Data.TaggedError`), never throw for expected paths.
- State persists to gitignored JSON; `loadState`/`saveState` in `src/telegram/agent/state.ts`.
- Do not touch the 9 uncommitted files from the MarkdownV2 escaping work (decision/engine/format/heuristic/llm/signalWeights + 3 test files) — leave their working-tree state intact; only edit the files listed in each task.
- Do not reorder imports manually — biome `organize imports` handles it via `npm run check`.

---

### Task 1: Config `poolCooldownMs`

**Files:**
- Modify: `src/domain/config.ts:111` (inside `AgentConfig`, after `txCooldownMs`)
- Modify: `src/services/Config.ts:125` (interface `ResolvedAgentConfig`, after `txCooldownMs`) and `:149` (in `resolveAgentConfigFrom`)
- Test: `test/agent-config.test.ts`

**Interfaces:**
- Produces: `ResolvedAgentConfig.poolCooldownMs: number` (default `24 * 3_600_000`), `AgentConfig.poolCooldownMs?: number`.

- [ ] **Step 1: Write the failing test**

`test/agent-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveAgentConfigFrom } from "../src/services/Config.js";

describe("resolveAgentConfigFrom", () => {
	it("defaults poolCooldownMs to 24h and honors override", () => {
		expect(resolveAgentConfigFrom({}).poolCooldownMs).toBe(24 * 3_600_000);
		expect(
			resolveAgentConfigFrom({ agent: { poolCooldownMs: 60_000 } })
				.poolCooldownMs,
		).toBe(60_000);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-config.test.ts`
Expected: FAIL — `poolCooldownMs` does not exist on `ResolvedAgentConfig`.

- [ ] **Step 3: Add the config fields**

`src/domain/config.ts`, in `AgentConfig` after `txCooldownMs?: number;`:

```ts
	poolCooldownMs?: number;
```

`src/services/Config.ts`, in `ResolvedAgentConfig` after `txCooldownMs: number;`:

```ts
	poolCooldownMs: number;
```

`src/services/Config.ts`, in `resolveAgentConfigFrom` after the `txCooldownMs` line:

```ts
		poolCooldownMs: a.poolCooldownMs ?? 24 * 3_600_000,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/config.ts src/services/Config.ts test/agent-config.test.ts
git commit -m "feat(agent): add poolCooldownMs config"
```

---

### Task 2: State — `cooldowns` + `AgentCooldown`

**Files:**
- Modify: `src/telegram/agent/state.ts`
- Modify: `test/agent-store.test.ts:59-77`

**Interfaces:**
- Produces: `interface AgentCooldown { pool: string; poolName: string; baseMint: string | null; until: string; reason: string }` and `AgentState.cooldowns: AgentCooldown[]` (default `[]`).

- [ ] **Step 1: Write the failing test**

Append to the `state` describe block in `test/agent-store.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-store.test.ts`
Expected: FAIL — `cooldowns` is missing on `AgentState`.

- [ ] **Step 3: Add the type and field**

`src/telegram/agent/state.ts`, after the `AgentExecution` interface:

```ts
export interface AgentCooldown {
	pool: string;
	poolName: string;
	baseMint: string | null;
	until: string;
	reason: string;
}
```

Add `cooldowns: AgentCooldown[];` to `AgentState`, and `cooldowns: [],` to `EMPTY`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/state.ts test/agent-store.test.ts
git commit -m "feat(agent): persist pool cooldowns in agent state"
```

---

### Task 3: Cooldown helpers in guardrails

**Files:**
- Modify: `src/telegram/agent/guardrails.ts`
- Test: `test/agent-guardrails.test.ts`

**Interfaces:**
- Consumes: `AgentCooldown` (Task 2), `ScreenedPool` from `../../domain/screened.js`.
- Produces:
  - `filterCooldown(pools: readonly ScreenedPool[], cooldowns: readonly AgentCooldown[], nowMs: number): { pools: ScreenedPool[]; skipped: number }`
  - `checkPoolCooldown(pool: string, baseMint: string | null, cooldowns: readonly AgentCooldown[], nowMs: number): GuardOk`
  - `recordCooldown(cooldowns: readonly AgentCooldown[], input: { pool: string; poolName: string; baseMint: string | null; reason: string }, durationMs: number, nowMs: number): AgentCooldown[]`

- [ ] **Step 1: Write the failing test**

`test/agent-guardrails.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ScreenedPool } from "../src/domain/screened.js";
import type { AgentCooldown } from "../src/telegram/agent/state.js";
import {
	checkPoolCooldown,
	filterCooldown,
	recordCooldown,
} from "../src/telegram/agent/guardrails.js";

const pool = (over: Partial<ScreenedPool> = {}): ScreenedPool =>
	({
		pool: "P1",
		name: "A/SOL",
		baseSymbol: "A",
		baseMint: "mx",
		quoteSymbol: "SOL",
		tvl: 1,
		activeTvl: 1,
		mcap: 1,
		holders: 1,
		organicScore: 1,
		quoteOrganic: 1,
		feeActiveTvlRatio: 1,
		volatility: 1,
		binStep: 1,
		baseFeePct: 0,
		volume: 1,
		fee: 1,
		activePositions: 1,
		openPositions: 1,
		tokenAgeHours: 1,
		score: 0,
		price: 1,
		priceChangePct: null,
		volumeChangePct: null,
		fromAthPct: null,
		tokenXAddress: "mx",
		rugScore: null,
		...over,
	}) as ScreenedPool;

const NOW = 1_000_000;
const cd = (over: Partial<AgentCooldown> = {}): AgentCooldown => ({
	pool: "P1",
	poolName: "A/SOL",
	baseMint: "mx",
	until: new Date(NOW + 60_000).toISOString(),
	reason: "test",
	...over,
});

describe("filterCooldown", () => {
	it("skips pools matching pool or baseMint", () => {
		const { pools, skipped } = filterCooldown(
			[pool({ pool: "P1", baseMint: "mx" }), pool({ pool: "P2", baseMint: "other" })],
			[cd()],
			NOW,
		);
		expect(skipped).toBe(1);
		expect(pools.map((p) => p.pool)).toEqual(["P2"]);
	});

	it("ignores expired entries", () => {
		const { skipped } = filterCooldown(
			[pool()],
			[cd({ until: new Date(NOW - 1).toISOString() })],
			NOW,
		);
		expect(skipped).toBe(0);
	});

	it("null baseMint only matches exact pool", () => {
		const { skipped } = filterCooldown(
			[pool({ pool: "P2", baseMint: "mx" })],
			[cd({ baseMint: null })],
			NOW,
		);
		expect(skipped).toBe(0);
	});
});

describe("checkPoolCooldown", () => {
	it("blocks active pool, passes expired and unknown", () => {
		expect(checkPoolCooldown("P1", "mx", [cd()], NOW).ok).toBe(false);
		expect(
			checkPoolCooldown("P1", "mx", [cd({ until: new Date(NOW - 1).toISOString() })], NOW)
				.ok,
		).toBe(true);
		expect(checkPoolCooldown("P9", "mx", [cd()], NOW).ok).toBe(true);
	});
});

describe("recordCooldown", () => {
	it("adds an entry and prunes expired ones", () => {
		const expired = cd({
			pool: "OLD",
			until: new Date(NOW - 1).toISOString(),
		});
		const out = recordCooldown(
			[expired],
			{ pool: "P2", poolName: "B/SOL", baseMint: "other", reason: "closed" },
			60_000,
			NOW,
		);
		expect(out).toHaveLength(1);
		expect(out[0].pool).toBe("P2");
		expect(out[0].reason).toBe("closed");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-guardrails.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement the helpers**

`src/telegram/agent/guardrails.ts`, add imports:

```ts
import type { ScreenedPool } from "../../domain/screened.js";
import type { AgentCooldown } from "./state.js";
```

Append to the file:

```ts
/** Pools matching an active cooldown (by pool address or baseMint) are skipped before ranking/LLM. */
export function filterCooldown(
	pools: readonly ScreenedPool[],
	cooldowns: readonly AgentCooldown[],
	nowMs: number,
): { pools: ScreenedPool[]; skipped: number } {
	const active = cooldowns.filter((c) => Date.parse(c.until) > nowMs);
	const out: ScreenedPool[] = [];
	let skipped = 0;
	for (const p of pools) {
		const blocked = active.some(
			(c) =>
				c.pool === p.pool ||
				(c.baseMint != null && c.baseMint === p.baseMint),
		);
		if (blocked) skipped++;
		else out.push(p);
	}
	return { pools: out, skipped };
}

export function checkPoolCooldown(
	pool: string,
	baseMint: string | null,
	cooldowns: readonly AgentCooldown[],
	nowMs: number,
): GuardOk {
	for (const c of cooldowns) {
		if (Date.parse(c.until) <= nowMs) continue;
		if (c.pool === pool || (c.baseMint != null && c.baseMint === baseMint)) {
			return { ok: false, reason: `cooldown until ${c.until} (${c.reason})` };
		}
	}
	return { ok: true, reason: null };
}

/** Returns a new list with the entry added and expired entries pruned. */
export function recordCooldown(
	cooldowns: readonly AgentCooldown[],
	input: {
		pool: string;
		poolName: string;
		baseMint: string | null;
		reason: string;
	},
	durationMs: number,
	nowMs: number,
): AgentCooldown[] {
	const active = cooldowns.filter((c) => Date.parse(c.until) > nowMs);
	return [
		...active,
		{
			pool: input.pool,
			poolName: input.poolName,
			baseMint: input.baseMint,
			until: new Date(nowMs + durationMs).toISOString(),
			reason: input.reason,
		},
	];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-guardrails.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/guardrails.ts test/agent-guardrails.test.ts
git commit -m "feat(agent): pool/token cooldown helpers"
```

---

### Task 4: Journal — `"close"` action

**Files:**
- Modify: `src/telegram/agent/journal.ts:4`

- [ ] **Step 1: Extend the action union**

`src/telegram/agent/journal.ts`:

```ts
export type JournalAction = "open" | "hold" | "tp" | "sl" | "close";
```

- [ ] **Step 2: Verify nothing type-breaks**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/telegram/agent/journal.ts
git commit -m "feat(agent): add close journal action"
```

---

### Task 5: LLM — OOR position decisions

**Files:**
- Modify: `src/telegram/agent/llm.ts`
- Test: `test/agent-llm.test.ts`

**Interfaces:**
- Produces:
  - `type PositionAction = "hold" | "close"`
  - `interface OorPosition { pool: string; poolName: string; pnlPct: number; minPrice: string; maxPrice: string; poolActivePrice: string | null }`
  - `interface PositionDecision { pool: string; action: PositionAction; rationale: string }`
  - `buildPositionPrompt(positions: readonly OorPosition[]): string`
  - `parsePositionResponse(content: string): PositionDecision[]`
  - `requestPositionDecisions(opts: { cfg: ResolvedAgentConfig; positions: readonly OorPosition[] }): Promise<{ decisions: PositionDecision[]; degraded: boolean }>`

- [ ] **Step 1: Write the failing test**

`test/agent-llm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsePositionResponse } from "../src/telegram/agent/llm.js";

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
Expected: FAIL — `parsePositionResponse` not exported.

- [ ] **Step 3: Implement the OOR types + functions**

`src/telegram/agent/llm.ts`, after the existing `LlmSignal` interface:

```ts
export type PositionAction = "hold" | "close";

export interface OorPosition {
	pool: string;
	poolName: string;
	pnlPct: number;
	minPrice: string;
	maxPrice: string;
	poolActivePrice: string | null;
}

export interface PositionDecision {
	pool: string;
	action: PositionAction;
	rationale: string;
}
```

Append to the file:

```ts
export function buildPositionPrompt(positions: readonly OorPosition[]): string {
	const table = positions
		.map(
			(p) =>
				`- pool=${p.pool} pair=${p.poolName} pnlPct=${p.pnlPct} minPrice=${p.minPrice} maxPrice=${p.maxPrice}${p.poolActivePrice != null ? ` poolActivePrice=${p.poolActivePrice}` : ""}`,
		)
		.join("\n");
	return [
		"You manage DLMM liquidity positions. Each position below is out of range — its bin range no longer covers the pool's active price, so it earns no fees.",
		"Decide for each position: `hold` (keep, price may re-enter range) or `close` (zap out to WSOL). Weigh pnlPct and how far the active price sits from the range.",
		'Reply with a JSON array only, never markdown: [{"pool":"<exact pool id>","action":"hold|close","rationale":"..."}]',
		"",
		"Positions:",
		table,
	].join("\n");
}

export function parsePositionResponse(content: string): PositionDecision[] {
	const cleaned = content
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/, "");
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		return [];
	}
	const arr = Array.isArray(parsed)
		? parsed
		: (parsed as { decisions?: unknown }).decisions;
	if (!Array.isArray(arr)) return [];
	const out: PositionDecision[] = [];
	for (const item of arr) {
		const o = item as { pool?: unknown; action?: unknown; rationale?: unknown };
		if (typeof o.pool !== "string" || o.pool === "") continue;
		out.push({
			pool: o.pool,
			action: o.action === "close" ? "close" : "hold",
			rationale: typeof o.rationale === "string" ? o.rationale : "",
		});
	}
	return out;
}

export async function requestPositionDecisions(opts: {
	cfg: ResolvedAgentConfig;
	positions: readonly OorPosition[];
}): Promise<{ decisions: PositionDecision[]; degraded: boolean }> {
	const { cfg } = opts;
	if (!cfg.llm.apiKey) return { decisions: [], degraded: true };
	if (opts.positions.length === 0) return { decisions: [], degraded: false };
	const provider = createOpenAICompatible({
		name: "vexis-llm",
		baseURL: cfg.llm.baseUrl,
		apiKey: cfg.llm.apiKey,
	});
	try {
		const { text } = await generateText({
			model: provider(cfg.llm.model),
			messages: [
				{ role: "user", content: buildPositionPrompt(opts.positions) },
			],
			temperature: 0,
			maxRetries: 1,
			timeout: cfg.llm.timeoutMs,
		});
		if (!text) return { decisions: [], degraded: true };
		return { decisions: parsePositionResponse(text), degraded: false };
	} catch (e) {
		console.error(
			"[agent] OOR LLM request failed:",
			e instanceof Error ? e.message : String(e),
		);
		return { decisions: [], degraded: true };
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-llm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/llm.ts test/agent-llm.test.ts
git commit -m "feat(agent): LLM OOR position decisions"
```

---

### Task 6: Engine — split fast/full scheduling paths

**Files:**
- Modify: `src/telegram/agent/engine.ts` (`RuntimeAgent` interface :49-54, `createAgent` start :126-141, rt object)

**Interfaces:**
- Consumes: nothing new.
- Produces: `RuntimeAgent.runFast(): Promise<void>`; `start()` wires `eventFiber` (60s) to `runFast`, `intervalFiber` (`intervalMinutes`) to `runCycle`.

- [ ] **Step 1: Add `runFast` to the interface and rt**

`engine.ts`, `RuntimeAgent` interface:

```ts
export interface RuntimeAgent {
	state: AgentState;
	start(): void;
	stop(): void;
	runCycle(): Promise<void>;
	runFast(): Promise<void>;
}
```

In the `rt` object, before `runCycle`:

```ts
		async runFast() {
			if (rt.state.running || !rt.state.enabled) return;
			rt.state.running = true;
			try {
				const cfg = resolveAgentConfigFrom(await getConfig());
				const wallet = await resolveWallet();
				console.log("[agent] fast check (tp/sl)");
				await evaluateTpSl(rt, bot, chatId, cfg, wallet, {
					includeOor: false,
				});
			} catch (e) {
				console.error("[agent] fast cycle error:", e);
			} finally {
				rt.state.running = false;
				saveState(rt.state);
			}
		},
```

- [ ] **Step 2: Point the event fiber at `runFast`**

`engine.ts`, in `start()`:

```ts
				eventFiber = schedule("event", 60_000, () => rt.runFast());
```

- [ ] **Step 3: Add `includeOor` option to `evaluateTpSl` signature**

`engine.ts`:

```ts
async function evaluateTpSl(
	rt: RuntimeAgent,
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	wallet: string,
	opts: { includeOor?: boolean } = {},
) {
```

(Task 7 fills in the body usage; this compiles because `opts` is used by `runFast`'s call site once Task 7 lands — so do Task 7 in the same session, or `npm run typecheck` will report `opts` unused. If continuing immediately, proceed to Task 7 before running typecheck.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS if Task 7 body is in place; otherwise continue straight to Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/engine.ts
git commit -m "feat(agent): split fast tp/sl path from full cycle"
```

---

### Task 7: Engine — OOR evaluation + auto close

**Files:**
- Modify: `src/telegram/agent/engine.ts`

**Interfaces:**
- Consumes: `OorPosition`, `PositionDecision`, `requestPositionDecisions` (Task 5); `recordCooldown` (Task 3); `JournalCandidate`, `appendJournal` (existing); `zap.closeAndZapOut`, `formatCycleSummary`, `readJournal` (existing).
- Produces: `evaluateOor(rt, bot, chatId, cfg, wallet, positions)`; OOR collection inside `evaluateTpSl`.

- [ ] **Step 1: Collect OOR positions in `evaluateTpSl`**

`engine.ts`, import the OOR types from `./llm.js` (add to the existing `import { ... } from "./llm.js"`):

```ts
import {
	type LlmCandidate,
	type OorPosition,
	requestPositionDecisions,
	requestSignals,
} from "./llm.js";
```

In `evaluateTpSl`, after `const pct = pnlPctValue(pos);` and before the `if (pct == null) continue;` line, add:

```ts
		if (pos.isOutOfRange === true) {
			oorPositions.push({
				pool: plan.pool,
				poolName: plan.poolName,
				pnlPct: pct ?? 0,
				minPrice: pos.minPrice,
				maxPrice: pos.maxPrice,
				poolActivePrice: pos.poolActivePrice,
			});
		}
```

Declare the collector at the top of `evaluateTpSl`:

```ts
	const oorPositions: OorPosition[] = [];
```

At the end of `evaluateTpSl`, after the `for` loop closes:

```ts
	if (opts.includeOor && oorPositions.length > 0) {
		await evaluateOor(rt, bot, chatId, cfg, wallet, oorPositions);
	}
```

- [ ] **Step 2: Add `evaluateOor`**

Append after `evaluateTpSl`:

```ts
async function evaluateOor(
	rt: RuntimeAgent,
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	wallet: string,
	positions: readonly OorPosition[],
) {
	console.log(
		`[agent] OOR: ${positions.length} position(s) out of range → LLM`,
	);
	const { decisions, degraded } = await requestPositionDecisions({
		cfg,
		positions,
	});
	if (degraded) {
		console.log(`[agent] OOR: LLM degraded — ${positions.length} held`);
		return;
	}
	for (const d of decisions) {
		const pos = positions.find((p) => p.pool === d.pool);
		if (!pos) continue;
		const plan = rt.state.plans.find(
			(p) => p.pool === pos.pool && p.positionAddress != null,
		);
		if (!plan) continue; // closed this cycle by tp/sl
		const base: JournalCandidate = {
			pool: pos.pool,
			poolName: pos.poolName,
			heuristicScore: 0,
			favorability: null,
			rationale: `OOR ${d.action}: ${d.rationale}`,
			score: 0,
			action: d.action,
			guardrail: "pass",
			blockedReason: null,
			execution: null,
			txSignature: null,
		};
		if (d.action === "hold") {
			appendJournal({
				ts: new Date().toISOString(),
				cycle: rt.state.cycle,
				llmStatus: "ok",
				candidates: [base],
			});
			console.log(`[agent] OOR decide: ${pos.poolName} → hold`);
			continue;
		}
		try {
			const out = await zap.closeAndZapOut(
				pos.pool,
				plan.positionAddress,
				WSOL_MINT,
			);
			const sig = out.closeSig ?? out.zapSig ?? out.claimSig ?? "";
			rt.state.plans = rt.state.plans.filter((x) => x !== plan);
			rt.state.executions.push({
				at: new Date().toISOString(),
				action: "close",
				pool: pos.pool,
				txSignature: sig || null,
			});
			rt.state.cooldowns = recordCooldown(
				rt.state.cooldowns,
				{
					pool: pos.pool,
					poolName: pos.poolName,
					baseMint: plan.baseMint,
					reason: "closed (OOR)",
				},
				cfg.poolCooldownMs,
				Date.now(),
			);
			appendJournal({
				ts: new Date().toISOString(),
				cycle: rt.state.cycle,
				llmStatus: "ok",
				candidates: [{ ...base, execution: "ok", txSignature: sig || null }],
			});
			saveState(rt.state);
			console.log(
				`[agent] OOR close ${pos.poolName} done: sig=${sig || "?"}`,
			);
			await send(bot, chatId, formatCycleSummary(readJournal(1), false));
		} catch (e) {
			console.error("[agent] OOR close failed:", e);
			appendJournal({
				ts: new Date().toISOString(),
				cycle: rt.state.cycle,
				llmStatus: "ok",
				candidates: [{ ...base, execution: "failed" }],
			});
		}
	}
}
```

Note: `plan.positionAddress` is `string | null`; the `find` predicate guarantees non-null, but TS does not narrow `plan` outside the predicate — pass `plan.positionAddress!` to `closeAndZapOut` (matches the existing `evaluateTpSl` pattern at `engine.ts:221-225`).

- [ ] **Step 3: Typecheck + tests**

Run: `npm run check && npm run typecheck && npm test`
Expected: PASS (Tasks 6+7 together; `opts` now used).

- [ ] **Step 4: Commit**

```bash
git add src/telegram/agent/engine.ts
git commit -m "feat(agent): LLM-decided close on out-of-range positions"
```

---

### Task 8: Engine — cooldown filter, record-on-block, LLM thinking line

**Files:**
- Modify: `src/telegram/agent/engine.ts` (`evaluatePlans`)

**Interfaces:**
- Consumes: `filterCooldown`, `checkPoolCooldown`, `recordCooldown` (Task 3).

- [ ] **Step 1: Filter cooldown pools after screening**

`engine.ts`, in `evaluatePlans`, after `liveLines[0] = ...` (the "screened" line) and before `const mintByPool`, add:

```ts
	const { pools: candidatePools, skipped: cooldownSkipped } = filterCooldown(
		screen.pools,
		rt.state.cooldowns,
		Date.now(),
	);
	if (cooldownSkipped > 0) {
		liveLines.push(
			`⏳ ${cooldownSkipped} pool${cooldownSkipped === 1 ? "" : "s"} in cooldown, skipped`,
		);
		await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
	}
```

Change `mintByPool` and `rankPools` to read from `candidatePools`:

```ts
	const mintByPool = new Map(
		candidatePools.map((p) => [p.pool, p.baseMint] as const),
	);
```

```ts
	const ranked = rankPools(candidatePools, {
```

- [ ] **Step 2: LLM "thinking" live line**

Replace the current live push before `requestSignals` with:

```ts
	liveLines.push(`🧠 LLM: thinking...`);
	await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
	const { signals, degraded } = await requestSignals({
		cfg,
		candidates: llmCandidates,
		weightsSummary: weightsSummary(weights),
	});
```

Then replace the existing post-call live push with:

```ts
	liveLines[liveLines.length - 1] = `🧠 LLM: ${llmCandidates.length} candidates → ${signals.length} signals${degraded ? " (degraded)" : ""}`;
	await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
```

(Move the `const { signals, degraded } = await requestSignals(...)` block above the live push; the `console.log` after it stays.)

- [ ] **Step 3: Safety-net cooldown guard + record on block**

After the `checkDuplicate` block (`engine.ts` around :433-449) and before `checkRisks`, add:

```ts
		const cd = checkPoolCooldown(
			d.pool.pool,
			d.pool.baseMint,
			rt.state.cooldowns,
			Date.now(),
		);
		if (!cd.ok) {
			journal.candidates.push({
				...base,
				guardrail: "blocked",
				blockedReason: cd.reason,
			});
			console.log(
				`[agent] decide: ${d.pool.name} score ${d.score} → blocked (${cd.reason})`,
			);
			await liveDecision(`⏳ ${d.pool.name} in cooldown: ${cd.reason ?? ""}`);
			continue;
		}
```

Record cooldown on the three pool-intrinsic block sites — after each `journal.candidates.push(...)` + `liveDecision(...)` in the **duplicate** block, the **risk** block, and the **guard** (`checkOpenGuardrail`) block, add:

```ts
			rt.state.cooldowns = recordCooldown(
				rt.state.cooldowns,
				{
					pool: d.pool.pool,
					poolName: d.pool.name,
					baseMint: d.pool.baseMint,
					reason: `${dup.reason ?? "blocked"}`,
				},
				cfg.poolCooldownMs,
				Date.now(),
			);
```

Using the matching variable for each block's reason: `dup.reason`, `risk.reason`, `guard.reason`. Do NOT record cooldown for the "no budget" block or the "within tx cooldown" block — those are transient, not pool-intrinsic.

- [ ] **Step 4: Verify**

Run: `npm run check && npm run typecheck && npm test`
Expected: PASS. Spot-check `npm test` reports the new suites (agent-config, agent-guardrails, agent-llm) plus all existing tests green.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/engine.ts
git commit -m "feat(agent): cooldown filter before LLM + record on block"
```

---

## Self-Review Notes

- Spec coverage: OOR LLM decision (Task 5, 7), cooldown pool+baseMint recorded on close (Task 7) and block (Task 8), filtered before LLM (Task 8), `poolCooldownMs` config (Task 1), state persistence (Task 2), LLM thinking indicator (Task 8), scheduling split fast/full (Task 6), journal `"close"` (Task 4). No format.ts change needed — `formatCycleSummary` uppercases any action and `formatLive` escapes everything.
- Placeholders: none; every step carries concrete code or commands.
- Type consistency: `OorPosition`/`PositionDecision`/`PositionAction` match Task 5 defs; `filterCooldown`/`checkPoolCooldown`/`recordCooldown` signatures match Task 3; `AgentCooldown` matches Task 2.
