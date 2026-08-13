# Manual Close Cooldown — Disk Fallback — Design

> Status: draft

Date: 2026-08-12

Extends: [2026-08-12-manual-close-cooldown-design.md](./2026-08-12-manual-close-cooldown-design.md) (implemented).

## Problem

`recordManualClose` (`src/telegram/agent/manual-close.ts`) records the `"closed manually"` pool cooldown only when the agent runtime exists (`getRt()` returns non-null). When the agent is not active — bot running without agent, or agent not yet started — a manual close via `/manage` or `/close` succeeds but leaves no cooldown, so the pool/token can be re-opened on the agent's next run.

Goal: the cooldown is recorded even when the agent runtime is unavailable, using the persisted state file (`.vexis-agent.json`) — the same file the engine loads on start, so the cooldown is honored when the agent later starts.

## Approach (approved)

### 1. Behavior of `recordManualClose` (`manual-close.ts`)

1. Resolve config first: `resolveAgentConfigFrom(await getConfig())`.
2. **Gate: if `cfg.enabled` is `false` → return (no-op).** Non-agent users never get a state file created by a manual close; behavior unchanged for them.
3. Runtime present (`getRt()` non-null) → mutate in-memory state and persist — exactly as today.
4. Runtime absent → `loadState(file)` from disk, record the cooldown, `saveState(file)`.

The runtime-present path never touches disk-loading, so there is no race with the agent's in-memory copy: the fallback only engages when the runtime is null (agent not running), where disk is authoritative. This is the guard that keeps the original spec's "no file-based state access from handlers" concern satisfied while the agent is alive.

Duration stays `cfg.poolCooldownMs`; reason stays `"closed manually"`; record + prune via the existing `recordCooldown`. Never throws — catch + `console.warn` stays.

### 2. Refactor for testability

Extract the state-source decision into a pure-ish helper so unit tests can exercise the fallback without the global Effect config runtime:

```ts
export function applyManualCloseCooldown(
  rt: RuntimeAgent | null,
  input: { pool: string; poolName: string; baseMint: string | null },
  durationMs: number,
  file?: string,
): AgentState
```

- `rt` present → use `rt.state`.
- `rt` null → `loadState(file)`.
- Records the cooldown (`reason: "closed manually"`) by delegating to the existing `recordManualCloseCooldown(state, input, durationMs, file)` — which both persists via `saveState` and prunes expired entries — then returns the (possibly mutated) state.

`recordManualClose` becomes thin glue: resolve config → `enabled` gate → `applyManualCloseCooldown(getRt(), input, cfg.poolCooldownMs)` wrapped in try/catch.

### Out of scope (unchanged)

- CLI `close` (`src/cli.ts`) — no cooldown record.
- Agent-driven closes (TP/SL, OOR, retry) — already record cooldown.
- Plan removal — still handled by the engine's TP/SL reconcile.
- The `enabled` gate is one line of glue and is not unit-tested (would require mocking the Effect config runtime; project convention is pure-logic tests with inline fixtures).

## Error handling

Same as today: all config/state failures are caught and logged (`console.warn`), never thrown — a failed cooldown record must not fail the close flow. `saveState` already swallows write errors.

## Files touched

- `src/telegram/agent/manual-close.ts` — rework `recordManualClose`; add `applyManualCloseCooldown`.
- `test/agent-manual-close.test.ts` — tests for `applyManualCloseCooldown`: fallback with `rt = null` + temp file (cooldown persisted, verifiable via reload), and in-memory path with `rt` present.

## Verification

`npm run check && npm run typecheck && npm test` (per AGENTS.md).
