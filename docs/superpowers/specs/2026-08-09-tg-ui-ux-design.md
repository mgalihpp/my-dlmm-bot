# Telegram Hub-and-Spoke UI/UX — Design

> Status: approved (brainstorming) — implementation plan TBD

Date: 2026-08-09

## Problem

The bot works but the Telegram experience is disjointed:

1. **No hub** — `/menu` renders a flat five-button keyboard; agent state lives behind a separate `/agent`. To see agent status + portfolio + everything else you switch between several messages.
2. **Agent status is text-only** — `agent status` dumps config, cooldowns, plans, and trade stats into one long MarkdownV2 block with no health dot, no budget bar, no way to tap a plan into its position.
3. **No drill-down** — open plans cannot be opened into a position detail (PnL, range, fees, Meteora link); every detail needs a separate command.
4. **Notifications are plain text** — action messages (open / tp / sl / close) carry no buttons, so acting on them means leaving the notification and running commands elsewhere.
5. **Journal** — already supports pagination + filter chips; the remaining friction is only cosmetic (no per-entry cycle drill-down needed).

The follow-up layer the previous `agent-ux-monitoring` spec shipped (level-gated notifications, `/agent portfolio`, interactive journal, `formatAction`) stays; this spec adds navigation, glanceability, and inline actions on top.

## Goals / non-goals

**Goals:** one-glance dashboard hub; agent status with visual budget bars and per-position drill-down; rich position detail; rich action notifications with quick-action keys; config quick-view. Consistent `⬅️` back + `🔄` refresh and/or every fetched screen.

**Non-goals:** no rebuild of existing screens; no change to agent decision logic or guardrails; no new data sources; `/manage`, `/create`, existing alerts/watchlist screens keep their current flows (only the back-link wiring changes to return to the hub).

## Architecture (Hub & Spoke)

```
            Hub                     Spokes                 Detail
   ┌──────────────┐    ┌──────────────────────┐   ┌───────────────────────────┐
   │  dashboard   │───▶│ agent → status            │──▶ agent:pos:<actionId>       │
   │  (menu)      │    │        portfolio          │       position detail (PnL,   │
   └──────────────┘    │        journal            │       fees, range bar, links)│
                       │        config quick-view │   └───────────────────────────┘
                       └──────────────────────┘      notif → pnl / cooldown / retry
```

- **`/menu`** renders the dashboard hub (replacing the current flat button list).
- **`/dashboard`** added as a new alias of `/menu`, and wired into `setMyCommands` and the `/start` reply.
- Every spoke screen shows `⬅️ Back` (to the hub or parent spy) and `🔄 Refresh` where the data is fetched.
- New render helpers live in `agent/format.ts` as pure functions (unit-testable); the dashboard grid table lives in `dashboard.ts` (still pure, no IO).

## Memory detail

### 1. Dashboard hub (new `src/telegram/dashboard.ts`)

Header (agent health + budget bar) + two-column action grid.

```
═════════════════════════════════
🤖 VEXIS DLMM AGENT
🟢 Online · cycle 03 · run last 09:41
─────────────────────────────────
💰 Deployed 2.4 ◎ of 5.0 ◎
📈 PnL +12.4% (🟢) · win 62% (8)
██████████░░ 48% budget
─────────────────────────────────
[ 🤖 Agent ] [ 📊 Portfolio ]
[ 📒 Journal ] [ 📈 Open ]
[ 📉 Closed ]  [ 🔥 Pools ]
[ ⚡ Manage ]  [ 🔔 Alerts ]
[ 👁️ Watch ]   [ ⚙️ Config ]
[ 🔄 Refresh ] [ ⬅️ Menu ]
═════════════════════════════════
```

Health dot: `🟢` enabled + running, `🟡` enabled but never-a-cycle yet, `🔴` last cycle error, `⚫` stopped.

