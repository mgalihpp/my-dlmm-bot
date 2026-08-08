# Agent UX/Monitoring Suite — Design

> Status: approved — implementation plan TBD

Date: 2026-08-09

## Problem

The agent runs unattended but communicates poorly. Five gaps, all about visibility:

1. **No live progress** — during a cycle the user can't see what the agent is doing (screening, LLM thinking, decisions, tx). A live message exists (`liveSend` in `evaluatePlans`) but it's the only signal and is unconditional.
2. **Action notifications are thin** — a TP/SL close only sends the cycle summary, not an action message with pool, amount, PnL, reason, tx signature. Opens get a live line that only shows in the same message.
3. **Journal is hard to read** — `/agent journal` is a flat list with no stats, no filter, no pagination.
4. **No portfolio overview** — no single view of open agent positions, live PnL, deployed SOL, win rate.
5. **Silent failures** — LLM failures, tx failures, and whole-cycle crashes only hit the console log; Telegram never hears about them.

Goal: a level-gated notification system plus richer commands, so the user can watch the agent at the level of detail they want and know immediately when something goes wrong.

## Approach (approved)

### 1. Config: `agent.notifLevel`

- New `AgentConfig.notifLevel?: "verbose" | "normal" | "errors-only"`, default `"normal"`.
- Added to `ResolvedAgentConfig` in `resolveAgentConfigFrom` (`src/services/Config.ts`).
- Set via config file or the config editor agent page. Editor: new field `{ key: "agent.notifLevel", label: "Agent Notif Level", type: "string" }`; validate value against the three literals on save.

Level semantics:

| Level | Receives |
|---|---|
| `verbose` | everything: live, action, summary, error |
| `normal` | action, summary, error (no live step-by-step) |
| `errors-only` | error + action (important actions still surface) |

### 2. New module `src/telegram/agent/notify.ts`

Pure gate + thin sender, both exported:

- `allowed(cfgLevel: NotifLevel, tag: NotifTag): boolean` — `NotifTag = "live" | "action" | "summary" | "error"`. Mapping per table above. Pure, unit-testable.
- `notify(bot, chatId, cfgLevel, tag, msg)` — `sendMessage` only if `allowed`, silent skip otherwise. Reuses the existing `MD` parse mode from `src/telegram/utils.ts`.

### 3. Engine routing (`src/telegram/agent/engine.ts`)

All Telegram sends route through `notify` with an explicit tag, called at each call site with `cfg.notifLevel`. Rules per site:

- **Live step lines** in `evaluatePlans`: only produced when `allowed(cfg.notifLevel, "live")`; otherwise skipped (no live message started, no no-op `liveSend` calls). A small `liveStep` wrapper checks the gate once.
- **Cycle summary** at end of `evaluatePlans`: when `verbose` → `liveSend` edits the live message in place (current behavior); when `normal`/`errors-only` → fresh `sendMessage` via `notify(..., "summary", ...)`.
- **Per-tx failures** (open/close throws) are an action outcome: the action message carries the `❌ FAILED` prefix and is tagged `action`, so `errors-only` still surfaces them. The `error` tag is reserved for cycle-level crashes — the `runCycle` / `runFast` catch blocks and unexpected errors.

| Site today | Tag | Level |
|---|---|---|
| `liveSend` in `evaluatePlans` (screening, cooldown/dup skips, LLM thinking, decisions, open progress) | `live` | verbose |
| New per-action message (open / tp / sl / OOR close), incl. tx failures | `action` | normal+ |
| Cycle summary after full cycle (`formatCycleSummary`) | `summary` | normal+ |
| Cycle-level crashes (`runCycle` / `runFast` catch) | `error` | all |

**New action message `formatAction`** (`src/telegram/agent/format.ts`): one message per executed action, replacing the current "cycle summary on close" behavior. Fields: action, pool name, amount SOL, PnL% (closes), reason (tp/sl/OOR/LLM), tx signature. MarkdownV2-escaped per existing helpers.

