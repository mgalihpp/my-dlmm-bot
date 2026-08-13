# Agent UI/UX Fixes — Design

Date: 2026-08-10

## Goal

Fix five misleading/confusing UI/UX behaviors in the Telegram agent feature. No new
dependencies. Scope limited to the five items below.

## Fixes

### 1. State-aware Start/Stop buttons

Currently `agentKeyboard()` always renders both `▶️ Start` and `⏹ Stop` regardless of
whether the agent is running. The Stop button is meaningless when stopped and the Start
button is meaningless when running.

- Change `agentKeyboard()` → `agentKeyboard(enabled: boolean)`. When `enabled` is true
  render `⏹ Stop` only; when false render `▶️ Start` only. Portfolio/Journal buttons stay.
- `statusKeyboard(rt)` passes `rt.state.enabled`.
- `portfolioKeyboard()` → `portfolioKeyboard(enabled: boolean)`; the `agent:portfolio`
  handler passes `rt.state.enabled`.
- `editOrIgnore` drops its default `keyboard = agentKeyboard()` parameter — the keyboard
  arg becomes required. All existing call sites already pass an explicit keyboard.

### 2. Journal filter survives pagination

Paging (`agent:journal:page:N`) currently hardcodes `filter: "all"`, silently dropping a
user's active `closes`/`blocked`/`opens` filter.

- Change paging callback to `agent:journal:page:(-?\d+):(all|opens|closes|blocked)`.
- `journalKeyboard(page, totalPages, filter)` encodes the current filter into the
  ⬅️/➡️ buttons.
- Page handler parses the filter and passes it to `formatJournalPage`.
- Filter buttons keep resetting to page 0 (current behavior).

### 3. "🧼 Clear" stops the agent

`notif:clear` (on error notifications) only sets `running = false` and edits the message;
the agent stays enabled and keeps erroring.

- `notif:clear` calls `rt.stop()`, then edits the message to "🧼 Agent stopped." with a
  `▶️ Start` button (`agentKeyboard(false)`).

### 4. "⚠️ Retry" retries the failed action

`notif:retry` currently runs `runFast()` (a TP/SL pass) and replies "TP/SL check re-run"
even when the failed action was an open.

- Add `retryFailed(pool: string): Promise<string>` to `RuntimeAgent`. It finds the most
  recent journal candidate for `pool` with `execution === "failed"`:
  - action `open` → re-run the open flow for that pool (guardrails re-checked; if blocked,
    return the reason).
  - action `tp`/`sl`/`close` → find the pool's currently-open plan position and call
    `closeAndZapOut` again; if no open position, return a message saying so.
  - no failed candidate → return a message saying nothing to retry.
- `notif:retry` handler awaits `retryFailed(pool)` and replies with the returned message.
  The `actionId` passed in the button is already the pool address for failed actions.

### 5. `agent.enabled` config ↔ runtime sync

The config editor's `DLMM Agent On` toggle only writes the config file; the running agent
doesn't start/stop, so the two mechanisms desync.

- `registerConfigEditor(bot, rtAgent?)` accepts the runtime agent.
- In the `cfg:toggle` handler, after `updateConfig`, if the field is `agent.enabled`, call
  `rtAgent.start()` when now enabled, else `rtAgent.stop()`.
- `/agent start` and `/agent stop` commands also write `agent.enabled` to the config file
  (best-effort, wrapped in try/catch) so runtime and persisted config agree on restart.
- When `rtAgent` is absent (no chat ID configured), the toggle behaves as today.

## Files changed

- `src/telegram/agent/commands.ts` — fixes 1, 2, 3, 4 (handler + keyboard changes).
- `src/telegram/agent/engine.ts` — fixes 4, 5 (`retryFailed`, start/stop config write).
- `src/telegram/handlers/config-editor.ts` — fix 5 (runtime sync).
- `src/telegram/bot.ts` — fix 5 (pass `rtAgent` to `registerConfigEditor`).

## Error handling

- All new reply paths reuse existing `replyOrIgnore`/`editOrIgnore` best-effort helpers.
- `retryFailed` failures return a user-facing message; no exceptions escape the handler.
- Config writes on start/stop are best-effort; failures are logged, not thrown.

## Testing

- No existing tests cover the changed signatures. Add unit tests where pure logic exists:
  - `journalKeyboard` encodes filter in page callbacks (pure function).
  - `agentKeyboard` renders Start vs Stop based on `enabled` (pure function).
  - `retryFailed` decision (which failed candidate → open vs close) extracted as a pure
    helper if feasible.
- Run `npm run check && npm run typecheck && npm test`.
