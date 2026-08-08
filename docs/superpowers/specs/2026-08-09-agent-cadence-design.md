# Agent Cadence: Position-Finding Every txCooldownMs

Date: 2026-08-09

## Problem

Agent cycle currently runs position-finding (`evaluatePlans`) once per `intervalMinutes` (default 15 min). User wants new-position discovery more frequent — matching `txCooldownMs` (default 5 min) — while keeping TP/SL at 60s and OOR LLM decisions at 15 min.

## Current Behavior

- `eventFiber` — every 60s → `runFast()` → `evaluateTpSl(includeOor: false)` (TP/SL closes only)
- `intervalFiber` — every `intervalMinutes * 60_000` (15 min) → `runCycle()` → portfolio fetch → `syncOnchainPlans` → `evaluateTpSl(includeOor: true)` (TP/SL + OOR LLM) → `evaluatePlans` (screening + LLM + open positions)

## Target Behavior

| Fiber | Interval | Work |
|---|---|---|
| `eventFiber` | 60s | TP/SL closes (unchanged) |
| `intervalFiber` | `max(txCooldownMs, 60_000)` | portfolio fetch → `syncOnchainPlans` → `evaluatePlans` |
| `oorFiber` (new) | `intervalMinutes * 60_000` | `evaluateTpSl(includeOor: true)` → OOR LLM decisions |

## Design

File: `src/telegram/agent/engine.ts`

1. **`runFast`** — unchanged. TP/SL closes, `includeOor: false`.

2. **`runCycle`** — repurposed as the position-finding loop:
   - Remove `evaluateTpSl(includeOor: true)` call (OOR moves to `runOor`).
   - Keep: `openPortfolio` fetch, `syncOnchainPlans`, `evaluatePlans`.
   - Drop the `deployed`/`openPositions` log that only fed `evaluatePlans` (keep minimal logging).
   - Interval in `start()`: `Math.max(agentCfg.txCooldownMs, 60_000)` instead of `agentCfg.intervalMinutes * 60_000`.

3. **New `runOor`** — `evaluateTpSl(rt, bot, chatId, cfg, wallet, { includeOor: true })`. Same guard pattern as `runCycle`/`runFast` (skip if `running || !enabled`, set `running`, try/catch, finally reset). Runs on a new `oorFiber` at `intervalMinutes * 60_000`.

4. **`start()`/`stop()`** — add `oorFiber` alongside `intervalFiber`/`eventFiber`; stop it in both.

5. **`stopFiber` reuse** — `runOor` sets `running`; because all fibers share the flag, whichever starts first wins and the rest skip that tick. Same as current behavior, just one more fiber.

## Safety

- Shared `rt.state.running` flag prevents concurrent mutation of `rt.state.plans` (existing pattern).
- Guardrails still cap opens: `maxOpenPositions`, `txCooldownMs` between opens, `poolCooldownMs` (24h), budget checks.
- Screening runs at most every `txCooldownMs`, so the tx-cooldown gate inside `decideCandidates` is naturally satisfied.
- `Math.max(..., 60_000)` protects against `txCooldownMs: 0` in config producing a tight loop.

## Cost Note

LLM screening now runs every 5 min instead of every 15 min (3× more). Open frequency is still capped by `txCooldownMs` guardrails.

## Out of Scope

- No change to `intervalMinutes` semantics for OOR (still 15 min default).
- No change to TP/SL 60s cadence.
- No config schema changes (`txCooldownMs` already exists).
