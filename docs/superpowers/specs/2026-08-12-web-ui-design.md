# Web UI (Read-Only Dashboard) — Design

Date: 2026-08-12
Branch: `feat/web-ui`

## Purpose

A minimal, server-rendered web dashboard for the vexis-dlmm-bot. Read-only: monitoring portfolio, pool screening results, and AI agent history. No on-chain operations. Runs as a separate process on the same VPS as the bot, protected by a password login.

## Decisions

- Stack: Effect `HttpServer` (`@effect/platform-node`, already a dependency) + server-rendered HTML + htmx via CDN for auto-refresh. No frontend framework.
- Data: reuse existing Effect services through the shared `AppLayer` — zero changes to existing service code.
- Charts: inline SVG sparklines only, no chart library.
- Auth: password → HMAC-signed session cookie, no auth library.
- v1 pages: Portfolio, Pools, Agent. No watchlist page, no config editor, no on-chain actions.

## Architecture

New `src/web/` module, compiled by tsc along with the rest of the project:

```
src/web/
├── server.ts        # Entry: Effect HttpServer + routing + auth guard middleware
├── auth.ts          # Login/logout, HMAC cookie sign/verify, timing-safe password compare
├── layout.ts        # HTML shell, nav, escapeHtml helper, error banner render
├── api.ts           # JSON endpoints for partials (htmx targets) — testable
├── templates.ts     # Pure HTML render functions per component (cards, tables, badges, sparkline)
└── pages/
    ├── portfolio.ts # /portfolio page + /partials/portfolio
    ├── pools.ts     # /pools page + /partials/pools
    └── agent.ts     # /agent page + /partials/agent
```

Routes:

| Route | Description |
|---|---|
| `/login` | GET form, POST verify → set cookie; redirect to `/` |
| `/logout` | Clear cookie, redirect to `/login` |
| `/` | Redirect to `/portfolio` |
| `/portfolio` | Portfolio page (full shell) |
| `/partials/portfolio` | Portfolio content only (htmx refresh target) |
| `/pools` / `/partials/pools` | Pools page / partial |
| `/agent` / `/partials/agent` | Agent page / partial |

All routes except `/login`, `/logout`, `/static/*` require a valid session cookie; invalid/absent → redirect to `/login`.

## Config

New section in `vexis.config.json` (added to `VexisConfig` in `src/domain/config.ts` via `Effect.Schema`):

```json
{
  "web": {
    "enabled": false,
    "port": 8080,
    "password": "rahasia"
  }
}
```

- `VEXIS_WEB_PASSWORD` env var overrides `password` (priority: env > config).
- `enabled: false` (default) → server does not start. `src/web/server.ts` exits with a message.
- Port default 8080 when omitted.

## Auth

- POST `/login` compares submitted password with configured password using `crypto.timingSafeEqual` (hash both first to normalize length).
- On success: set cookie `vexis_session` = base64(payload) + "." + HMAC-SHA256 signature, using a secret derived from the password (`createHmac("sha256", password)`). Expires in 24h. `HttpOnly`, `SameSite=Lax`.
- Every request (except login/logout/static) validates the cookie signature and expiry; failure → 302 to `/login`.
- GET `/logout` sets an expired cookie.

## Pages

### /portfolio

Data flow (same as Telegram `/portfolio`, `/open`, `/closed` handlers):

1. `api.totalPnl(wallet)` → summary cards
2. `api.openPortfolio(wallet, 1, 10)` → `enrichOpenPortfolioPnl(..., { withRanges: true })` → `dlmm.attachLivePositions`
3. `api.closedPortfolio(wallet, 1, 10)`

Render:

- Summary cards: total PnL (USD + SOL), realized/unrealized PnL, fee earnings
- Open positions table: pool, current price, PnL% (green/red), fee earned, in-range / out-of-range badge, link to `app.meteora.ag`
- Closed positions table: pool, realized PnL, fee earned, date
- Empty states for each table (e.g. "No open positions")

### /pools

Data flow: `screening.screen({ timeframe, displayLimit })` — already includes rugcheck + Jupiter enrichment.

Render:

- Timeframe dropdown (5m, 30m, 1h, 2h, 4h, 12h, 24h) — GET form, reload page on submit; the only interactive filter in v1
- Pools table: pool, price, market cap, TVL, volume, fee, bin step, organic score, rug score, price vs ATH %, trend
- `displayLimit` from config (or override via `?limit=`)
- Error banner with retry on failure

### /agent

Data flow: `readJournalAll()` from `.vexis-agent-journal.jsonl` + agent state from `.vexis-agent.json`.

Render:

- Stats cards: total cycles, opens, holds, blocked (guardrail), TP/SL fired, failed executions, success rate
- Journal table: per cycle — timestamp, llmStatus, candidates (pool, action, guardrail pass/blocked + reason, execution ok/failed, tx signature link to Solscan)
- Sparkline (inline SVG) of open/blocked counts per cycle when journal has enough entries

## Auto-refresh (htmx)

- Pages include htmx from CDN (`https://unpkg.com/htmx.org@1.9.x`)
- Content regions wrap the partial endpoints: `hx-get="/partials/<page>"`, `hx-trigger="every 30s"`, `hx-swap="outerHTML"`
- Refresh aborts while a request is in flight (htmx default) and does not disturb scroll position of other content
- Auto-refresh only for portfolio + agent; pools refresh on demand (filter form) — polling a screening call every 30s is wasteful (multiple external API calls per request)

## Error handling

- Every page fetch wrapped in `Effect.either`; on failure render an inline error banner with a retry link/button, never a 500 crash.
- Template render functions are pure: input → HTML string, with all dynamic values passed through `escapeHtml`.
- Errors shown with short friendly message; technical detail hidden from page, logged to console.

## Testing

`test/web-*.test.ts`, no live API calls (matches existing test conventions):

- `templates`: render functions with inline fixture data — assert structure, escaping, empty states
- `auth`: cookie sign/verify roundtrip, tampered cookie rejected, expired cookie rejected, timing-safe compare behavior
- Pools/portfolio/agent page render: pure functions with fixture ScreenResult / journal entries

## Wiring & Deploy

- `package.json`: `"web": "tsx src/web/server.ts"`, `"web:start": "node dist/web/server.js"`
- `vexis.config.example.json`: add `web` section example
- README: short "Web UI" section (config, run, pm2/Docker), matching existing doc style
- Deploy: `pm2 start "npm run web:start" --name vexis-web` — separate process from the bot

## Verification

`npm run check && npm run typecheck && npm test` must pass before completion.

## Out of scope (v1)

- Watchlist page (service exists, not wired)
- On-chain actions (read-only by decision)
- Editing screening filters from UI (filters come from config file)
- Chart library (SVG inline only)
- WebSocket/SSE (30s htmx polling only)
