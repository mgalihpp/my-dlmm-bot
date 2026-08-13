# Closed Positions Pagination + PnL SOL % Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side pagination to the web dashboard's Closed Positions table and show the PnL SOL percentage (already returned by the Meteora API) in both closed positions tables.

**Architecture:** Server-rendered HTML via Effect HttpServer. Pagination is query-param driven (`closedPage`) on `/portfolio` and `/partials/portfolio`, reusing the existing Agent Log pagination pattern (`paginationLinks` in `src/web/pages/agent.ts`). The Meteora API `closedPortfolio(user, page, pageSize)` already supports pages and returns `totalCount`/`hasNext`. PnL SOL % is a pure render change — `ClosedPool.pnlSolPctChange` and `PositionPnLData.pnlSolPctChange` already exist.

**Tech Stack:** TypeScript (strict, ESM), Effect, `@effect/platform` HttpServer, htmx, Vitest, Biome.

## Global Constraints

- ESM-only; use `.js` extensions in local imports.
- TypeScript strict mode; no `any`; no `as any`.
- Follow existing Effect patterns; keep errors typed and composable.
- Do not change API service signatures (`closedPortfolio` already supports page/pageSize).
- Page size for closed pools stays 10.
- No new dependencies.
- Run `npm run check`, `npm run typecheck`, `npm test` after each task.

---

### Task 1: PnL SOL % in both closed tables

**Files:**
- Modify: `src/web/pages/portfolio.ts:244-266` (renderClosed rows), `src/web/pages/portfolio.ts:313-326` (renderClosedDetail rows)
- Test: `test/web-portfolio-page.test.ts`

**Interfaces:**
- Consumes: `ClosedPool` (`pnlSolPctChange: string`), `PositionPnLData` (`pnlSolPctChange: Nullable<Union<string, number>>`) — both already defined in `src/domain/portfolio.ts` / `src/domain/position.ts`.
- Produces: render changes only; no new exports. `renderClosed` keeps its current signature (changed in Task 2), `renderClosedDetail` unchanged.

- [ ] **Step 1: Write the failing tests**

Add to the `describe("renderClosedDetail")` block:

```ts
it("shows PnL SOL percentage under the SOL amount", () => {
	const html = renderClosedDetail("OLD/SOL", [
		mkPos(),
		mkPos({ positionAddress: "posB", pnlSol: "-0.05", pnlSolPctChange: null }),
	]);
	expect(html).toContain('<div class="sub">+5.10%</div>');
	expect(html).toContain('<div class="sub">-</div>');
});
```

Add to the `describe("renderPortfolio")` block:

```ts
it("shows PnL SOL percentage under closed pool rows", () => {
	const html = renderPortfolio({
		total: mkTotal(),
		open: [],
		closed: [mkClosed()],
	});
	expect(html).toContain('class="profit">0.2000 ');
	expect(html).toContain('<div class="sub">+10.00%</div>');
});

it("colors closed PnL SOL percentage red when negative", () => {
	const html = renderPortfolio({
		total: mkTotal(),
		open: [],
		closed: [mkClosed({ pnlSol: "-0.05", pnlSolPctChange: "-4.5" })],
	});
	expect(html).toContain('<td class="loss">');
	expect(html).toContain('<div class="sub">-4.50%</div>');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/web-portfolio-page.test.ts`
Expected: the three new tests FAIL (`<div class="sub">...` not found); existing tests still pass.

- [ ] **Step 3: Implement the sub-lines**

In `src/web/pages/portfolio.ts`, in `renderClosed`, the row map (currently around line 249-266) — change the PnL SOL cell. Current:

```ts
	const rows = pools.map((pool) => {
		const pair = `${pool.tokenX ?? "?"}/${pool.tokenY ?? "?"}`;
		const pnlPct = parseFloat(pool.pnlPctChange);
		const pnlSol = parseFloat(pool.pnlSol);
```

Add `pnlSolPct` next to `pnlSol`:

