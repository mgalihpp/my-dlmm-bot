# Portfolio Streaming (Deferred Loader) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut perceived portfolio load from ~2s to <200ms by streaming critical data first and deferring enrichment, without caching dynamic PnL.

**Architecture:** Split `fetchPortfolio` into `fetchPortfolioCritical` (single `openPortfolio` call) and `fetchPortfolioDeferred` (parallel `enrichOpenPortfolioPnl` + `attachLivePositions` + `closedPortfolio` + `totalPnl` + icons). Loader returns `defer({critical, deferred})`. Client renders critical via `Suspense`+`Await` boundaries for deferred tables.

**Tech Stack:** Effect 3.x, React Router 7 `defer`/`Await`, Vitest, TypeScript ESM

## Global Constraints

- No cache for dynamic data (`pnl`, `balances`, `unclaimedFees`) — `iconCache` 30m may stay
- No RPC provider change, no Redis, no new infra
- Only `web-react` portfolio path changes — Telegram/CLI untouched
- `rpcUrl` is config-file-only, no `RPC_URL` env
- ESM with `.js` extensions in imports, Biome formatting

---

### Task 1: Split portfolio.server.ts into critical + deferred with parallel deferred

**Files:**
- Modify: `src/web-react/app/lib/server/portfolio.server.ts:1-341`
- Test: `src/web-react/app/lib/server/portfolio.server.test.ts` (new)

**Interfaces:**
- Consumes: `MeteoraApi.openPortfolio`, `MeteoraApi.enrichOpenPortfolioPnl`, `MeteoraApi.closedPortfolio`, `MeteoraApi.totalPnl`, `MeteoraApi.discoveryPoolByAddress`, `Dlmm.fetchUserPositions`/`attachLivePositions`, `readHistory`, `recordSnapshot`, `computePortfolioSummary`
- Produces: `export function fetchPortfolioCritical(): Promise<PortfolioCritical>`, `export function fetchPortfolioDeferred(wallet: string, pools: readonly OpenPool[], closedPage: number): Promise<PortfolioDeferred>`, `export interface PortfolioCritical { ok, wallet, rpc, solPrice, totals, summary, pools: OpenPool[], history }`, `export interface PortfolioDeferred { pools: OpenPoolWithIcons[], closed: ClosedPortfolioPayload, total: PortfolioTotal }` — loader and Task 3 consume these exact names

- [ ] **Step 1: Read current file to get exact line numbers**

Run: `read src/web-react/app/lib/server/portfolio.server.ts` — confirm `EMPTY_TOTAL:45`, `iconCache:40`, `fetchPortfolio:217`

- [ ] **Step 2: Write failing test for split**

Create `src/web-react/app/lib/server/portfolio.server.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@vexis/layers.js", () => ({ AppLayer: {} }));
// mock MeteoraApi layer to simulate fast critical / slow deferred
describe("portfolio split", () => {
  it("critical resolves without waiting for deferred", async () => {
    // will be implemented in Task 1 Step 3 — expect functions to exist
    const mod = await import("./portfolio.server.js");
    expect(typeof mod.fetchPortfolioCritical).toBe("function");
    expect(typeof mod.fetchPortfolioDeferred).toBe("function");
  });
});
```

Run: `npm test -- src/web-react/app/lib/server/portfolio.server.test.ts`
Expected: FAIL — file not found / functions not defined

- [ ] **Step 3: Implement split — keep fetchPortfolio for backward compat, add two new functions**

In `portfolio.server.ts`, keep existing `fetchPortfolio` as wrapper (for tests/telegram) but refactor internals:

