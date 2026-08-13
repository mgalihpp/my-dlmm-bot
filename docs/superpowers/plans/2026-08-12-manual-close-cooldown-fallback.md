# Manual Close Cooldown — Disk Fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the `"closed manually"` pool cooldown even when the agent runtime is unavailable, via the persisted `.vexis-agent.json` state.

**Architecture:** `applyManualCloseCooldown` picks the state source — live `RuntimeAgent.state` when the runtime exists, otherwise `loadState()` from disk — records the cooldown and persists. `recordManualClose` becomes thin glue: resolve config, gate on `agent.enabled`, then delegate. Non-agent users stay untouched (no state file created).

**Tech Stack:** TypeScript (strict, ESM), Effect, Vitest, Biome.

## Global Constraints

- ESM-only imports with `.js` extensions (e.g. `import { x } from "./foo.js"`).
- Biome: tab indent, double quotes, organize imports (`npm run check`, `npm run format`).
- Tests are excluded from tsc; run via `npm test` (vitest).
- Verify order per AGENTS.md: `npm run check && npm run typecheck && npm test`.
- No comments unless they document behavior (match existing style in `manual-close.ts`).
- Spec: `docs/superpowers/specs/2026-08-12-manual-close-cooldown-fallback-design.md`.

---

### Task 1: Add `applyManualCloseCooldown` helper (TDD)

**Files:**
- Modify: `src/telegram/agent/manual-close.ts` (add function; imports gain `loadState`, `AgentState` type)
- Test: `test/agent-manual-close.test.ts`

**Interfaces:**
- Consumes: `recordManualCloseCooldown(state, input, durationMs, file?)` (existing, `manual-close.ts:9`); `loadState(file?)` from `./state.js`; `RuntimeAgent` type from `./engine.js`.
- Produces: `applyManualCloseCooldown(rt: RuntimeAgent | null, input: { pool: string; poolName: string; baseMint: string | null }, durationMs: number, file?: string): AgentState` — mutates (and persists) either the runtime's in-memory state or the on-disk state, and returns it.

- [ ] **Step 1: Write the failing tests** — append to `test/agent-manual-close.test.ts`:

```ts
import {
	applyManualCloseCooldown,
	recordManualClose,
	recordManualCloseCooldown,
} from "../src/telegram/agent/manual-close.js";
import {
	type AgentState,
	loadState,
} from "../src/telegram/agent/state.js";
import type { RuntimeAgent } from "../src/telegram/agent/engine.js";
```

Append a new describe block to `test/agent-manual-close.test.ts`:

```ts
describe("applyManualCloseCooldown", () => {
	it("falls back to the on-disk state when the runtime is unavailable", () => {
		const file = tmpFile("fallback.json");
		applyManualCloseCooldown(
			null,
			{ pool: "P1", poolName: "A/SOL", baseMint: "mintX" },
			60_000,
			file,
		);
		const s = loadState(file);
		expect(s.cooldowns).toHaveLength(1);
		expect(s.cooldowns[0]).toMatchObject({
			pool: "P1",
			poolName: "A/SOL",
			baseMint: "mintX",
			reason: "closed manually",
		});
		expect(Date.parse(s.cooldowns[0].until)).toBeGreaterThan(Date.now());
	});

	it("uses the runtime in-memory state when available", () => {
		const s = state([
			{
				pool: "P0",
				poolName: "Old/SOL",
				baseMint: null,
				until: "2020-01-01T00:00:00.000Z",
				reason: "expired",
			},
		]);
		const rt = { state: s } as unknown as RuntimeAgent;
		const out = applyManualCloseCooldown(
			rt,
			{ pool: "P1", poolName: "A/SOL", baseMint: null },
			60_000,
			tmpFile("mem.json"),
		);
		expect(out).toBe(s);
		expect(s.cooldowns).toHaveLength(1);
		expect(s.cooldowns[0].pool).toBe("P1");
		expect(s.cooldowns[0].reason).toBe("closed manually");
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/agent-manual-close.test.ts`
Expected: FAIL with `applyManualCloseCooldown is not a function`.

- [ ] **Step 3: Implement `applyManualCloseCooldown`** — in `src/telegram/agent/manual-close.ts`, add imports and the function:

```ts
import {
	type AgentState,
	loadState,
	saveState,
} from "./state.js";
```

