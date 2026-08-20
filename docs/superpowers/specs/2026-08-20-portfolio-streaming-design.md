# Portfolio Streaming (Deferred Loader) — Design

Date: 2026-08-20
Branch: perf/portfolio-streaming

## Problem
`GET /portfolio` via `src/web-react/app/lib/server/portfolio.server.ts:217 fetchPortfolio` takes ~2s per request. Loader `src/web-react/app/routes/portfolio.tsx:10` blocks navigation until all data is ready, so dashboard feels slow even though shell renders instantly. User wants `<200ms perceived` on web dashboard, no cache for dynamic PnL/balance, no RPC change.

Current waterfall (serial):
1. `openPortfolio` 300-500ms
2. `enrichOpenPortfolioPnl` — N × `GET /positions/{pool}/pnl` concurrency 5 → 400-600ms for 10 pools (`src/services/MeteoraApi.ts:243`)
3. `attachLivePositions` — `DLMM.getAllLbPairPositionsByUser` RPC 500-800ms (`src/services/Dlmm.ts:353`)
4. `enrichWithIcons` — N × discovery API concurrency 5 → ~400ms (`src/web-react/app/lib/server/portfolio.server.ts:167`)
5. `closedPortfolio` + `totalPnl` serial → 300ms

## Non-Goals
- No cache for dynamic data (`pnl`, `balances`, `unclaimedFees`). `iconCache` 30m stays (`portfolio.server.ts:40`).
- No RPC provider change, no Redis, no new infra.
- No change to Telegram/CLI paths — only `web-react` portfolio loader.
- No WebSocket/SSE for this spec.

## Architecture

### Split fetchPortfolio into critical + deferred

Keep single file `portfolio.server.ts`, export two functions:

```ts
export function fetchPortfolioCritical(): Promise<PortfolioCritical>
export function fetchPortfolioDeferred(wallet: string, pools: OpenPool[], closedPage: number): Promise<PortfolioDeferred>
```

`PortfolioCritical` = `{ pools: OpenPool[], totals, solPrice, summary, history }` — derived from `openPortfolio` only, no enrichment. Computed synchronously after one Meteora call.

`PortfolioDeferred` = `{ pools: OpenPoolWithIcons[], closed: ClosedPortfolio, total: PortfolioTotal }` — enriched open pools (PnL/range + live + icons) plus closed + total.

Critical is `await`ed in loader. Deferred is a *promise* returned via `defer()` without awaiting.

```ts
// routes/portfolio.tsx
export async function loader({request}: Route.LoaderArgs) {
  const critical = await fetchPortfolioCritical(); // ~300ms
  const deferred = fetchPortfolioDeferred(critical.wallet, critical.pools, closedPage); // starts ~0ms, resolves ~700ms
  return defer({ critical, deferred, wallet: critical.wallet, rpc: critical.rpc });
}
```

Inside `fetchPortfolioDeferred`, parallelize independent work:

```ts
Effect.all([
  api.enrichOpenPortfolioPnl(pools, wallet, {withRanges:true}),
  dlmm.fetchUserPositions(wallet).pipe(orElseSucceed([])),
  api.closedPortfolio(wallet, closedPage, 10).pipe(orElseSucceed(null)),
  api.totalPnl(wallet).pipe(orElseSucceed(EMPTY_TOTAL)),
], {concurrency:"unbounded"})
// then merge pnl+live into pools, then enrichWithIcons for open+closed in parallel (concurrency 10)
```

Raise concurrency 5→10 in `MeteoraApi.ts:284` and `portfolio.server.ts:211`.

### Client streaming

`PortfolioPage` (`src/web-react/app/components/portfolio/portfolio-page.tsx:20`) currently `useLoaderData<PortfolioPayload>()`. Change to `useLoaderData<typeof loader>` with `critical` rendered immediately and `deferred` wrapped:

```tsx
const { critical, deferred } = useLoaderData<typeof loader>();
// critical renders StatCards, AllocationDonut, PositionsTable skeleton
<Suspense fallback={<PortfolioTableSkeletons />}>
  <Await resolve={deferred} errorElement={<LoadErrorCard />}>
    {(data) => <PositionsTableBody pools={data.pools} ... /> /* range visual + close buttons */}
  </Await>
</Suspense>
<Suspense fallback={...}>
  <Await resolve={deferred}>{(data)=> <ClosedTable pools={data.closed.pools} />}</Await>
</Suspense>
```

`DashboardShell` + `PageSkeleton` already shows <50ms. Critical paint <350ms, deferred streams <900ms, perceived <200ms (skeleton instantly).

## Data flow
1. Navigation to `/portfolio` → loader awaits `openPortfolio` only.
2. Loader returns `defer()` response — React Router sends critical JSON, keeps connection open for deferred.
3. Browser renders critical UI.
4. Server resolves deferred promise in background (parallel Meteora+RPC+discovery).
5. React streams deferred chunks → Suspense boundaries resolve without full page reload.
6. Manual refresh (`revalidate` in `portfolio-page.tsx:22`) repeats same split; no cache staleness.

## Error handling
- Critical failure (openPortfolio throws) → loader returns `{ok:false}` as today `portfolio.server.ts:298`, full error card.
- Deferred failure → `catchAll` to empty arrays / `EMPTY_TOTAL` (`portfolio.server.ts:254,259,265` pattern), `Await errorElement` shows inline retry, critical stays visible. No whole-page error.
- `iconCache` failures already `Effect.either` → null icons, unchanged.

## Files touched
| File | Change |
|---|---|
| `src/web-react/app/lib/server/portfolio.server.ts` | split `fetchPortfolio` → `fetchPortfolioCritical` + `fetchPortfolioDeferred`, parallelize deferred with `Effect.all`, bump concurrency 5→10 |
| `src/web-react/app/routes/portfolio.tsx` | switch loader to `defer({critical, deferred})`, import `defer` from `react-router` |
| `src/web-react/app/components/portfolio/portfolio-page.tsx` | consume `critical`/`deferred` via `Await`+`Suspense`, keep `critical` header |
| `src/web-react/app/components/portfolio/portfolio-content.tsx` | accept split props, separate Suspense boundaries for open vs closed |
| `src/services/MeteoraApi.ts` | concurrency 5→10 |
| `src/web-react/app/lib/server/portfolio.server.test.ts` | new — verify deferred does not block loader (mock timers) |

## Testing
- One unit test for split: mock `openPortfolio` fast, `enrichOpenPortfolioPnl` slow → assert `fetchPortfolioCritical` resolves <400ms independent of deferred.
- Existing `meteora-api.test.ts` and `domain-portfolio.test.ts` unchanged.

## Success criteria
- Cold navigation to `/portfolio` shows content skeleton <50ms, summary/critical <400ms, full positions with range visual <1000ms.
- No cache for PnL, close action still sees live data.
- `npm run typecheck` + `npm test` pass.