Budget/abs: `deployed = state -> sum(plans.amountSol)`; `max = cfg.maxTotalSol`; bar of 16 cells. When the brand-new never ran, header falls back to `🟡 idle` and blank rows.

Callbacks registered in `dashboard.ts` itself (self-contained spokes):
- `dash:agent` → the `/agent` status page (from `agent/commands.ts`)
- `dash:portfolio` → existing menu portfolio
- `dash:journal` → existing agent journal
- `dash:open` / `dash:closed` → existing menu portfolio views
- `dash:pools` → existing `menu:pools`
- `dash:manage` → existing `mng:pools`
- `dash:alerts` / `dash:watch` → existing screens
- `dash:config` → new config quick view
- `dash:refresh` → re-render hub in place
- `menu:main` still returns to the hub.

### 2. Agent status drill-down (`agent/commands.ts`, `agent/format.ts`)

`formatStatus` header reuses `formatDashboardHeader`; the OPEN POSITIONS rows each become a tappable row carrying `agent:pos:<actionId>`.

```
🤖 DLMM AGENT          │ 🔄
🟢 RUNNING · cycle 12 · last 09:41
Budget   ████████░░ 68% (2.45 / 3.6 ◎)
Open     ███░░░░░░░ 3/5
Win rate 🟢 62% (8 closed) · avg +4.1%
TP 15% · SL 8% · notif verbose

📦 OPEN POSITIONS
1. SOL/JUP  1.0 ◎ ▢ +12.4%   [agent:pos]
2. SOL/USDC 0.8 ◎ ▲  +2.1%   [agent:pos]
3. PYTH/W  0.3 ◎ ▼ -3.2% OOR [agent:pos]

[ ▶️ Start ] [ ⏹ Stop ] [ 📊 Portfolio ]
[ 📒 Journal ] [ ⬅️ Dashboard ]
```

For each plan with a `positionAddress`, we `registerAction(pool, position)` on render and put the returned `actionId` in the button callback (existing `action-store` so state is transient in-memory, auto-cleaning stale keys).

Position detail view (new `agent:pos:<actionId>` callback) reuses `poolDetail`/`positionPnl` from `pool-position-selector.ts`:

```
📦 SOL/JUP · 1.0 ◎
PnL +12.4% (+0.125 ◎)
range ▰▱▱▱▱▱▱▱▱▱ (0.5 .. 2.2)
  ▲ in range · fees 0.02 ◎ unclaimed
🔗 Meteora 9xUH1kXa..

[ 🔄 ] [ 🙂 View on Meteora ] [ ⬅️ Back to status ]
```

`formatRangeBar(price, min, max)` → up to 20-unit bar of `▰/▱`, highlight apex at price; if price below- min → `▼ below range`, above- max → `▲ above range`.

### 3. Rich-action notifications (`agent/notify.ts`, `agent/format.ts`, `agent/engine.ts`)

`notify()` gains an optional `reply_markup` param (passed through when non-empty). Each action sender (in `engine.ts`) attaches the matching keyboard:

| Tag | Keyboard (buttons → callback) |
|---|---|
| `open` | `📊 PnL → notif:pnl:<actionId>` · `📒 Journal → notif:journal` |
| `tp`/`sl` | `📒 Journal → notif:journal` |
| `close` (oor) | `📊 PnL → notif:pnl:<actionId>` · `📒 Journal → notif:journal` |
| `failed` | `⚠️ Retry → notif:retry:<actionId>` |
| `error` (cycle) | `🧼 Clear → notif:clear` |

- `notif:pnl` re-renders a rich outcome card (re-using the pool + position cache already stored; calls `positionPnl` for a fresh read).
- `notif:journal` → jumps to the journal overview (existing callback).
- `notif:retry` → re-runs `evaluatePlans` for that plan (needs `runCycle`), posts result `[retry→ok/failed]`.
- `notif:clear` → resets `rt.state.running`/`error` flags, marks state clean, DMs "state cleared".

