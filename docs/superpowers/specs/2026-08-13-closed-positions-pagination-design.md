# Closed Positions Pagination + PnL SOL % — Design

Date: 2026-08-13

## Purpose

The web dashboard's Closed Positions section currently fetches only the first 10 closed pools (`closedPortfolio(wallet, 1, 10)`) with no way to reach older history. This adds server-side pagination for that table, and shows the PnL SOL percentage that the API already returns but the UI drops.

## Decisions

- **Pagination is server-side and API-backed** — each page hits `closedPortfolio(wallet, page, 10)`, mirroring the existing Agent Log pagination (`src/web/pages/agent.ts` `paginationLinks`). No client-side fetching of all pages.
- **Page param: `closedPage`** on `/portfolio` and `/partials/portfolio`, parsed and validated identically to the existing `page` param on `/agent` (safe integer > 0, fallback 1).
- **Page size stays 10** (current value).
- **Refresh path preserves the page** — when `closedPage > 1`, the content region's `hx-get` becomes `/partials/portfolio?closedPage=N` so the 30s auto-refresh does not reset to page 1.
- **PnL SOL % shown in both closed tables** — main closed pools table and the expandable per-pool positions detail, styled like the Open Positions PnL SOL cell (value + colored `%` sub-line).

## Changes

### `src/web/pages/portfolio.ts`

- `portfolioContent` takes `{ closedPage?: number }` (default 1); passes it to `api.closedPortfolio(wallet, closedPage, 10)` and keeps the `ClosedPortfolioResponse` (for `totalCount`) alongside the pools.
- `renderPortfolio` gains a closed-page/closed-total param; `renderClosed` renders prev/next links below the table using the agent.ts pattern:
  `‹ prev · showing 1–10 of 87 · next ›`, links to `/portfolio?closedPage=N` (prev/next disabled at bounds).
- Closed pools table PnL SOL cell: add `<div class="sub">${fmtPct(pool.pnlSolPctChange)}</div>` with `pnlClass` coloring (field already exists on `ClosedPool`).
- `renderClosedDetail`: same % sub-line under `pos.pnlSol` using `pos.pnlSolPctChange` (nullable → `-`).

### `src/web/server.ts`

- Parse `closedPage` query param (same validation as agent `page`) on both `/portfolio` and `/partials/portfolio` routes.
- Pass it into `portfolioContent`; build `refreshPath` as `/partials/portfolio?closedPage=N` when set, else `/partials/portfolio`.

### Tests (`test/web-portfolio-page.test.ts`)

- Closed rows render the PnL SOL % sub-line (positive/negative/null).
- `renderClosed` emits prev/next pagination links with correct "showing X–Y of Z" text and disabled states at bounds.
- `portfolioContent` forwards `closedPage` to the API call and defaults to 1.

## Non-goals

- No pagination on the expandable per-pool positions detail (still fetches up to 100).
- No change to API service signatures (`closedPortfolio` already supports page/pageSize).
- No client-side pagination or new dependencies.
