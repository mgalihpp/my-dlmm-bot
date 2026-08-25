# Simplify Loaders and Remove SSE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove SSE and dashboard data caching while making every route data flow simple and synchronous from the component's perspective.

**Architecture:** Portfolio and pools loaders will call the existing complete fetch functions and return one payload each. The route components will consume those payloads directly; unrelated loaders remain direct loaders. SSE infrastructure and dashboard data cache layers will be deleted, while icon HTTP caching and manual refresh remain.

**Tech Stack:** React Router 8.3.0 Framework Mode, React 19, TypeScript, Vitest, Effect services.

## Global Constraints

- Keep SSR enabled.
- Preserve auth middleware, route query validation, actions, and API proxy behavior.
- Do not add dependencies or SSE.
- Do not remove HTTP caching used by the icon proxy.
- Use `.js` extensions for local imports and preserve strict TypeScript.

---

### Task 1: Make Portfolio and Pools Loaders Return Complete Payloads

**Files:**
- Modify: `src/web-react/app/routes/portfolio.tsx`
- Modify: `src/web-react/app/routes/pools.tsx`
- Test: `src/web-react/app/routes/portfolio.test.ts`
- Test: `src/web-react/app/routes/pools.test.ts`

**Interfaces:**
- Portfolio loader consumes `fetchPortfolio(closedPage)` and returns `PortfolioPayload`.
- Pools loader consumes `fetchPools(timeframe)` and returns `PoolsPayload`.

- [ ] **Step 1: Update loader tests to mock complete fetch functions**

Replace critical/deferred mocks with `fetchPortfolio` and `fetchPools`, and assert
the resolved payload is returned. Keep the portfolio default page assertion and
add a non-default `closedPage` case; keep the pools `timeframe` argument assertion.

- [ ] **Step 2: Run the focused route tests and verify they fail**

Run from `src/web-react`: `npx vitest run app/routes/portfolio.test.ts app/routes/pools.test.ts`

Expected: FAIL because the route modules still call the critical/deferred functions.

- [ ] **Step 3: Replace the two loader implementations**

Portfolio should retain safe positive integer parsing, then return:

```ts
return fetchPortfolio(closedPage);
```

Pools should retain its timeframe query extraction, then return:

```ts
return fetchPools(timeframe);
```