```ts
		const pnlSol = parseFloat(pool.pnlSol);
		const pnlSolPct =
			pool.pnlSolPctChange != null ? parseFloat(pool.pnlSolPctChange) : NaN;
```

And replace the PnL SOL cell (currently `<td class="${pnlClass(pnlSol)}">${fmtSol(pool.pnlSol)}</td>`) with:

```ts
<td class="${pnlClass(pnlSolPct)}">${fmtSol(pool.pnlSol)}<div class="sub">${fmtPct(pnlSolPct)}</div></td>
```

This mirrors the Open Positions PnL SOL cell (portfolio.ts:174).

In `renderClosedDetail`, the row map (currently around line 313-326) — current:

```ts
	const rows = closed.map((pos) => {
		const pnlPct = parseFloat(pos.pnlPctChange);
		const pnlSol = pos.pnlSol != null ? parseFloat(String(pos.pnlSol)) : NaN;
```

Add:

```ts
		const pnlSolPct =
			pos.pnlSolPctChange != null
				? parseFloat(String(pos.pnlSolPctChange))
				: NaN;
```

And replace the PnL SOL cell (currently `<td class="${pnlClass(pnlSol)}">${fmtSol(pos.pnlSol)}</td>`) with:

```ts
<td class="${pnlClass(pnlSolPct)}">${fmtSol(pos.pnlSol)}<div class="sub">${fmtPct(pnlSolPct)}</div></td>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/web-portfolio-page.test.ts`
Expected: all tests PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add src/web/pages/portfolio.ts test/web-portfolio-page.test.ts
git commit -m "feat(web): show pnl sol pct on closed positions tables"
```

---

### Task 2: Pagination links under the closed pools table

**Files:**
- Modify: `src/web/pages/portfolio.ts:32-36` (PortfolioData area — add `ClosedPagination` export), `src/web/pages/portfolio.ts:45-98` (renderPortfolio), `src/web/pages/portfolio.ts:244-272` (renderClosed)
- Test: `test/web-portfolio-page.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 (same file).
- Produces: `export interface ClosedPagination { readonly page: number; readonly pageSize: number; readonly total: number }`; `renderPortfolio(data, history?, closedPagination: ClosedPagination | null = null)` — third param optional, backward compatible with all existing callers.

- [ ] **Step 1: Write the failing tests**

Add to the `describe("renderPortfolio")` block:

```ts
it("renders closed pagination with prev/next links", () => {
	const html = renderPortfolio(
		{
			total: mkTotal(),
			open: [],
			closed: [
				mkClosed({ poolAddress: "pA" }),
				mkClosed({ poolAddress: "pB" }),
			],
		},
		[],
		{ page: 2, pageSize: 10, total: 87 },
	);
	expect(html).toContain('class="pagination"');
	expect(html).toContain("showing 11–12 of 87");
	expect(html).toContain('href="/portfolio?closedPage=1"');
	expect(html).toContain('href="/portfolio?closedPage=3"');
});

it("disables prev on the first page and next on the last page", () => {
	const first = renderPortfolio(
		{ total: mkTotal(), open: [], closed: [mkClosed()] },
		[],
		{ page: 1, pageSize: 10, total: 87 },
	);
	expect(first).toContain('<a class="disabled">‹ prev</a>');
	expect(first).toContain('href="/portfolio?closedPage=2"');
	const last = renderPortfolio(
		{ total: mkTotal(), open: [], closed: [mkClosed()] },
		[],
		{ page: 9, pageSize: 10, total: 87 },
	);
	expect(last).toContain('<a class="disabled">next ›</a>');
	expect(last).not.toContain('href="/portfolio?closedPage=10"');
});

it("renders no pagination links when closed total is zero", () => {
	const html = renderPortfolio(
		{ total: mkTotal(), open: [], closed: [mkClosed()] },
		[],
		{ page: 1, pageSize: 10, total: 0 },
	);
	expect(html).not.toContain('class="pagination"');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/web-portfolio-page.test.ts`
