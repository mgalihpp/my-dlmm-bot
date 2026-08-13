# Design: Portfolio Equity Chart → PnL SOL

Date: 2026-08-12

## Problem

The portfolio page's right-hand chart panel ("TOTAL EQUITY") plots `balanceUsd`
from the last 48 portfolio snapshots. Total equity is a small, stable number,
so the line chart is flat and uninteresting — the user wants a chart that
moves with the market.

## Decision

Replace the chart's data series from `balanceUsd` to `pnlSol` (unrealized PnL
in SOL). Unrealized PnL tracks price movement and shows real spikes.

`pnlSol` is already recorded in every `PortfolioSnapshot`
(`src/web/portfolio-history.ts`), so the chart fills immediately from existing
history — no backfill or waiting required.

## Changes

### `src/web/pages/portfolio.ts` — `equityPanel()`

- Panel eyebrow/title: `TOTAL EQUITY` → `PNL SOL`
- Tooltip (`data-tip`): `Balance X · Fees Y` → `Unrealized PnL in SOL`
- Header value: `fmtUsd(last.value)` → `fmtSol(last.value)`
- Change % (first→last point of the 48-point window): kept, unchanged formula
- Chart points: map `snap.balanceUsd` → `snap.pnlSol` (same null filter, same
  48-snapshot window, same `tsLocal` labels)
- Line color follows sign of the last value: green when `>= 0`, red when `< 0`
  (previously always `var(--profit)`)
- Empty state: unchanged (still shows "No equity history yet" when < 2 points —
  reworded to "No PnL history yet")

### `src/web/charts.ts` — `lineChart()`

- Add optional `stroke` option (default `var(--profit)`) so the caller can pass
  a color per data sign. No other chart behavior changes.

### Untouched

- "Total equity" KPI card in the stats grid stays (equity info is not lost)
- Section head "ACCOUNT EQUITY", allocation panel, tables — unchanged
- Snapshot recording/dedup logic — unchanged

## Testing

- `test/web-portfolio-page.test.ts`: update expectations for the new panel
  title/values; assert PnL SOL formatting, change % and green/red line class
- `test/web-templates.test.ts` / chart tests: add coverage for the new
  `stroke` option
