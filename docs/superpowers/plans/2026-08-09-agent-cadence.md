# Agent Cadence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move agent position-finding (`evaluatePlans`) from the 15-minute cycle to a `txCooldownMs`-driven loop (default 5 min), keep TP/SL at 60s, and move OOR LLM decisions to the `intervalMinutes` loop (15 min).

**Architecture:** Three independently-scheduled Effect fibers in `createAgent` (`engine.ts`), each running one job. All three share the existing `rt.state.running` flag, so only one job runs at a time — whichever fiber starts first wins the tick. No config schema changes; `txCooldownMs` and `intervalMinutes` already exist.

**Tech Stack:** TypeScript (strict, ESM), Effect (`Schedule.spaced`, `Duration`), grammY, Biome.

## Global Constraints

- ESM-only: all imports use `.js` extensions.
- Biome format: tab indent, double quotes, organize imports.
- TypeScript strict, no unused locals/params.
- Error handling: tagged errors / `logError`, no thrown exceptions.
- Do NOT add new dependencies. Do NOT change config schema.
- Verify: `npm run check && npm run typecheck && npm test`.

---

### Task 1: Restructure engine.ts cadence — three fibers

**Files:**
- Modify: `src/telegram/agent/engine.ts:61-67` (interface), `:133-134` (fiber vars), `:156-180` (`start`/`stop`), `:199-229` (`runCycle`), add `runOor` after `:229`

**Interfaces:**
- Consumes: existing `RuntimeAgent`, `resolveAgentConfigFrom` (provides `txCooldownMs: number`, `intervalMinutes: number`), `evaluateTpSl`, `evaluatePlans`, `syncOnchainPlans`, `api.openPortfolio`, `schedule` helper (already in file), `section`, `logInfo`, `logError`, `saveState`.
- Produces: `RuntimeAgent` gains `runOor(): Promise<void>` — used only internally by `schedule` inside `createAgent`. `runCycle` semantics change (positions only, no TP/SL/OOR). `runFast` unchanged (TP/SL, already calls `syncOnchainPlans(rt, wallet)`).

- [ ] **Step 1: Add `runOor` to the interface**

In `src/telegram/agent/engine.ts:61-67`, current:
```ts
export interface RuntimeAgent {
	state: AgentState;
	start(): void;
	stop(): void;
	runCycle(): Promise<void>;
	runFast(): Promise<void>;
}
```
Change to add `runOor(): Promise<void>;` after `runFast(): Promise<void>;`.

- [ ] **Step 2: Add `oorFiber` variable**

Current (`:133-134`):
```ts
	let intervalFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
	let eventFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
```
Change to add after `eventFiber`:
```ts
	let oorFiber: Fiber.RuntimeFiber<unknown, unknown> | null = null;
```

- [ ] **Step 3: Repoint `start()` — cycle loop at `txCooldownMs`, add oor loop**

Current (`:156-171`):
```ts
		start() {
			stopFiber(intervalFiber);
			stopFiber(eventFiber);
			void getConfig().then((cfg) => {
				const agentCfg = resolveAgentConfigFrom(cfg);
				rt.state.enabled = true;
				rt.state.running = false;
				saveState(rt.state);
				intervalFiber = schedule(
					"loop",
					agentCfg.intervalMinutes * 60_000,
					() => rt.runCycle(),
				);
				eventFiber = schedule("event", 60_000, () => rt.runFast());
			});
		},
```
Change to:
```ts
		start() {
			stopFiber(intervalFiber);
			stopFiber(eventFiber);
			stopFiber(oorFiber);
			void getConfig().then((cfg) => {
				const agentCfg = resolveAgentConfigFrom(cfg);
				rt.state.enabled = true;
				rt.state.running = false;
				saveState(rt.state);
				intervalFiber = schedule(
					"cycle",
					Math.max(agentCfg.txCooldownMs, 60_000),
					() => rt.runCycle(),
				);
				eventFiber = schedule("event", 60_000, () => rt.runFast());
				oorFiber = schedule(
					"oor",
					agentCfg.intervalMinutes * 60_000,
					() => rt.runOor(),
				);
			});
		},
```

