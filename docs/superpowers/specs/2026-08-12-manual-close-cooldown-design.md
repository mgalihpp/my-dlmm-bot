# Manual Close → Pool Cooldown — Design

> Status: approved — implementation plan TBD

Date: 2026-08-12

## Problem

Closing a position manually via Telegram (`mng:close` callback, `/close` command, or the interactive `close:pos` flow) only executes the on-chain close+zap-out. It never touches the AI agent's state, so:

1. **No cooldown recorded** — `recordCooldown` is only called on agent-driven closes (TP/SL trigger at `engine.ts:672`, OOR close at `:846`, retry close at `:318`). A manual close leaves no entry, so the pool (and its base token) can be screened, LLM-evaluated, and re-opened again the next cycle — even when the user closed it deliberately (lost conviction, bad range, etc.).
2. **Stale plan lingers silently** — if the position was agent-tracked, the plan is only pruned when the next TP/SL check finds the position gone (`engine.ts:621-626`); that prune records no cooldown either.

Goal: a manual close via any Telegram close path records the same per-pool cooldown (`agent.poolCooldownMs`) as an agent-driven close, with `reason: "closed manually"`, so the agent does not re-open that pool/token during the cooldown window.

## Approach (approved)

### 1. Wire the agent runtime into the Telegram close handlers

- `bot.ts`: pass a getter `() => rtAgent` into `registerOnchain(bot, ...)` and `registerManage(bot, ...)` — the handlers are registered before `rtAgent` is created (inside the `chatId` guard), but callbacks only run later, so a getter is safe. `null` (no chatId configured) → cooldown recording is a no-op.
- This matches the existing convention of passing `RuntimeAgent` into `registerAgentCommands` / `registerMenuSpokes` / `registerDashboard` / `registerConfigEditor`. No file-based state access from the handlers, so no race with the agent's in-memory copy (a standalone `loadState()`/`saveState()` in the handler would be clobbered by the agent's next `saveState`).

### 2. Helper in the agent module

New `src/telegram/agent/manual-close.ts`:

```ts
export function recordManualCloseCooldown(
  rt: RuntimeAgent | null,
  input: { pool: string; poolName: string; baseMint: string | null },
  durationMs: number,
): void
```

- No-op when `rt` is `null`.
- `rt.state.cooldowns = recordCooldown(rt.state.cooldowns, { ...input, reason: "closed manually" }, durationMs, Date.now())` then `saveState(rt.state)` — same helpers/flow the engine uses.
- `recordCooldown` already prunes expired entries, so no extra pruning logic needed.

### 3. Pool metadata

- `resolvePoolDetail` (`pool-position-selector.ts`) gains `tokenXMint` in its return type (additive). `baseMint` = `tokenXMint`, matching `adoptOnchainPlans`.
- `poolName` = `${tokenX}/${tokenY}` — already computed in both handlers before the tx.

### 4. Call sites (all Telegram close paths, after the close tx succeeds)

- `manage.ts` `mng:close:<actionId>` — used by the manage menu AND the TP/SL trigger / OOR notification buttons.
- `onchain.ts` `/close <pool> <pos>` (with args) — inside the zap runner after a sig is produced.
- `onchain.ts` `close:pos:<actionId>` (interactive flow) — same, inside its runner.

`poolName`/`baseMint` are captured from the `resolvePoolDetail` call the handlers already make before presenting; `durationMs` = `resolveAgentConfigFrom(await getConfig()).poolCooldownMs` (same pattern as `agent/commands.ts`).

### Explicitly out of scope

- **Plan removal** — a stale plan for the manually closed position is left for the engine's next TP/SL check to prune (`engine.ts:621-626`), exactly as today. Until pruned, the plan's duplicate guard actually reinforces the cooldown.
- **Agent-driven closes** — TP/SL, OOR, and retry closes already record cooldown; unchanged.
- **CLI `/close`** (`src/cli.ts`) — Telegram paths only.
- No journal entry, no `executions` push — keeps the change minimal; the engine still logs the prune.

## Error handling

The post-close hook is wrapped in try/catch and logged (`console.warn`), never thrown — a failed cooldown record (e.g. config load error) must not fail or fake the close flow. `saveState` already swallows write errors internally.

## Files touched

- `src/telegram/agent/manual-close.ts` (new) — `recordManualCloseCooldown`.
- `src/telegram/pool-position-selector.ts` — `resolvePoolDetail` returns `tokenXMint` (additive).
- `src/telegram/handlers/manage.ts` — `mng:close` records cooldown after success; `registerManage(bot, getRt)`.
- `src/telegram/handlers/onchain.ts` — `/close` (args) and `close:pos` record cooldown after success; `registerOnchain(bot, getRt)`.
- `src/telegram/bot.ts` — pass getters to `registerOnchain` / `registerManage`.
- `test/agent-manual-close.test.ts` (new) — helper appends an entry with `reason: "closed manually"`; no-op on `null` runtime; expired entries pruned.

## Verification

`npm run check && npm run typecheck && npm test` (per AGENTS.md).