Remove fallback deferred objects and their type-only imports.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npx vitest run app/routes/portfolio.test.ts app/routes/pools.test.ts`

Expected: PASS.

### Task 2: Remove Deferred Data Rendering From Dashboard Pages

**Files:**
- Modify: `src/web-react/app/components/portfolio/portfolio-page.tsx`
- Modify: `src/web-react/app/components/pools/pools-page.tsx`

**Interfaces:**
- Portfolio page consumes `PortfolioPayload` from `useLoaderData`.
- Pools page consumes `PoolsPayload` from `useLoaderData`.

- [ ] **Step 1: Update portfolio component types and direct rendering**

Remove `Await` from route-data rendering, remove the `deferred` prop and
`PortfolioDeferred` import, and render totals, positions, and closed data from
the complete `PortfolioPayload`. Keep lazy component `Suspense` boundaries and
manual `useRevalidator` refresh behavior.

- [ ] **Step 2: Update pools component types and direct rendering**

Remove `Await`, deferred props, and deferred fallback branches. Render
`data.pools` directly as the complete pool list. Keep the existing loading/error
behavior for route navigation and the manual refresh button.

- [ ] **Step 3: Run web typecheck**

Run from `src/web-react`: `npm run typecheck`

Expected: PASS with no references to deferred loader data in these components.

### Task 3: Remove SSE Infrastructure and Dashboard Wiring

**Files:**
- Modify: `src/web-react/app/components/dashboard-shell.tsx`
- Modify: `src/web-react/app/routes.ts`
- Delete: `src/web-react/app/hooks/use-realtime.ts`
- Delete: `src/web-react/app/routes/api/live.tsx`
- Delete: `src/web-react/app/lib/server/event-hub.ts`
- Test: `src/web-react/app/lib/server/event-hub.test.ts`

**Interfaces:**
- `DashboardShell` no longer accepts `realtimeMs`.
- No route or client code references `/api/live`, `EventSource`, or `realtimeHub`.

- [ ] **Step 1: Remove dashboard realtime prop and hook usage**

Delete the `useRealtimeRevalidate` import and invocation, then remove
`realtimeMs` from the props type and destructuring. Remove `realtimeMs` from
all dashboard shell call sites.

- [ ] **Step 2: Remove the live route and event hub**

Delete the `api/live` route entry and the three SSE/event-hub files. Delete the
event-hub test if it only tests the removed implementation.

- [ ] **Step 3: Verify no SSE references remain**

Run from the repository root: `rg "EventSource|text/event-stream|realtimeHub|useRealtimeRevalidate|api/live|event-hub" src/web-react/app`

Expected: no matches.

### Task 4: Remove Portfolio and Pools Data Caches

**Files:**
- Modify: `src/web-react/app/lib/server/pools.server.ts`
- Modify: `src/web-react/app/lib/server/portfolio.server.ts`

**Interfaces:**
- `fetchPools` and `fetchPortfolio` remain the complete public fetch functions.
- Every call performs a fresh service/API read without dashboard TTL or in-flight caches.

- [ ] **Step 1: Remove pools cache state and branches**

Delete `poolsCriticalCache`, `POOLS_CACHE_TTL_MS`, `POOLS_STALE_MS`, and
`poolsInFlight`. Make the complete pools path perform the existing Effect fetch
directly. Remove the critical/deferred-only functions if no remaining caller
uses them, while preserving shared price fetching and error payload behavior.

- [ ] **Step 2: Remove portfolio cache state and branches**

Delete `portfolioCriticalCache`, `PORTFOLIO_CACHE_TTL_MS`,
`PORTFOLIO_STALE_MS`, and `portfolioInFlight`. Make `fetchPortfolio` execute
the complete portfolio read directly and preserve its existing error payload.
Remove critical/deferred-only functions once no caller uses them.

- [ ] **Step 3: Verify cache and deferred symbols are gone**

Run: `rg "Critical|Deferred|CACHE_TTL|STALE_MS|InFlight|criticalCache|inFlight" src/web-react/app/lib/server src/web-react/app/routes src/web-react/app/components`

Expected: no dashboard critical/deferred/cache symbols remain; unrelated cache
names such as icon cache may remain.

### Task 5: Format and Verify the Full Change

**Files:**
- Modify: any files changed by formatting only in `src/web-react/`

- [ ] **Step 1: Format the web app**

Run from `src/web-react`: `npm run format`.

- [ ] **Step 2: Run web checks**

Run from `src/web-react`: `npm run typecheck` and `npx vitest run`.

Expected: both commands pass.

- [ ] **Step 3: Run repository checks**

Run from the repository root: `npm run check`, `npm run typecheck`, and `npm test`.

Expected: all applicable repository checks pass without network or live-service dependencies.

- [ ] **Step 4: Inspect final diff**

Run: `git status --short` and `git diff --stat`.

Confirm only the requested SSE, loader, cache, tests, and documentation changes are present.

### Task 6: Add Portfolio Auto-Refresh

**Files:**
- Create: `src/web-react/app/hooks/use-auto-refresh.ts`
- Test: `src/web-react/app/hooks/use-auto-refresh.test.ts`
- Modify: `src/web-react/app/components/portfolio/portfolio-page.tsx`

- [ ] **Step 1: Add tests for refresh guards**

Test that refresh is allowed only when `document.visibilityState` is `visible`
and the router state is idle. Test that `loading`, `revalidating`, and hidden
documents block a refresh.

- [ ] **Step 2: Implement the polling hook**

Use `useRevalidator` and a `window.setInterval` with a default of `10_000` ms.
Call `revalidate()` only when the visibility and router-state guards pass.
Clear the interval in the effect cleanup.

- [ ] **Step 3: Mount it in PortfolioPage only**

Call `useAutoRefresh(10_000)` from `PortfolioPage`. Do not mount it in
`DashboardShell` or the Pools page.

- [ ] **Step 4: Run final verification**

Run from `src/web-react`: `npm run typecheck` and `npx vitest run`.

Expected: typecheck passes and all web tests pass, including the three
auto-refresh guard tests.
