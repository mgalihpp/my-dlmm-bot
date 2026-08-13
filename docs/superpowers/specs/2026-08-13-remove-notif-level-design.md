# Remove Agent Notif Level — Design

Date: 2026-08-13

## Goal

Remove the notification-level system from the DLMM agent. All agent notifications
(live, action, summary, error) are always sent — behavior equivalent to the old
`verbose` level.

## Backwards compatibility

`agent.notifLevel` in `vexis.config.json` remains accepted but ignored, following
the existing `minCandidate` deprecation pattern. No config-file errors for old
configs.

## Changes

### 1. `src/domain/config.ts`

- Keep `NotifLevel` type and `AgentConfig.notifLevel?: NotifLevel` field, but mark
  the field `@deprecated` (input-only, never read).

### 2. `src/services/Config.ts`

- Remove `notifLevel` from `ResolvedAgentConfig` (line 133).
- Remove the `notifLevel: a.notifLevel ?? "normal"` resolution (line 159).

### 3. `src/telegram/agent/notify.ts`

- Remove `NotifTag`, `TAG_LEVELS`, and `allowed()`.
- New signature: `notify(bot, chatId, msg, opts?)` — unconditional send
  (fire-and-forget error swallowing unchanged).
- Keep `NotifKeyboardTag` and `notifyKeyboard` unchanged.

### 4. `src/telegram/agent/engine.ts`

- Remove both `allowed(cfg.notifLevel, "live")` gates (lines 142, 968).
- `liveStep(bot, chatId, live, msg)` drops the `cfg` param (~12 call sites).
- All `notify(bot, chatId, cfg.notifLevel, <tag>, msg, opts)` calls become
  `notify(bot, chatId, msg, opts)` (~13 call sites, incl. the summary call at
  line 1366).

### 5. `src/telegram/agent/format.ts`

- Line 32: drop `\| notif ${...}` from the status line.
- Line 429: drop the `Notif level ${...}` line from `formatConfigQuick`.

### 6. `src/telegram/handlers/config-editor.ts`

- Remove the `agent.notifLevel` enum menu item (lines 265–270).

### 7. Tests

- `test/agent-notify.test.ts`: remove the `allowed` describe block and the
  "skips silently when gated out" test; update `notify` calls to the 3-argument
  signature.
- `test/agent-config.test.ts`: remove the notifLevel default test.
- `test/agent-format.test.ts`: remove `notifLevel` from fixtures; update the
  "adds notif level and trade stats" (line 201) and "renders budget, TP/SL and
  notif level" (line 503) tests.
- `test/agent-guardrails.test.ts` and `test/agent-llm.test.ts`: remove
  `notifLevel` from fixtures.

## Verification

`npm run check && npm run typecheck && npm test`