Keyboards respect the existing `allowed(level, tag)` gate: `errors-only` users still get Retry/Clear but not Journal/PnL spam; `verbose` sees everything.

### 4. Journal & config

- **Journal**: already shipped with chips + pagination; no changes in this spec (only route `dash:journal` to the existing callback).
- **Config quick-view** (`dash:config`): static read of current values with copy of profile

```
⚙️ AGENT CONFIG
Budget/size  2.45 / 5.0 ◎ · slot 250 ◎
TP 15% · SL 8% · max 5 open
Notif level verbose
LLM ok · last think …
[ Profile: default  (set+) ]  [ ⬅️ Dashboard ]
```

No editing here — editing stays in `/config` (existing).

## Interfaces

- `dashboard.ts` exports `registerDashboard(bot: Bot)` — wires `/menu`, `/dashboard`, hub grid, refresh.
- `agent/format.ts` adds:
  - `formatDashboardHeader(state, cfg, max, deployed, stats): string`
  - `formatRangeBar(price, min, max): string`
  - `notifKeyboard(tag: "open" | "tp" | "sl" | "close" | "failed" | "error", actionId?): InlineKeyboard | null` (null → no keyboard/plain text)
  - `formatNotifCard(tag, msg, pnlFields?): string`
- `agent/notify.ts` changes signature to `notify(bot, chatId, level, tag, msg, opts?: { keyboard?: InlineKeyboard })`.
- `agent/engine.ts` passes keyboard only for action/error sends.

## Data flow

1. `/menu` → hub → any spoke (in place edit).
2. `agent` status page: reads `rt.state` + resolved config; the Open rows' PnL values are the result of per-plan `positionPnl` calls (same network cost as `/agent portfolio`). The dashboard header itself uses only arithmetic on `state.plans` + config — no network. Position detail adds one `positionPnl` per tapped plan.
3. Notification tap → callback → brief `positionPnl`/journal/`runCycle` (retry) → edit the notif message in place.

Fallbacks:

- Telegram unreachable → fire-and-forget (`notify` already wraps in try/catch).
- Stale `actionId` (restarted bot) → `action-store` misses → "expired, /manage again" (existing behavior).
- Never-run agent → hub/status show 🟡 + blank portfolio rows; buttons for opens are absent.
- `positionPnl` error in detail → `PnL n/a` block, rest renders (same tolerance as `/agent portfolio`).

## Files touched

| File | Change |
|---|---|
| `src/telegram/dashboard.ts` | **new** — hub, `/menu`+`/dashboard`, refresh, grid |
| `src/telegram/menu.ts` | `/menu` → delegate; back target points to dashboard |
| `src/telegram/agent/format.ts` | new pure helpers: header, range bar, row PnL chips, notif card + keyboard |
| `src/telegram/agent/commands.ts` | `agent:pos:*`, `dash:config`, `notif:*` callbacks; status rows use action keys |
| `src/telegram/agent/engine.ts` | `notify` calls pass keyboard (action/error); retry path |
| `src/telegram/agent/notify.ts` | accept optional keyboard; pass-through |
| `src/telegram/bot.ts` | register dashboard; `/dashboard` + `/start` to hub |
| `test/agent-format.test.ts` | header, range bar, notif card, keyboard set |
| `test/telegram-dashboard.test.ts` | **new** — hub render + grid mapping (pure) |

## Edge cases / fallback semantics (summary)

- Health dot computed from `state` alone — no fetch, fails closed (shows `⚫`/`🟡` whenever uncertain).
- Bar rendering uses Unicode block/ shade cells — safe in Telegram across platforms.
- If `rt.state.plans` empty, `OPEN POSITIONS` section hidden entirely, not `[ ]`.
- `dash:config`: if multiple profiles configured, profile line is dropped (only first shown) — no multi-profile UI this pass.
- Journal/dashboard renderers capped under 4096 by keeping rows compact; if a render would overrun, truncate with `…` as the journal does today.