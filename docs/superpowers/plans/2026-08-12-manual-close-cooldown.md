# Manual Close → Pool Cooldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the agent's per-pool cooldown (`agent.poolCooldownMs`, `reason: "closed manually"`) whenever a position is closed manually via any Telegram close path (`mng:close` button, `/close` with args, interactive `close:pos`), so the agent won't re-open that pool/token during the window.

**Architecture:** A new helper module `src/telegram/agent/manual-close.ts` exposes a sync core (`recordManualCloseCooldown`, unit-testable: mutates `AgentState.cooldowns` via the existing `recordCooldown` and persists with `saveState`) and an async wrapper (`recordManualClose`) that resolves the agent runtime + config and never throws. The Telegram close handlers call the wrapper after a successful close tx; `bot.ts` passes a `() => rtAgent` getter into `registerOnchain`/`registerManage` (handlers are registered before `rtAgent` exists, but callbacks run later). `resolvePoolDetail` gains `tokenXMint` for the `baseMint` value.

**Tech Stack:** TypeScript (ESM, strict), grammY, vitest, biome.

## Global Constraints

- ESM-only — imports use `.js` extensions: `import { x } from "./foo.js"`.
- Biome: tab indent, double quotes. Do not reorder imports manually — biome `organize imports` handles it via `npm run check`.
- TypeScript strict, no unused locals/params. Tests are excluded from `tsc`.
- Verify order: `npm run check && npm run typecheck && npm test`.
- The manual-close hook must NEVER throw or fail the close flow — wrap in try/catch inside `recordManualClose` (the wrapper already does; call sites just `await` it).
- Do NOT touch: agent-driven closes (TP/SL, OOR, retry — already record cooldown), plan pruning (`engine.ts:621-626`), CLI `src/cli.ts`.
- State persists via `saveState` from `src/telegram/agent/state.ts` — same flow the engine uses (mutate the runtime's in-memory state, then persist; never `loadState()`/`saveState()` a separate copy from the handlers).

---

### Task 1: Manual-close cooldown helper

**Files:**
- Create: `src/telegram/agent/manual-close.ts`
- Create: `test/agent-manual-close.test.ts`

**Interfaces:**
- Produces: `recordManualCloseCooldown(state: AgentState, input: { pool: string; poolName: string; baseMint: string | null }, durationMs: number, file?: string): void` — appends a cooldown entry with `reason: "closed manually"`, prunes expired entries, persists via `saveState(state, file)`.
- Produces: `recordManualClose(getRt: () => RuntimeAgent | null, pool: string, poolName: string, baseMint: string | null): Promise<void>` — no-op when `getRt()` is null; otherwise resolves `agent.poolCooldownMs` from config and calls the core; never throws (logs a `console.warn` on failure).
- Consumes: `recordCooldown` from `./guardrails.js`, `saveState` from `./state.js`, `getConfig` from `../fx.js`, `resolveAgentConfigFrom` from `../../services/Config.js`, type `RuntimeAgent` from `./engine.js`.

- [ ] **Step 1: Write the failing test**

`test/agent-manual-close.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-manual-close.test.ts`
Expected: FAIL — cannot find module `../src/telegram/agent/manual-close.js`.

- [ ] **Step 3: Write the implementation**

`src/telegram/agent/manual-close.ts`:

```ts
import { resolveAgentConfigFrom } from "../../services/Config.js";
import { getConfig } from "../fx.js";
import type { RuntimeAgent } from "./engine.js";
import { recordCooldown } from "./guardrails.js";
import { saveState, type AgentState } from "./state.js";

/** Appends a pool cooldown entry (`reason: "closed manually"`) to agent state
 * and persists. Expired entries are pruned by `recordCooldown`. */
export function recordManualCloseCooldown(
	state: AgentState,
	input: { pool: string; poolName: string; baseMint: string | null },
	durationMs: number,
	file?: string,
): void {
	state.cooldowns = recordCooldown(
		state.cooldowns,
		{ ...input, reason: "closed manually" },
		durationMs,
		Date.now(),
	);
	saveState(state, file);
}

/** Records a pool cooldown after a manual close from Telegram. No-op when the
 * agent runtime is unavailable (e.g. no chatId configured). Never throws — a
 * failed cooldown record must not fail the close flow. */
export async function recordManualClose(
	getRt: () => RuntimeAgent | null,
	pool: string,
	poolName: string,
	baseMint: string | null,
): Promise<void> {
	const rt = getRt();
	if (!rt) return;
	try {
		const cfg = resolveAgentConfigFrom(await getConfig());
		recordManualCloseCooldown(rt.state, { pool, poolName, baseMint }, cfg.poolCooldownMs);
	} catch (e) {
		console.warn("[agent] manual close cooldown record failed:", e);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-manual-close.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify lint + types**

Run: `npm run check && npm run typecheck`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/telegram/agent/manual-close.ts test/agent-manual-close.test.ts
git commit -m "feat(agent): add manual-close pool cooldown helper"
```

---

### Task 2: Cooldown on `mng:close` (manage menu + TP/SL & OOR notification buttons)

**Files:**
- Modify: `src/telegram/pool-position-selector.ts:133-159` (`resolvePoolDetail` — add `tokenXMint` to return type and returned object)
- Modify: `src/telegram/handlers/manage.ts` (imports, `registerManage` signature, `mng:close` handler)
- Modify: `src/telegram/bot.ts:102-112` (declare `rtAgent` earlier, pass getter to `registerManage`)

**Interfaces:**
- Consumes: `recordManualClose` from `../agent/manual-close.js` (Task 1), type `RuntimeAgent` from `../agent/engine.js`.
- Produces: `registerManage(bot: Bot, getRt: () => RuntimeAgent | null)` — `mng:close` records the cooldown after a successful close tx.
- Produces: `resolvePoolDetail` return type gains `tokenXMint: string`.

- [ ] **Step 1: Add `tokenXMint` to `resolvePoolDetail`**

`src/telegram/pool-position-selector.ts`, return type after `tokenY: string;`:

```ts
	tokenXMint: string;
```

and in the returned object after `tokenY: pool.tokenY,`:

```ts
			tokenXMint: pool.tokenXMint,
```

- [ ] **Step 2: Wire `registerManage` + `mng:close`**

`src/telegram/handlers/manage.ts`:

1. Add imports (biome will organize):

```ts
import type { RuntimeAgent } from "../agent/engine.js";
import { recordManualClose } from "../agent/manual-close.js";
```

2. Change the signature (line 28):

```ts
export function registerManage(bot: Bot, getRt: () => RuntimeAgent | null) {
```

3. In the `mng:close` handler (`/^mng:close:(.+)$/`), after the existing `pairName` block and before `presentEdit`, capture the cooldown inputs:

```ts
		const poolName = pairName;
		const baseMint = detail?.tokenXMint ?? null;
```

4. Inside the `presentEdit` runner, after the sig check and before `return sig;`:

```ts
			await recordManualClose(getRt, poolAddress, poolName, baseMint);
```

- [ ] **Step 3: Update `bot.ts` call site**

`src/telegram/bot.ts`: move the `let rtAgent: RuntimeAgent | null = null;` declaration (currently line 112) up to before `registerPortfolio(bot);` (line 102), and change line 106:

```ts
	registerManage(bot, () => rtAgent);
```

Remove the old `let rtAgent: RuntimeAgent | null = null;` declaration at line 112 (keep `rtAgent = createAgent(bot, chatId);`).

- [ ] **Step 4: Verify**

Run: `npm run check && npm run typecheck`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/pool-position-selector.ts src/telegram/handlers/manage.ts src/telegram/bot.ts
git commit -m "feat(agent): record pool cooldown on manual mng:close"
```

---

### Task 3: Cooldown on `/close` (with args) and interactive `close:pos`

**Files:**
- Modify: `src/telegram/handlers/onchain.ts` (imports, `registerOnchain` signature, `/close` args runner, `close:pos` runner)
- Modify: `src/telegram/bot.ts:105` (pass getter to `registerOnchain`)

**Interfaces:**
- Consumes: `recordManualClose` from `../agent/manual-close.js` (Task 1), type `RuntimeAgent` from `../agent/engine.js`, `resolvePoolDetail` with `tokenXMint` (Task 2).
- Produces: `registerOnchain(bot: Bot, getRt: () => RuntimeAgent | null)` — both Telegram `/close` flows record the cooldown after a successful close tx.

- [ ] **Step 1: Wire `registerOnchain` imports + signature**

`src/telegram/handlers/onchain.ts`:

1. Add imports:

```ts
import type { RuntimeAgent } from "../agent/engine.js";
import { recordManualClose } from "../agent/manual-close.js";
```

2. Change the signature (line 42):

```ts
export function registerOnchain(bot: Bot, getRt: () => RuntimeAgent | null) {
```

- [ ] **Step 2: Record cooldown in `/close <pool> <pos>` (with args)**

In the `/close` command handler, inside the `makeZapRunner` closure (around line 196), after the sig check and before `return sig;`:

```ts
					await recordManualClose(
						getRt,
						poolAddress,
						pairName,
						detail?.tokenXMint ?? null,
					);
```

(`detail` and `pairName` are already computed in the `if (poolAddress && positionPubkey)` block.)

- [ ] **Step 3: Record cooldown in interactive `close:pos`**

In the `close:pos` callback handler, inside the `makeZapRunner` closure (around line 286), after the sig check and before `return sig;`:

```ts
				await recordManualClose(
					getRt,
					poolAddress,
					pairName,
					detail?.tokenXMint ?? null,
				);
```

(`detail` and `pairName` are already computed above the `present` call.)

- [ ] **Step 4: Update `bot.ts` call site**

`src/telegram/bot.ts` line 105:

```ts
	registerOnchain(bot, () => rtAgent);
```

- [ ] **Step 5: Verify**

Run: `npm run check && npm run typecheck`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/telegram/handlers/onchain.ts src/telegram/bot.ts
git commit -m "feat(agent): record pool cooldown on manual /close flows"
```

---

### Task 4: Full verification

- [ ] **Step 1: Run the full suite**

Run: `npm run check && npm run typecheck && npm test`
Expected: all pass (new: `test/agent-manual-close.test.ts`).

- [ ] **Step 2: Confirm no stray state file**

Run: `git status --short`
Expected: no untracked `.vexis-agent.json` or `.vexis-tpsl.json` in the working tree (tests write to a tmp dir only).

- [ ] **Step 3: Review the diff**

Run: `git log --oneline -4` — expect the three feature commits from Tasks 1–3. If anything was missed, amend in a new commit, never `--amend` the feature commits.