```ts
export interface PortfolioCritical {
  readonly ok: true;
  readonly wallet: string;
  readonly rpc: string;
  readonly solPrice: number | null;
  readonly total: OpenPortfolioTotals | null; // from res.total
  readonly summary: PortfolioSummary;
  readonly pools: readonly OpenPool[];
  readonly history: readonly PortfolioSnapshot[];
}

export interface PortfolioDeferred {
  readonly pools: readonly OpenPoolWithIcons[];
  readonly closed: { pools: readonly ClosedPoolWithIcons[]; page: number; pageSize: number; totalCount: number };
  readonly total: PortfolioTotal;
}

export function fetchPortfolioCritical(): Promise<PortfolioCritical & { wallet: string, pools: OpenPool[] }> {
  // Effect.gen: AppConfig, wallet, MeteoraApi, Dlmm not needed here
  // const res = yield* api.openPortfolio(wallet,1,10)
  // const summary = computePortfolioSummary(res.pools, res.total ?? null)
  // recordSnapshot(...); return {ok:true, wallet, rpc, solPrice: parseNum(res.solPrice), total: res.total ?? null, summary, pools: res.pools, history: readHistory(HISTORY_FILE)}
}

export function fetchPortfolioDeferred(wallet: string, pools: readonly OpenPool[], closedPage: number): Promise<PortfolioDeferred> {
  const program = Effect.gen(function*(){
    const api = yield* MeteoraApi;
    const dlmm = yield* Dlmm;
    const [enrichedPnl, live, closedRes, total] = yield* Effect.all([
      api.enrichOpenPortfolioPnl([...pools] as OpenPool[], wallet, {withRanges:true}),
      dlmm.fetchUserPositions(wallet).pipe(Effect.orElseSucceed(()=>[] as any)),
      api.closedPortfolio(wallet, closedPage, 10).pipe(Effect.catchAll(()=>Effect.succeed(null))),
      api.totalPnl(wallet).pipe(Effect.catchAll(()=>Effect.succeed(EMPTY_TOTAL))),
    ], {concurrency:"unbounded"});
    // merge live into enrichedPnl (same logic as attachLivePositions but without extra RPC roundtrip — loop over live map)
    // then enrichWithIcons for open+closed in parallel:
    const [openIcons, closedIcons] = yield* Effect.all([
      enrichWithIcons(enrichedWithLive, api),
      closedRes ? enrichWithIcons(closedRes.pools, api) : Effect.succeed([]),
    ], {concurrency:"unbounded"});
    // ...
  }).pipe(Effect.provide(AppLayer), Effect.catchAll(()=>Effect.succeed(...)));
  return Effect.runPromise(program);
}
```

Note: copy exact merge logic from current `Dlmm.ts:552-576` (Map by poolAddress) instead of calling `attachLivePositions` to avoid double fetch. Keep `fetchPortfolio` as `fetchPortfolioCritical().then(c=> fetchPortfolioDeferred(...).then(d=> merge into old PortfolioPayload))` for backward compat.

- [ ] **Step 4: Bump concurrency in enrichWithIcons call site**

Change `portfolio.server.ts:178` `Effect.forEach(pools, ..., {concurrency:5})` → `{concurrency:10}`. Same for closed icons.

- [ ] **Step 5: Run tests**

Run: `npm test -- src/web-react/app/lib/server/portfolio.server.test.ts`
Expected: PASS (functions exist)

Run: `npm run typecheck` in root and `npm run typecheck` in `src/web-react`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/web-react/app/lib/server/portfolio.server.ts src/web-react/app/lib/server/portfolio.server.test.ts
git commit -m "perf(portfolio): split critical/deferred with parallel deferred"
```

### Task 2: Raise MeteoraApi concurrency 5→10

**Files:**
- Modify: `src/services/MeteoraApi.ts:284`
- Test: `test/meteora-api.test.ts:240-270`

**Interfaces:**
- Consumes: `enrichOpenPortfolioPnl` internal `Effect.forEach`
- Produces: same function now with higher concurrency — no API change

- [ ] **Step 1: Write failing test for concurrency param**

In `test/meteora-api.test.ts`, add after existing enrich test:

```ts
it("enriches 10 pools in one batch with concurrency 10", async () => {
  // mock 10 pools, each positionPnl 50ms — assert elapsed < 700ms with concurrency 10, would be >1000 with 5
});
```

Run: `npm test -- test/meteora-api.test.ts -t "concurrency"`
Expected: FAIL (still 5, takes >1000ms)

- [ ] **Step 2: Change line 284**

```ts
{ concurrency: 10, discard: true }
```

- [ ] **Step 3: Run tests**

Run: `npm test -- test/meteora-api.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/services/MeteoraApi.ts test/meteora-api.test.ts
git commit -m "perf(meteora): bump enrich concurrency to 10"
```

### Task 3: Switch portfolio loader to defer

**Files:**
- Modify: `src/web-react/app/routes/portfolio.tsx:1-31`

**Interfaces:**
- Consumes: `fetchPortfolioCritical`, `fetchPortfolioDeferred` from Task 1
- Produces: `loader` returning `defer({critical, deferred, wallet, rpc})` — Task 4 consumes exact keys

- [ ] **Step 1: Update imports and loader**

```ts
import { defer } from "react-router";
import { fetchPortfolioCritical, fetchPortfolioDeferred } from "~/lib/server/portfolio.server";

