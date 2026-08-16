# Pools Page (React Web) — Design

Date: 2026-08-16

## Purpose

Replace the placeholder Pool Radar page in `src/web-react/` (currently a "coming soon" stub) with a real, interactive pools page that ports the functionality of the legacy `src/web/pages/pools.ts` onto the new React + shadcn UI. Theme follows the current React design system — the legacy look is not reused.

## Decisions

- Server-side screening via the existing `Screening` service (`Screening.screen({ timeframe })`), the same data path the legacy page uses. No re-implementation of screening logic.
- Timeframe is a query param (`?timeframe=30m`); changing it re-runs the route loader (server-side re-screen), mirroring the portfolio `closedPage` pattern.
- Refresh: manual button + revalidate on tab focus only (no polling) — screening is expensive (many Meteora/RugCheck/Jupiter calls).
- Currency toggle USD/SOL: pool screening data is USD-only, so the payload carries one `solPrice` (fetched once per load from the jup.ag price API); the client divides USD values by `solPrice`. Same `Tabs` pattern as the portfolio page.
- All charts via `recharts` + existing `ChartContainer`.
- Row click opens a right-side **Sheet** (already installed) with full pool metrics + price sparkline + Meteora/Solscan links.
- Client-side search, organic filter, and column sorting over the already-fetched pools.
- No new dependencies.

## Architecture

```
src/web-react/
└── app/
    ├── lib/server/pools.server.ts      # NEW — fetchPools(timeframe): PoolsPayload (Effect + AppLayer)
    ├── routes/pools.tsx                # MODIFY — loader (auth + timeframe parsing), render PoolsPage
    └── components/pools/               # NEW
        ├── pools-page.tsx              # page composition: header, stat cards, charts, filters, table, sheet
        ├── stat-cards.tsx              # total pools, combined TVL, volume, fees, rug-flagged
        ├── market-charts.tsx           # TVL bar (top 10) + MC vs Volume scatter
        ├── pools-table.tsx             # sortable table, search + organic filter, trend sparkline
        └── pool-detail-sheet.tsx       # full metric list + price sparkline + links
```

### Data flow

1. `loader(request)`: auth check (existing), parse `timeframe` (validated against `TIMEFRAMES`, default from config), call `fetchPools(timeframe)`.
2. `fetchPools` runs `Screening.screen({ timeframe })` with `Effect.provide(AppLayer)`, serializes pools, and fetches `solPrice` from `https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112`.
3. `clientLoader` forwards `serverLoader()`; manual refresh re-runs it.

### PoolsPayload

```ts
{
  ok: boolean;
  error?: string;
  timeframe: string;
  total: number;        // raw pool count (result.total)
  filtered: number;     // result.filtered
  pools: ScreenedPool[];   // display-limited, score-sorted
  solPrice: number | null;
  fetchedAt: number;    // Date.now() at server
}
```

## Components

### Header row
"Pool Radar" title + subtitle (`N pools shown · {timeframe}`, updated via `tsLocal(fetchedAt)`), currency Tabs (USD/SOL), timeframe Select (the 7 legacy timeframes), Refresh button.

### Stat cards
Grid (responsive like portfolio `StatCards`), currency-aware: pools shown, combined TVL, combined volume, combined fees, rug-flagged count (rugScore ≥ 1250). Lucide icons, tabular numbers.

### Market charts (`@4xl/main:grid-cols-2`)
- **TVL bar** — top 10 pools by TVL, horizontal/vertical bars with token icons in tooltip, currency-aware.
- **MC vs Volume scatter** — log-scaled scatter, currency-aware, tooltip shows pool name.

### Filter bar
- Search input (name/symbol/address, case-insensitive).
- Organic filter as a `ToggleGroup` (already installed): All / Pass (≥80) / Review (≥60) / Blocked (<60).

### Pools table
Sortable columns (click header toggles asc/desc): Pool (token icon + name + short address), Price, MC, TVL, Volume, Fee, Bin (binStep + baseFee%), Organic badge, Rug badge, From ATH, Trend (sparkline + colored %). Row click opens the detail sheet. Skeleton rows while loading.

### Pool detail sheet
Right-side Sheet: token icon + name, price + change, and a two-column metric grid — MC, TVL, active TVL, volume, fees, holders, organic/quote organic, bin step, base fee, from-ATH, volatility, fee/TVL ratio, active/open positions, token & pool age, swaps, unique traders, rug score, bundle/top10/bot holders, LP locked %, risk flags (rugpull/wash/dev-sold-all). Large price sparkline (from `priceSeries`). Meteora + Solscan buttons.

## Error handling

- `ok: false` → error card with message + retry hint, same pattern as portfolio.
- `solPrice` fetch failure → `solPrice: null`, UI shows USD only and disables the SOL tab (or shows a warning badge).
- Empty pools → empty state ("No pools found" friendly card).
- Malformed external data already handled by existing screening/enrichment path.

## Testing

`test/web-react-pools-page.test.ts` — pure logic only, inline fixtures, no network:

- Payload-building helper (if extracted, e.g. `buildPoolsPayload(result, solPrice)`): asserts shape, pass-through of counts/pools, null-safe solPrice.
- Organic/rug badge mapping helpers (if extracted): threshold boundaries (80/60 pass/review/blocked; rug 250/1250).
- SOL conversion helper (if extracted): divides USD by solPrice, null-safe.
- Client-side filter/sort helpers (if extracted): search matching, organic bucket, sort toggle behavior.

No live RPC / Telegram / Meteora / wallet / network access in tests.

## Verification

- `npm run check` and `npm run typecheck` in `src/web-react` (react-router typegen + tsc).
- Root `npm test` must pass.
- Manual: `npm run dev` in `src/web-react`, open `/pools`, verify stat cards, charts, filter/sort, sheet detail, USD/SOL toggle, timeframe change, empty/error states, refresh.

## Out of scope

- On-chain actions (read-only by design).
- Pool detail deep-linking or server-side detail endpoint (all metrics are already in the payload).
- Legacy `src/web/` removal — out of scope for this task.