Expected: the three new tests FAIL (no `class="pagination"`); existing tests pass.

- [ ] **Step 3: Implement pagination rendering**

In `src/web/pages/portfolio.ts`:

Add the exported type above `renderPortfolio` (after `EMPTY_TOTAL`):

```ts
export interface ClosedPagination {
	readonly page: number;
	readonly pageSize: number;
	readonly total: number;
}
```

Change `renderPortfolio` signature and the closed call (line 96):

```ts
export function renderPortfolio(
	data: PortfolioData,
	history: readonly PortfolioSnapshot[] = [],
	closedPagination: ClosedPagination | null = null,
): string {
```

and

```ts
${renderClosed(data.closed, closedPagination)}
```

Change `renderClosed` signature (line 244) from `function renderClosed(pools: readonly ClosedPool[]): string` to:

```ts
function renderClosed(
	pools: readonly ClosedPool[],
	pagination: ClosedPagination | null,
): string {
```

In `renderClosed`, after the `table(...)` call, insert the links before `closedDetailScript()` (line 268-271). Replace:

```ts
	return `<h2>Closed Positions <span class="sub">// ${pools.length} pools</span></h2>${table(
		["Pool", "Deposit", "Withdraw", "Fees", "PnL USD", "PnL SOL", "Closed"],
		rows,
	)}${closedDetailScript()}`;
```

with:

```ts
	const links =
		pagination !== null ? closedPaginationLinks(pools.length, pagination) : "";
	return `<h2>Closed Positions <span class="sub">// ${pools.length} pools</span></h2>${table(
		["Pool", "Deposit", "Withdraw", "Fees", "PnL USD", "PnL SOL", "Closed"],
		rows,
	)}${links}${closedDetailScript()}`;
```

Add the helper after `renderClosed` (before `closedDetailScript`):

```ts
function closedPaginationLinks(
	rowsOnPage: number,
	pagination: ClosedPagination,
): string {
	if (pagination.total === 0) return "";
	const lastPage = Math.max(
		1,
		Math.ceil(pagination.total / pagination.pageSize),
	);
	const page = Math.min(Math.max(1, pagination.page), lastPage);
	const from = (page - 1) * pagination.pageSize + 1;
	const to = from + rowsOnPage - 1;
	const prev =
		page > 1
			? `<a href="/portfolio?closedPage=${page - 1}">‹ prev</a>`
			: `<a class="disabled">‹ prev</a>`;
	const next =
		page < lastPage
			? `<a href="/portfolio?closedPage=${page + 1}">next ›</a>`
			: `<a class="disabled">next ›</a>`;
	return `<div class="pagination">${prev}<span>showing ${from}–${to} of ${pagination.total}</span>${next}</div>`;
}
```

Note: the `.pagination` CSS class already exists in `src/web/theme.ts:402-405`; the `.sub` class is already used elsewhere.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/web-portfolio-page.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/pages/portfolio.ts test/web-portfolio-page.test.ts
git commit -m "feat(web): paginate closed positions table"
```

---

### Task 3: Wire `closedPage` through data flow and routes

**Files:**
- Modify: `src/web/pages/portfolio.ts:356-415` (portfolioContent)
- Modify: `src/web/server.ts:134-147` (portfolioPage/portfolioPartial)
- Test: `test/web-portfolio-page.test.ts`

**Interfaces:**
- Consumes: `ClosedPagination` and `renderPortfolio`'s third param from Task 2; `ClosedPortfolioResponse` (`page`, `pageSize`, `totalCount`, `pools`) from `src/domain/portfolio.ts`.
- Produces: `export const portfolioContent: (opts?: { readonly closedPage?: number }) => Effect.Effect<string, never, AppConfig | MeteoraApi | Dlmm>` — NOTE: this changes from a pre-built Effect to a function returning an Effect. `src/web/server.ts` is the only consumer.

- [ ] **Step 1: Write the failing tests**

At the top of `test/web-portfolio-page.test.ts`, add imports:

```ts
import { Dlmm, type DlmmService } from "../src/services/Dlmm.js";
import { portfolioContent } from "../src/web/pages/portfolio.js";
```

(Update the existing import from `"../src/web/pages/portfolio.js"` — add `portfolioContent` to it instead of a separate import line.)

After the `layerWith` helper (line 423-429), add:

```ts
const dlmmStub = Layer.succeed(
	Dlmm,
	{ attachLivePositions: (pools: OpenPool[]) => Effect.succeed(pools) } as DlmmService,
);