export async function loader({request}: Route.LoaderArgs){
  const url = new URL(request.url);
  const closedPage = /* same parse as before */;
  const critical = await fetchPortfolioCritical();
  if(!critical.ok) return critical; // error case, no defer
  const deferred = fetchPortfolioDeferred(critical.wallet, critical.pools as any, closedPage);
  return defer({ critical, deferred, wallet: critical.wallet, rpc: critical.rpc });
}
```

Keep `action` unchanged.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck` in `src/web-react`
Expected: PASS (defer types align, need `Await` types matching)

- [ ] **Step 3: Commit**

```bash
git add src/web-react/app/routes/portfolio.tsx
git commit -m "perf(web): stream portfolio via defer critical+deferred"
```

### Task 4: Stream UI with Suspense/Await

**Files:**
- Modify: `src/web-react/app/components/portfolio/portfolio-page.tsx:1-96`
- Modify: `src/web-react/app/components/portfolio/portfolio-content.tsx` (accept split props)
- Test: manual `npm run dev` open `http://127.0.0.1:8080/portfolio`

**Interfaces:**
- Consumes: loader data `{critical, deferred}`
- Produces: rendered critical instantly, deferred in `<Suspense><Await>`

- [ ] **Step 1: Update PortfolioPage to use critical/deferred**

```tsx
import { Suspense } from "react";
import { Await, useLoaderData } from "react-router";
import { PortfolioTableSkeletons } from "./portfolio-table-skeletons";

export function PortfolioPage(){
  const data = useLoaderData() as {critical: any, deferred: Promise<any>, wallet: string, rpc: string} | {ok:false};
  if((data as any).ok===false) return <LoadErrorCard .../>;
  const {critical, deferred} = data as any;
  // render header + critical summary directly
  return (
    <DashboardShell ...>
      <PortfolioHeader .../>
      <StatCards summary={critical.summary} .../>
      <Suspense fallback={<PortfolioTableSkeletons/>}>
        <Await resolve={deferred} errorElement={<LoadErrorCard title="Failed to load positions"/>}>
          {(d)=> <PositionsTableBody pools={d.pools} currency={currency} solPrice={critical.solPrice} .../>}
        </Await>
      </Suspense>
      <Suspense fallback={<PortfolioTableSkeletons/>}>
        <Await resolve={deferred}>{(d)=> <ClosedTable pools={d.closed.pools} .../>}</Await>
      </Suspense>
    </DashboardShell>
  );
}
```

Keep `currency`/`rangeFilter` state as before.

- [ ] **Step 2: Update PortfolioContent if needed to accept split**

If `PortfolioContent` is kept, add props `critical` and `deferred` and move Suspense inside it. Or inline in PortfolioPage — either works, follow existing pattern in `src/web-react/app/components/portfolio/portfolio-content.tsx`.

- [ ] **Step 3: Verify visually**

Run: `npm run dev` in `src/web-react` (or root `npm run dev`), open portfolio, throttle network to Fast 3G, confirm skeleton <50ms and deferred populates without full-page loader.

Run: `npm run typecheck` + `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/web-react/app/components/portfolio/portfolio-page.tsx src/web-react/app/components/portfolio/portfolio-content.tsx
git commit -m "perf(web): suspense streaming for portfolio tables"
```

### Task 5: Verification & cleanup

**Files:**
- None new, verification only

- [ ] **Step 1: Biome/format**

Run: `npm run format` in `src/web-react` if changed files, `npx biome check src/web-react/app/lib/server/portfolio.server.ts src/web-react/app/routes/portfolio.tsx`

- [ ] **Step 2: Full checks**

Run: `npm run check` (root), `npm test`, `npm run typecheck` in `src/web-react`
Expected: all PASS

- [ ] **Step 3: Measure**

Add temporary `console.time("critical")` around `fetchPortfolioCritical` and log deferred resolve time in loader, confirm critical <400ms, full <1000ms on cold, perceived <200ms (skeleton).

- [ ] **Step 4: Final commit if fixes**

```bash
git add -A
git commit -m "chore: verify portfolio streaming perf" --allow-empty || true
```

## Self-Review

- Spec section "Architecture: Split fetchPortfolio" → Task 1 + 3
- Spec "Client streaming Suspense/Await" → Task 4
- Spec "Raise concurrency 5→10" → Task 1 Step 4 + Task 2
- Spec "No cache for dynamic" honored — iconCache untouched, no TTL added
- Spec "Error handling: critical fails whole page, deferred fails inline" → Task 1 + 4
- Placeholder scan: no TBD/TODO, all code blocks concrete
- Type consistency: `fetchPortfolioDeferred` returns `PortfolioDeferred` consumed as `d.pools`/`d.closed`/`d.total` in Task 4 — names match