**New error notifications**: wrap the `runCycle` / `runFast` catch blocks; send a `❌` message with the failure context (cycle number). LLM degradation stays console-only (it's not a failure, and the cycle summary already shows the degraded flag).

### 4. New module `src/telegram/agent/stats.ts` (pure)

PnL data lives in `.vexis-agent-signals.json` perf records (`closedAt`, `pnlPct`, `signals`), not the journal — so:

- `tradeStats(perf)` over `loadSignalWeights().perf` → `{ closes, wins, losses, winRate, avgPnlPct, bestPnl, worstPnl, totalPnlPct }`.
- `actionCounts(entries)` over journal entries → `{ open, hold, tp, sl, close, blocked, failed }`.

Both pure; no IO in the module itself. Callers pass data in.

### 5. Commands (`src/telegram/agent/commands.ts` + `format.ts`)

- **`/agent portfolio`** (+ `agent:portfolio` callback, new `📊 Portfolio` keyboard button): live overview. For each `state.plans` with a position address, call `api.positionPnl` (same pattern as `evaluateTpSl`); per position show pool, amount SOL, PnL% live, in-range/OOR. Totals: deployed SOL, unrealized PnL, win rate from `tradeStats`. Empty state when no plans.
- **`/agent status`** richer: add `notifLevel`, active cooldown count + first few entries, `tradeStats` summary line, last-cycle outcome. `agent:status` callback renders the same.
- **`/agent journal`** interactive: header line with `actionCounts` for the visible window; pagination via `agent:journal:page:N` (5 entries per page, `⬅️`/`➡️` buttons); filter toggle `agent:journal:filter:all|opens|closes|blocked` (opens = execution "ok", closes = tp/sl/close actions, blocked = guardrail "blocked"). Filter state resets when the message is re-rendered outside the callback.

### 6. Keyboard layout

```
[▶️ Start] [⏹ Stop] [📊 Status]
[📊 Portfolio] [📒 Journal]
```

`agentKeyboard()` updated; existing callbacks unchanged.

### 7. Drive-by

- Add `.vexis-agent-signals.json` to `.gitignore` (currently leaks trade PnL/signal data if committed). One-line change.

## Files touched

- `src/domain/config.ts` — `AgentConfig.notifLevel`.
- `src/services/Config.ts` — `ResolvedAgentConfig.notifLevel` + resolve default.
- `src/telegram/agent/notify.ts` — **new**: `allowed`, `notify`.
- `src/telegram/agent/engine.ts` — route sends through notify, error notifs, action messages.
- `src/telegram/agent/format.ts` — `formatAction`, `formatPortfolio`, richer `formatStatus`, journal page/filter rendering.
- `src/telegram/agent/stats.ts` — **new**: `tradeStats`, `actionCounts`.
- `src/telegram/agent/commands.ts` — `/agent portfolio`, interactive journal, keyboard.
- `src/telegram/handlers/config-editor.ts` — `agent.notifLevel` field.
- `.gitignore` — `.vexis-agent-signals.json`.
- `test/agent-notify.test.ts` — **new**: level × tag matrix.
- `test/agent-stats.test.ts` — **new**: fixtures for perf + journal.
- `test/agent-format.test.ts` — additions: `formatAction`, `formatPortfolio`, new status/journal rendering.

## Fallback semantics

- Telegram unreachable → every `notify` call is fire-and-forget try/catch; agent logic never depends on notification success (existing behavior preserved).
- Invalid `notifLevel` in config file → default `"normal"` (schema leniency, same as other agent fields).
- `positionPnl` failure in `/agent portfolio` → that position shows "PnL n/a" and the loop continues (same behavior as `evaluateTpSl`).
- Journal page out of range / filter yields nothing → "no entries" line, page buttons disabled.
- LLM degraded is NOT an error notification — the cycle summary shows it.

## Tests

- `notify.allowed`: 3 levels × 4 tags matrix.
- `stats.tradeStats`: all-wins, all-losses, mixed, empty perf.
- `stats.actionCounts`: empty, mixed actions, blocked/failed included.
- `format.formatAction`: open, tp, sl, OOR close, failed — all MarkdownV2-escaped.
- `format.formatPortfolio`: with live PnL, with n/a PnL, empty.
- `format.formatJournal`: pagination slice + filter behavior.
