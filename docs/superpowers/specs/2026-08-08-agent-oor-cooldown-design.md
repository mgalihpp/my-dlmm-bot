# Agent OOR Decisions + Pool/Token Cooldown — Design

> Status: approved — implementation plan TBD

Date: 2026-08-08

## Problem

1. **OOR blind spot** — a DLMM position can drift out of range and stop earning fees. The agent's TP/SL check (`evaluateTpSl`) ignores `PositionPnLData.isOutOfRange` (already returned by the Meteora API), so OOR positions sit unnoticed until TP/SL triggers.
2. **No per-pool cooldown** — a pool that was closed or blocked can be screened, LLM-evaluated, and re-opened again the next cycle. The only existing throttle is a global `txCooldownMs` between any two opens. Wasted LLM tokens, repeated retries on the same pool/token.
3. **Scheduling bug** — `engine.ts` schedules two fibers (`intervalMinutes` and a hardcoded 60s event fiber), both calling `runCycle()`. The 60s fiber dominates, so cycles run ~every minute regardless of `intervalMinutes`. This explains rapid cycle numbers and `intervalMinutes` being effectively ignored.

## Approach (approved)

### 1. OOR → LLM decision, hold or close+zap-out

- In `evaluateTpSl` (per plan, after the existing TP/SL heuristic), collect positions where `pos.isOutOfRange === true`:
  `{ pool, poolName, positionAddress, pnlPct, minPrice, maxPrice, poolActivePrice }`.
- Throttle: evaluate OOR via LLM **at most once per `intervalMinutes`**, tracked with `lastOorEvalAt` in agent state. No new config key — reuses `agent.intervalMinutes`.
- LLM: new `requestPositionDecisions` in `src/telegram/agent/llm.ts` (same OpenAI-compatible provider pattern as `requestSignals`). Prompt lists each OOR position with pnl/price data; reply is a JSON array `[{pool, action:"hold"|"close", rationale}]`, validated (unknown pool → ignored, invalid action → treated as hold).
- Execution: `action:"close"` → `zap.closeAndZapOut(pool, positionAddress, WSOL_MINT)` (same path as TP/SL), record execution + journal entry (`action:"close"`), and **record pool cooldown** (`reason:"closed"`). `action:"hold"` → journal entry only.
- No API key / degraded LLM → every OOR position holds; no auto-close.
- Live line: `📉 OOR: N position(s) out of range → LLM...`, then per-position `✅`/`➖` result.

### 2. Pool + base-token cooldown

- **Config**: `agent.poolCooldownMs`, default `24 * 3_600_000` (24h).
- **State** (`src/telegram/agent/state.ts`): new `AgentState.cooldowns: AgentCooldown[]` where `AgentCooldown = { pool, poolName, baseMint, until, reason }`, persisted in `.vexis-agent.json`.
- **Recorded when**: a plan position is closed (TP/SL or OOR close), and when a pool is blocked in the decision loop (duplicate/risk/guardrail/cooldown) — same spots that already write `blockedReason`.
- **Applied**: after screening, filter out pools whose `pool` **or** `baseMint` matches an active cooldown entry, **before** ranking/LLM. Live line `⏳ N pool in cooldown, skipped`. Safety-net `checkPoolCooldown` in the decision loop guards against races.
- **Pruning**: expired entries removed each cycle.
- Pure helpers in `src/telegram/agent/guardrails.ts`: `filterCooldown(pools, cooldowns, nowMs)`, `checkPoolCooldown(pool, baseMint, cooldowns, nowMs)`, `recordCooldown(state, pool, baseMint, reason, nowMs)`.

### 3. "Stuck" indicator

- Show `🧠 LLM: thinking...` live line before `requestSignals` starts; replace with the result line when it returns.

### 4. Scheduling bug fix

- Remove the redundant 60s event fiber; cycle cadence becomes purely `intervalMinutes` (the intended behavior). `runCycle()` stays guarded by the `running` flag, so no double-run risk.

## Files touched

- `src/telegram/agent/llm.ts` — `requestPositionDecisions`, prompt builder, response parser.
- `src/telegram/agent/state.ts` — `cooldowns`, `lastOorEvalAt` fields; `AgentCooldown` type.
- `src/telegram/agent/guardrails.ts` — `filterCooldown`, `checkPoolCooldown`, `recordCooldown`.
- `src/telegram/agent/engine.ts` — OOR flow in `evaluateTpSl`, cooldown record/filter, LLM thinking line, remove event fiber.
- `src/telegram/agent/journal.ts` — extend `JournalAction` with `"close"`.
- `src/telegram/agent/format.ts` — render close/OOR/skipped lines (MarkdownV2-escaped, per existing `formatLive`).
- `src/domain/config.ts` + `src/services/Config.ts` — `poolCooldownMs`.
- `test/agent-guardrails.test.ts` (or new) — `filterCooldown`/`checkPoolCooldown` cases; `test/agent-llm.test.ts` — OOR response parser.

## Fallback semantics

- LLM degraded / no key → OOR positions hold (no close). Never force-close on missing data.
- Cooldown entry with null `baseMint` → only matches exact pool address.
- State file write failure → logged, bot continues (existing `saveState` behavior).

## Tests

- `filterCooldown`: pool match, baseMint match, expired entry, no match, pool+baseMint with null baseMint.
- `checkPoolCooldown`: active block, expired pass, unknown pool pass.
- OOR parser: valid JSON, invalid action → hold, unknown pool ignored, malformed response → empty.