- [ ] **Step 4: Update `stop()` to kill `oorFiber`**

Current (`:172-180`):
```ts
		stop() {
			stopFiber(intervalFiber);
			stopFiber(eventFiber);
			intervalFiber = null;
			eventFiber = null;
			rt.state.enabled = false;
			rt.state.running = false;
			saveState(rt.state);
		},
```
Change to add `stopFiber(oorFiber);` after `stopFiber(eventFiber);` and `oorFiber = null;` after `eventFiber = null;`.

- [ ] **Step 5: Rewrite `runCycle()` — positions only, drop TP/SL + OOR**

Current (`:199-229`):
```ts
		async runCycle() {
			if (rt.state.running || !rt.state.enabled) return;
			rt.state.running = true;
			try {
				const cfg = resolveAgentConfigFrom(await getConfig());
				const wallet = await resolveWallet();
				section(
					`CYCLE #${rt.state.cycle + 1} | plans: ${rt.state.plans.length} | interval: ${cfg.intervalMinutes}m`,
				);
				const open = await api.openPortfolio(wallet, 1, 100);
				const deployed = Number(open.total?.balancesSol ?? 0);
				const openPositions = open.totalPositions ?? 0;
				logInfo(
					`deployed: ${deployed} SOL (${open.total?.balances ?? "0"} USD), open positions on-chain: ${openPositions}`,
				);
				await syncOnchainPlans(rt, wallet, open);
				await evaluateTpSl(rt, bot, chatId, cfg, wallet, {
					includeOor: true,
				});
				await evaluatePlans(rt, bot, chatId, cfg, deployed, openPositions);
				rt.state.lastCycleAt = new Date().toISOString();
				logInfo(
					`cycle #${rt.state.cycle} done | plans: ${rt.state.plans.length}`,
				);
			} catch (e) {
				logError("cycle error:", e);
			} finally {
				rt.state.running = false;
				saveState(rt.state);
			}
		},
```
Change to:
```ts
		async runCycle() {
			if (rt.state.running || !rt.state.enabled) return;
			rt.state.running = true;
			try {
				const cfg = resolveAgentConfigFrom(await getConfig());
				const wallet = await resolveWallet();
				section(
					`CYCLE #${rt.state.cycle + 1} | plans: ${rt.state.plans.length} | interval: ${cfg.txCooldownMs / 60_000}m`,
				);
				const open = await api.openPortfolio(wallet, 1, 100);
				const deployed = Number(open.total?.balancesSol ?? 0);
				const openPositions = open.totalPositions ?? 0;
				await syncOnchainPlans(rt, wallet, open);
				await evaluatePlans(rt, bot, chatId, cfg, deployed, openPositions);
				rt.state.lastCycleAt = new Date().toISOString();
				logInfo(
					`cycle #${rt.state.cycle} done | plans: ${rt.state.plans.length}`,
				);
			} catch (e) {
				logError("cycle error:", e);
			} finally {
				rt.state.running = false;
				saveState(rt.state);
			}
		},
```

- [ ] **Step 6: Add `runOor()` after `runCycle()`**

Insert after the `runCycle` block (after its closing `},` at `:229`), before the `};` that closes the `rt` object:
```ts
		async runOor() {
			if (rt.state.running || !rt.state.enabled) return;
			rt.state.running = true;
			try {
				const cfg = resolveAgentConfigFrom(await getConfig());
				const wallet = await resolveWallet();
				section("OOR CHECK");
				await evaluateTpSl(rt, bot, chatId, cfg, wallet, {
					includeOor: true,
				});
			} catch (e) {
				logError("oor error:", e);
			} finally {
				rt.state.running = false;
				saveState(rt.state);
			}
		},
```

- [ ] **Step 7: Verify — check, typecheck, tests**

Run: `npm run check && npm run typecheck && npm test`
Expected: Biome clean, tsc no errors, all existing tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/telegram/agent/engine.ts
git commit -m "feat(agent): position-finding every txCooldownMs, OOR on intervalMinutes"
```