(keep existing imports; `saveState` is already used via `recordManualCloseCooldown` — only add `loadState` and the `AgentState` type import; `saveState` is not needed directly since `recordManualCloseCooldown` persists)

```ts
/** Chooses the state source for a manual close cooldown: the live runtime's
 * in-memory state when the agent is active, otherwise the persisted on-disk
 * state (`.vexis-agent.json`) so the cooldown survives until the agent starts.
 * Returns the mutated state. */
export function applyManualCloseCooldown(
	rt: RuntimeAgent | null,
	input: { pool: string; poolName: string; baseMint: string | null },
	durationMs: number,
	file?: string,
): AgentState {
	const state = rt?.state ?? loadState(file);
	recordManualCloseCooldown(state, input, durationMs, file);
	return state;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/agent-manual-close.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + typecheck**

Run: `npm run check && npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/telegram/agent/manual-close.ts test/agent-manual-close.test.ts
git commit -m "feat(agent): cooldown helper falls back to on-disk state"
```

---

### Task 2: Rework `recordManualClose` glue — enabled gate + disk fallback

**Files:**
- Modify: `src/telegram/agent/manual-close.ts:27-45` (`recordManualClose`)
- Test: `test/agent-manual-close.test.ts` (drop the stale no-op test)

**Interfaces:**
- Consumes: `applyManualCloseCooldown` from Task 1; `resolveAgentConfigFrom` and `getConfig` (already imported); `RuntimeAgent` type.
- Produces: `recordManualClose(getRt: () => RuntimeAgent | null, pool: string, poolName: string, baseMint: string | null): Promise<void>` — same signature as before; callers in `manage.ts:200`, `onchain.ts:210`, `onchain.ts:301` are unchanged.

- [ ] **Step 1: Remove the stale glue test** — in `test/agent-manual-close.test.ts`, delete the entire `describe("recordManualClose", ...)` block (the "no-op when the agent runtime is unavailable" assertion is no longer the contract, and a glue test would call the real Effect config runtime — with a dev config enabling the agent it would write to the real `.vexis-agent.json` in the repo, so the glue stays untested per the spec). Also remove `recordManualClose` from the `../src/telegram/agent/manual-close.js` import (it becomes unused; Biome will flag it).

- [ ] **Step 2: Run the tests to verify they still pass**

Run: `npm test -- test/agent-manual-close.test.ts`
Expected: PASS (both `applyManualCloseCooldown` tests and the two `recordManualCloseCooldown` tests).

- [ ] **Step 3: Rework `recordManualClose`** in `src/telegram/agent/manual-close.ts`:

```ts
/** Records a pool cooldown after a manual close from Telegram. No-op when the
 * agent is not enabled in config. When the agent runtime is unavailable (not
 * started), falls back to the persisted state so the cooldown is still honored
 * once the agent starts. Never throws — a failed cooldown record must not fail
 * the close flow. */
export async function recordManualClose(
	getRt: () => RuntimeAgent | null,
	pool: string,
	poolName: string,
	baseMint: string | null,
): Promise<void> {
	try {
		const cfg = resolveAgentConfigFrom(await getConfig());
		if (!cfg.enabled) return;
		applyManualCloseCooldown(
			getRt(),
			{ pool, poolName, baseMint },
			cfg.poolCooldownMs,
		);
	} catch (e) {
		console.warn("[agent] manual close cooldown record failed:", e);
	}
}
```

- [ ] **Step 4: Run the full verification suite**

Run: `npm run check && npm run typecheck && npm test`
Expected: all clean, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/manual-close.ts test/agent-manual-close.test.ts
git commit -m "feat(agent): manual close cooldown survives while agent is stopped"
```

---

## Self-Review

- **Spec coverage:** enabled-gate no-op → Task 2 Step 3; runtime-present path → Task 1 test 2 + Task 1 implementation; disk fallback → Task 1 test 1 + implementation; try/catch + warn retained → Task 2 Step 3; no CLI changes → nothing touches `src/cli.ts`. ✓
- **Placeholders:** none — every code step carries full code. ✓
- **Type consistency:** `applyManualCloseCooldown(rt, input, durationMs, file?)` defined once (Task 1) and consumed with the same shape in Task 2; `recordManualClose` signature unchanged for the three existing call sites. ✓