const layerWithDlmm = (
	handler: (url: string) => { body: unknown; status?: number },
) => layerWith(handler).pipe(Layer.provideMerge(dlmmStub));

const closedPortfolioBody = {
	hasNext: true,
	page: 2,
	pageSize: 10,
	totalCount: 12,
	totalPositions: 12,
	pools: [mkClosed({ poolAddress: "poolA" }), mkClosed({ poolAddress: "poolB" })],
};

const openPortfolioEmptyBody = {
	hasNext: false,
	page: 1,
	pageSize: 10,
	totalCount: 0,
	totalPositions: 0,
	pools: [],
};
```

Add a new describe block at the end of the file:

```ts
describe("portfolioContent", () => {
	it("forwards closedPage to the closed portfolio API", async () => {
		let closedUrl = "";
		const result = await Effect.runPromise(
			portfolioContent({ closedPage: 2 }).pipe(
				Effect.provide(
					layerWithDlmm((url) => {
						if (url.includes("/portfolio/total")) return { body: mkTotal() };
						if (url.includes("/portfolio/open"))
							return { body: openPortfolioEmptyBody };
						if (url.includes("/portfolio?")) {
							closedUrl = url;
							return { body: closedPortfolioBody };
						}
						return { body: { error: "unexpected" }, status: 404 };
					}),
				),
			),
		);
		expect(closedUrl).toContain("page=2");
		expect(closedUrl).toContain("page_size=10");
		expect(result).toContain("showing 11–12 of 12");
	});

	it("defaults to page 1 when closedPage is missing", async () => {
		let closedUrl = "";
		await Effect.runPromise(
			portfolioContent().pipe(
				Effect.provide(
					layerWithDlmm((url) => {
						if (url.includes("/portfolio/total")) return { body: mkTotal() };
						if (url.includes("/portfolio/open"))
							return { body: openPortfolioEmptyBody };
						if (url.includes("/portfolio?")) {
							closedUrl = url;
							return { body: closedPortfolioBody };
						}
						return { body: { error: "unexpected" }, status: 404 };
					}),
				),
			),
		);
		expect(closedUrl).toContain("page=1");
	});

	it("falls back to page 1 for invalid closedPage", async () => {
		let closedUrl = "";
		await Effect.runPromise(
			portfolioContent({ closedPage: -3 }).pipe(
				Effect.provide(
					layerWithDlmm((url) => {
						if (url.includes("/portfolio/total")) return { body: mkTotal() };
						if (url.includes("/portfolio/open"))
							return { body: openPortfolioEmptyBody };
						if (url.includes("/portfolio?")) {
							closedUrl = url;
							return { body: closedPortfolioBody };
						}
						return { body: { error: "unexpected" }, status: 404 };
					}),
				),
			),
		);
		expect(closedUrl).toContain("page=1");
	});
});
```

Note: `portfolioContent` writes one snapshot row to `.vexis-portfolio-history.json` (gitignored — verified in `.gitignore`) — harmless test side effect, same as existing behavior.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/web-portfolio-page.test.ts`
Expected: the three new tests FAIL to compile or fail assertions (`portfolioContent` is currently a value, not a function — TS error `This expression is not callable`).

- [ ] **Step 3: Implement the data flow**

In `src/web/pages/portfolio.ts`, add near the top (after `PortfolioData`):

