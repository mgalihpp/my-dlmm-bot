# Simplify Loaders and Remove SSE

## Goal

Remove the dashboard's SSE-based automatic revalidation and simplify route data
loading so each route receives one complete payload. Preserve authentication,
mutations, API proxy behavior, query-string filters, and manual refresh controls.

## Scope

### Remove

- The `/api/live` route and its route registration.
- `useRealtimeRevalidate`, `use-realtime.ts`, and the `EventHub` implementation.
- `DashboardShell`'s `realtimeMs` prop and hook invocation.
- The `critical`/`deferred` loader contract for portfolio and pools.
- Data-loading `Await`/`Suspense` branches that only exist for deferred data.

Lazy-loaded portfolio visualizations may keep their own `Suspense` boundaries
because those boundaries concern JavaScript bundle loading, not route data.

### Preserve

- Manual refresh through `useRevalidator`.
- `fetchPortfolio(closedPage)` and `fetchPools(timeframe)` as the complete server
  payload functions.
- Existing query validation for `closedPage` and accepted pool timeframes.
- HTTP caching for proxied icon assets.
- Existing settings, agent, login, logout, closed-detail, and icon loaders.
- Portfolio close action and settings actions.

## Data Flow

Portfolio and pools route loaders will parse their relevant search parameters,
await the existing complete fetch function, and return its single payload:

```text
request URL -> route loader -> complete server fetch -> one loader payload -> page
```

The portfolio page consumes `PortfolioPayload` directly. The pools page
consumes `PoolsPayload` directly. If a server fetch returns `ok: false`, the
existing error card behavior remains in place.

Other loaders remain direct loaders because they already return a single
payload or perform a redirect/HTTP proxy response. No artificial wrapper type
will be introduced for them.

The portfolio and pools server modules will not cache dashboard data. Remove
their TTL caches, stale-while-revalidate branches, and in-flight request maps.
Each complete fetch call performs a fresh upstream/service read.

## Component Changes

- Update loader data types to match the single payload returned by each route.
- Remove deferred-data props from portfolio and pools page content components.
- Render complete portfolio totals, enriched positions, closed positions, and
  enriched pools directly from loader data.
- Keep manual refresh buttons wired to `useRevalidator`.
- Remove realtime configuration from all `DashboardShell` call sites.

## Error Handling

The existing server functions continue to convert service failures into their
typed payload error shapes. The route components continue to show their
existing `LoadErrorCard` messages for `ok: false` responses. No network
connection remains open after a route loader completes.

## Testing

- Update portfolio loader tests to assert `fetchPortfolio(closedPage)` is
  awaited and its single payload is returned.
- Update pools loader tests to assert `fetchPools(timeframe)` is awaited and
  its single payload is returned.
- Remove tests that only verify deferred promises, if any.
- Run the web app formatter, typecheck, and test suite, followed by the repo
  checks requested by the project instructions where applicable.

## Non-Goals

- No change to backend/domain fetching semantics.
- No client-side replacement for SSE polling.
- No removal of HTTP caching used by the icon proxy.
- No redesign of dashboard UI or route authorization.
