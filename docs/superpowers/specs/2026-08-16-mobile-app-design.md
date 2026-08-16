# Mobile App (Expo) — Design

Date: 2026-08-16

## Purpose

A native mobile app for vexis-dlmm-bot: full parity with the Telegram bot (all views + all on-chain actions), built with Expo (React Native). Android first, iOS later on the same codebase. Private keys stay on the VPS — the phone is a remote control. Push notifications for alerts and agent events.

## Decisions

- Stack: Expo (managed workflow) + TypeScript + React Navigation. Android first, iOS later.
- Backend: extend the existing Effect web server (`src/web/`) with JSON endpoints. One process, one port, one pm2 deploy.
- Key custody: keys stay on the VPS. The web process executes on-chain actions using the keypair from config, reusing the same `dlmm` / `zap` / `tpsl` / config services the Telegram handlers use. No key material ever reaches the phone.
- Auth: dashboard password → HMAC-signed bearer token (reuses the existing HMAC approach in `src/web/auth.ts`), stored in the app's SecureStore.
- Actions mirror Telegram: confirmation is client-side (summary → confirm → POST).
- Push: Expo push service. Token registered via `/api/push/register`; server sends push at the same trigger points as Telegram alerts. Push works only while the bot/web process is running (same limitation as Telegram alerts today).
- v1 target: full Telegram parity (views, actions, config editor), delivered in phases. No app-store distribution in v1 (Expo Go / dev build on a phone).

## Architecture

```
┌──────────────┐   HTTPS    ┌─────────────────────────┐   Solana RPC / Meteora API
│  Expo app    │ ─────────▶ │  VPS: existing web       │
│  (Android    │            │  server (Effect, port 8080)│
│   first)     │ ◀───────── │  ├─ existing HTML pages  │
│  React Nav + │   JSON     │  ├─ NEW /api/* endpoints │
│  SecureStore │            │  └─ NEW /api/actions/*   │
└──────────────┘            └─────────────────────────┘
```

- JSON endpoints live in the same `HttpRouter` as the dashboard pages (`src/web/server.ts` → `buildRouter`).
- JSON endpoints call the same services the Telegram handlers call through `src/telegram/fx.ts` (`api`, `dlmm`, `zap`) plus tpsl state (`.vexis-tpsl.json`), config update, agent state/journal, watchlist, alerts — no new execution logic, no grammY dependency in the API.
- Cross-process consistency with the bot (TP/SL watcher, agent engine) is file-based, exactly as it is today: the web process writes the same state files the bot process reads.

## Mobile app structure

New `app/` directory, Expo managed workflow:

```
app/
├── App.tsx                    # Navigation container + auth gate
├── src/
│   ├── api/client.ts          # fetch wrapper: base URL + token + typed errors
│   ├── api/types.ts           # response types (mirror server schemas)
│   ├── auth/                  # login screen, token storage (SecureStore)
│   ├── screens/
│   │   ├── Portfolio.tsx      # summary cards + open/closed positions
│   │   ├── Pools.tsx          # screening table + timeframe filter
│   │   ├── Balance.tsx
│   │   ├── Agent.tsx          # status + journal + narrative
│   │   ├── Watchlist.tsx
│   │   ├── Alerts.tsx
│   │   ├── Config.tsx         # config editor (full parity)
│   │   └── actions/           # close, create, addliq, removeliq, tpsl wizards
│   ├── components/            # cards, badges, sparkline, confirm sheet
│   └── store/                 # lightweight state (React context / zustand)
```

Behavior:

- Bottom tab bar (Portfolio / Pools / Balance / Agent / More) + stack navigation into actions.
- Pull-to-refresh everywhere; no auto-polling in v1.
- Every action opens a confirm sheet showing the summary (pool, amounts, range, quoted cost where applicable) — mirrors the bot's confirmation text.
- Tx signatures link out to Solscan.
- Push registration: on login, app sends its Expo push token to `/api/push/register`.

## API surface

### Auth

- `POST /api/login` with dashboard password → `{ token }` (HMAC-signed, 30-day expiry, secret derived from password as in `auth.ts`).
- All `/api/*` routes require `Authorization: Bearer <token>`; invalid/expired → 401.
- `POST /api/logout` optional (token is stateless; client deletes it).

### View endpoints (GET)

| Endpoint | Data |
|---|---|
| `/api/portfolio` | total/open/closed PnL summary |
| `/api/positions` | open positions w/ live ranges + PnL |
| `/api/closed-positions` | closed positions, paginated |
| `/api/pools?timeframe=&limit=` | screening results |
| `/api/balance` | SOL + token balances |
| `/api/agent` | agent status + journal + narrative |
| `/api/watchlist` | watched wallets + positions |
| `/api/alerts` | alert configs + status |
| `/api/config` | current config |

### Action endpoints (POST)

All execute via existing services; all return `{ ok, txSignature?, message }`; failures return typed errors (existing tagged errors).

| Endpoint | Behavior |
|---|---|
| `/api/actions/close` | close position → tx sig |
| `/api/actions/claim-fee` | claim fee → tx sig |
| `/api/actions/claim-reward` | claim reward → tx sig |
| `/api/actions/create` | quote first, then create position |
| `/api/actions/add-liquidity` | add liquidity → tx sig |
| `/api/actions/remove-liquidity` | remove liquidity → tx sig |
| `/api/actions/tpsl` | set/clear TP-SL per position |
| `/api/actions/agent` | agent on/off |
| `/api/actions/watchlist` | add/remove wallet |
| `/api/actions/alerts` | set/stop alert |
| `/api/actions/config` | update config fields |

## Push notifications

- Server: `src/web/push.ts` — stores Expo push tokens in gitignored `.vexis-push-tokens.json`; sends via Expo HTTP API.
- Trigger points: alert events (price / TP-SL / watchlist, from the alert scheduler paths) and agent cycle outcomes (opens, closes, blocks, errors — the existing notify paths). Daily briefing stays Telegram-only.
- App: `expo-notifications`; notification tap navigates via data payload `{ screen }`.

## Phasing

Each phase ends runnable and verified (`npm run check && npm run typecheck && npm test`):

1. API skeleton — token auth, `/api/portfolio`, `/api/positions`, `/api/pools`, error format + tests
2. Expo app core — login, tabs, Portfolio + Pools screens
3. Views parity — Balance, Agent, Watchlist, Alerts, Config screens + endpoints
4. Actions — close / claim-fee, then tpsl, agent toggle, watchlist/alerts/config writes
5. Wizards — create, addliq, removeliq (quote → confirm → submit)
6. Push — token registration + notification wiring

## Testing

- API route handlers: unit tests with fixture data — status codes, JSON shapes, auth rejection (401 on missing/tampered/expired token).
- Auth token: sign/verify roundtrip, tamper, expiry.
- Action validation: invalid params rejected before any execution.
- App: manual testing via Expo Go / dev build; no jest in v1.
- No live network / RPC / wallet in tests (repo convention).

## Wiring & deploy

- Same pm2 process (`vexis-web`). No new config fields (token secret derived from the existing dashboard password).
- App base URL configurable via an `app.json`/`app.config.ts` field (default `http://<vps>:8080`).

## Out of scope (v1)

- iOS App Store / Google Play distribution
- App auto-polling / websockets (pull-to-refresh only)
- Push for the daily briefing
- Biometric unlock (expo-local-authentication can be added later)
- Multi-account / multi-VPS support