```ts
export const CLOSED_PAGE_SIZE = 10;

function normalizePage(value: number | undefined): number {
	return value !== undefined && Number.isSafeInteger(value) && value > 0
		? value
		: 1;
}
```

Replace the `portfolioContent` export (lines 356-415). Current start:

```ts
export const portfolioContent: Effect.Effect<
	string,
	never,
	AppConfig | MeteoraApi | Dlmm
> = Effect.gen(function* () {
```

New:

```ts
export const portfolioContent = (
	opts: { readonly closedPage?: number } = {},
): Effect.Effect<string, never, AppConfig | MeteoraApi | Dlmm> =>
	Effect.gen(function* () {
```

Inside the effect, replace the closed fetch block (lines 376-379):

```ts
	const closed = yield* api.closedPortfolio(wallet, 1, 10).pipe(
		Effect.map((response) => response.pools),
		Effect.catchAll(() => Effect.succeed([] as ClosedPool[])),
	);
```

with:

```ts
	const closedRes = yield* api
		.closedPortfolio(wallet, normalizePage(opts.closedPage), CLOSED_PAGE_SIZE)
		.pipe(Effect.catchAll(() => Effect.succeed(null)));
	const closed = closedRes?.pools ?? [];
```

And replace the return (line 412):

```ts
	return renderPortfolio({ total, open, closed }, readHistory());
```

with:

```ts
	const closedPagination: ClosedPagination | null =
		closedRes !== null
			? {
					page: closedRes.page,
					pageSize: closedRes.pageSize,
					total: closedRes.totalCount,
				}
			: null;
	return renderPortfolio({ total, open, closed }, readHistory(), closedPagination);
```

The rest of the effect (open fetch, totals, snapshot recording, final catchAll pipe) stays as-is. `ClosedPool` import remains used (open enrichment still references it in the catchAll type) — verify after edit; if the `ClosedPool` type import is only used by the removed catchAll, change the import to `import type { ClosedPool }` and keep using it in the `closed: readonly ClosedPool[]` member of `PortfolioData` (it is used there, so the import stays).

- [ ] **Step 4: Update server routes**

In `src/web/server.ts`, replace the `portfolioPage`/`portfolioPartial` block (lines 134-147):

```ts
	const portfolioPage = portfolioContent.pipe(
		Effect.map((inner) =>
			pageResponse(
				"Portfolio",
				"portfolio",
				inner,
				"/partials/portfolio",
				shell,
			),
		),
	);
	const portfolioPartial = portfolioContent.pipe(
		Effect.map((inner) => partialResponse(inner, "/partials/portfolio")),
	);
```

with:

```ts
	const portfolioRoute = Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const url = new URL(request.url, "http://localhost");
		const rawPage = url.searchParams.get("closedPage");
		const parsedPage = rawPage === null ? 1 : Number(rawPage);
		const closedPage =
			Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
		const refreshPath =
			closedPage > 1
				? `/partials/portfolio?closedPage=${closedPage}`
				: "/partials/portfolio";
		const inner = yield* portfolioContent({ closedPage });
		return { inner, refreshPath };
	});
	const portfolioPage = portfolioRoute.pipe(
		Effect.map(({ inner, refreshPath }) =>
			pageResponse("Portfolio", "portfolio", inner, refreshPath, shell),
		),
	);
	const portfolioPartial = portfolioRoute.pipe(
		Effect.map(({ inner, refreshPath }) =>
			partialResponse(inner, refreshPath),
		),
	);
```

This mirrors the existing agent route parsing (server.ts:168-179). The refresh path preserves the page across htmx 30s auto-refresh.

- [ ] **Step 5: Run the focused tests**

Run: `npx vitest run test/web-portfolio-page.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Run the full verification suite**

Run: `npm run check && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/web/pages/portfolio.ts src/web/server.ts test/web-portfolio-page.test.ts
git commit -m "feat(web): wire closed position pagination through portfolio routes"
```
