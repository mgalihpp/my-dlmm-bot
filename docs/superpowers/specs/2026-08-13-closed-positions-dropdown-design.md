# Closed Positions Per-Pool Detail Dropdown

**Date:** 2026-08-13
**Status:** Approved (brainstorm)

## Problem

The web dashboard's Closed Positions table shows one aggregate row per pool (total
Deposit / Withdraw / Fees / PnL across every position ever closed in that pool).
When the user closes multiple positions in the same pool, the individual
position-level breakdown is invisible. The user wants to drill into each pool's
closed positions individually.

## Requirements

- Keep the aggregate per-pool rows as they are today (web, CLI, Telegram unchanged).
- On the **web dashboard only**, add an expand/collapse chevron to each Closed
  Positions row. Expanding shows the individual closed positions for that pool,
  each as its own row: deposit, withdraw, fees, PnL USD, PnL SOL, closed time,
  and a short position address.
- Details are fetched **on demand** (when a row is expanded), not for all pools
  at page load.
- CLI (`vexis closed`) and Telegram (`/closed`) remain as-is (aggregate per pool).

## Current Architecture

- `GET /portfolio` (Meteora API) returns `ClosedPool[]` — one entry per pool with
  `totalDeposit`, `totalWithdrawal`, `totalFee`, `pnlUsd`, `pnlSol`,
  `pnlPctChange`, `lastClosedAt` (aggregated server-side).
- `src/web/pages/portfolio.ts` `renderClosed()` renders one table row per
  `ClosedPool`.
- The portfolio page auto-refreshes every 30s via htmx
  (`hx-get="/partials/portfolio"`), which swaps the whole `#page-content` region.
- `api.positionPnl(poolAddress, wallet, status)` already exists and is exposed on
  the `MeteoraApi` service (`src/services/MeteoraApi.ts:238`). With
  `status: "closed"` it returns per-position data: `positionAddress`,
  `allTimeDeposits.total.usd`, `allTimeWithdrawals.total.usd`,
  `allTimeFees.total.usd`, `pnlUsd`, `pnlPctChange`, `pnlSol`,
  `pnlSolPctChange`, `closedAt`, `isClosed`.

## Design

### 1. Detail row rendering (pure function)

New exported function in `src/web/pages/portfolio.ts`:

```
renderClosedDetail(pool: ClosedPool, positions: readonly PositionPnLData[]): string
```

- Filters to `isClosed === true`.
- Returns a nested table: `Position | Deposit | Withdraw | Fees | PnL USD | PnL SOL | Closed`.
- Deposit/Withdraw/Fees come from `allTimeDeposits.total.usd`,
  `allTimeWithdrawals.total.usd`, `allTimeFees.total.usd`.
- PnL USD cell shows value + pct sub-line (same pattern as the aggregate table),
  PnL SOL with sign color, closed time via `tsLocal(pos.closedAt)`.
- Position cell: short address (`shortAddr`) linking to Solscan position page.
- Empty result → a muted "No closed positions" line.
- Pure (no I/O) so it is unit-testable.

### 2. Expand/collapse interaction

- Each aggregate row gets a chevron button in the Pool cell:
  `<button class="chevron" data-closed-detail="/partials/closed-positions?pool=ADDR" ...>▸</button>`.
- Each pool row is followed by a hidden detail row:
  `<tr class="detail-row" hidden></tr>`.
- Small vanilla JS (appended to the rendered portfolio HTML) handles the click:
  - first click → `fetch()` the partial URL, inject HTML into the detail row,
    mark it loaded and show it (chevron rotates);
  - subsequent clicks → toggle visibility only (no re-fetch).
- On the 30s htmx auto-refresh the detail rows collapse (documented, acceptable
  behavior — re-expanding re-fetches).

### 3. New route

In `src/web/server.ts` `buildRouter()`:

```
HttpRouter.get("/partials/closed-positions", closedDetailRoute)
```

- Reads `pool` query param.
- `Effect.gen`: get wallet from config → `api.positionPnl(pool, wallet, "closed", 1, 100)`
  → `renderClosedDetail(...)` → `HttpServerResponse.html(...)`.
- Errors → `errorBanner(...)` HTML (shown inside the expanded row).
- No wallet/pool → empty string response.

### 4. Styling

Add to `src/web/theme.ts`:

- `.chevron` — inline button, rotates 90° when `.open`.
- `.detail-row` — background offset, `.detail-row.open` visible.
- `.detail-table` — compact nested table.

## Files Changed

| File | Change |
|---|---|
| `src/web/pages/portfolio.ts` | `renderClosedDetail()` + chevron/detail-row markup in `renderClosed()` + inline JS + `closedPositionsContent` effect |
| `src/web/server.ts` | new `/partials/closed-positions` route |
| `src/web/theme.ts` | chevron/detail styles |
| `test/web-portfolio-page.test.ts` | unit tests for `renderClosedDetail` |

## Edge Cases

- Pool with no closed positions via the pnl endpoint → muted empty message.
- Position with `closedAt: null` → "-".
- `pnlSol: null` → "-".
- API error for one pool → error message inside the expanded row; page otherwise unaffected.
- Detail fetch respects same-origin session cookie (auth already required for all routes except /login, /logout, /health).

## Out of Scope

- CLI / Telegram closed views stay aggregate per pool.
- No changes to `ClosedPool` domain type or the Meteora API layer (reuses `positionPnl`).
