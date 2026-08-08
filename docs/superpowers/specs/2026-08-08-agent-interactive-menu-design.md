# Agent Interactive Menu Design

## Goal

Make the `/agent` Telegram command interactive: inline keyboard buttons instead of only text subcommands. Follows the existing `menu.ts` pattern (`InlineKeyboard` + `callbackQuery` regex + `editMessageText`).

## Behavior

- `/agent` → reply with `formatStatus(rt.state, cfg)` text + `InlineKeyboard`:
  - `▶️ Start` (`agent:start`)
  - `⏹ Stop` (`agent:stop`)
  - `📊 Status` (`agent:status`)
  - `📒 Journal` (`agent:journal`)
  - `⬅️ Back` (`agent:main`)
- Callback handlers (all `ctx.answerCallbackQuery()` first):
  - `agent:start` → `rt.start()`, then show refreshed status + agent keyboard
  - `agent:stop` → `rt.stop()`, then show refreshed status + agent keyboard
  - `agent:status` → show `formatStatus` + agent keyboard
  - `agent:journal` → show `formatJournal(readJournal(5), 5)` + agent keyboard
  - `agent:main` → show `formatStatus` + agent keyboard
- All use `editMessageText` (edit current message, no new spam).
- Text subcommands (`/agent start`, `/agent stop`, `/agent status`, `/agent journal [n]`) kept as-is for fallback compatibility.

## Files

- `src/telegram/agent/commands.ts` — only file changed. Add `InlineKeyboard` import, keyboard builder, callback handlers.

## Testing

- No new unit tests (callback wiring requires live bot). Verify via `npm run check && npm run typecheck && npm test`.
