# Closed Positions Per-Pool Detail Dropdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expand/collapse chevron to each row of the web dashboard's Closed Positions table that lazy-loads and shows the individual closed positions for that pool.

**Architecture:** The aggregate per-pool rows (web/CLI/Telegram) stay unchanged. On the web dashboard only, each closed-pool row gets a chevron button whose `data-closed-detail` URL points to a new authenticated partial route `/partials/closed-positions?pool=...&pair=...`. The route calls the existing `api.positionPnl(pool, wallet, "closed")` service method, maps the per-position response through a new pure renderer `renderClosedDetail(pair, positions)`, and returns nested table HTML. A small vanilla JS click handler (delegated on `document`, bound once via a `window` guard so htmx partial swaps don't duplicate listeners) fetches the partial on first click and toggles visibility afterwards.

**Tech Stack:** Effect, @effect/platform (HttpRouter/HttpServerRequest), htmx (already used for 30s auto-refresh), vanilla JS, Biome, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-13-closed-positions-dropdown-design.md`

## Global Constraints

- ESM-only: all relative imports use `.js` extensions (`import { x } from "./foo.js"`).
- Biome style: tab indent, double quotes, organize imports (`npm run check`).
- TypeScript strict, no unused locals/params (`npm run typecheck`).
- Tests are pure unit tests with inline fixtures; `test/` and `src/**/*.test.ts` are excluded from tsc.
- No code comments unless the codebase already has them there.
- Tagged errors in `src/errors.ts`; no thrown exceptions.
- API responses decoded with `Effect.Schema` at the boundary (`PositionPnLData` etc.).
- Verify after each task: `npm run check && npm run typecheck && npm test`.
- Commit per task with a concise message matching repo style (e.g. `feat(web): ...`).

---

### Task 1: `renderClosedDetail` pure renderer

**Files:**
- Modify: `src/web/pages/portfolio.ts` (add function; exports already imported: `table`, `fmtUsd`, `fmtPct`, `fmtSol`, `pnlClass`, `tsLocal`, `escapeHtml`, `shortAddr` — see imports at lines 1-29)
- Test: `test/web-portfolio-page.test.ts`

**Interfaces:**
- Consumes: `PositionPnLData` (from `../../domain/index.js`), existing helpers `table`, `fmtUsd`, `fmtPct`, `fmtSol`, `pnlClass`, `tsLocal`, `escapeHtml`, `shortAddr` (all already exported from `../templates.js` / `../layout.js`).
- Produces: `renderClosedDetail(pair: string, positions: readonly PositionPnLData[]): string` — the inner HTML for a pool's expanded detail area (`.detail-inner` content): a `detail-head` label plus a nested table, or a muted empty message when there are no closed positions.

- [ ] **Step 1: Write the failing tests**

Add to `test/web-portfolio-page.test.ts`:

```ts
import { renderClosedDetail, renderPortfolio } from "../src/web/pages/portfolio.js";
import type { PositionPnLData } from "../src/domain/index.js";

const mkPos = (over: Partial<PositionPnLData> = {}): PositionPnLData => ({
	positionAddress: "posA",
	minPrice: "0.5",
	maxPrice: "2",
	lowerBinId: -34,
	upperBinId: 35,
	feePerTvl24h: "0.5",
	isClosed: true,
	pnlUsd: "10",
	pnlPctChange: "5.2",
	pnlSol: "0.1",
	pnlSolPctChange: "5.1",
	allTimeDeposits: {
		tokenX: { amount: "10", amountSol: null, usd: "5" },
		tokenY: { amount: "1", amountSol: "1", usd: "100" },
		total: { usd: "105", sol: "1" },
	},
	allTimeWithdrawals: {
		tokenX: { amount: "0", amountSol: null, usd: "0" },
		tokenY: { amount: "0", amountSol: "0", usd: "0" },
		total: { usd: "60", sol: "0.4" },
	},
	allTimeFees: {
		tokenX: { amount: "0.1", amountSol: null, usd: "0.05" },
		tokenY: { amount: "0.01", amountSol: "0.01", usd: "1" },
		total: { usd: "1.05", sol: "0.01" },
	},
	closedAt: 1_754_000_000,
	createdAt: 1_753_000_000,
	isOutOfRange: false,
	poolActiveBinId: 0,
	poolActivePrice: "1.5",
	...over,
});

describe("renderClosedDetail", () => {
	it("renders one row per closed position with deposit/withdraw/fees/pnl", () => {
		const html = renderClosedDetail("OLD/SOL", [
			mkPos(),
			mkPos({
				positionAddress: "posB",
				pnlUsd: "-5",
				pnlPctChange: "-8",
				pnlSol: "-0.05",
				closedAt: null,
			}),
		]);
		expect(html).toContain("CLOSED POSITIONS // OLD/SOL");
		expect(html).toContain("posA");
		expect(html).toContain("posB");
		expect(html).toContain("$105.00");
		expect(html).toContain("$60.00");
		expect(html).toContain("$1.05");
		expect(html).toContain("+5.20%");
		expect(html).toContain("-8.00%");
		expect(html).toContain("loss");
		expect(html).toContain("https://solscan.io/account/posA");
	});

	it("filters out open positions and shows an empty message", () => {
		const html = renderClosedDetail("A/SOL", [mkPos({ isClosed: false })]);
		expect(html).toContain("No closed positions");
		expect(html).not.toContain("posA");
	});

	it("shows placeholders for null closedAt and null pnlSol", () => {
		const html = renderClosedDetail("A/SOL", [
			mkPos({ closedAt: null, pnlSol: null }),
		]);
		expect(html).toContain(">posA</a>");
	});
});
```

Note: the second position fixture keeps all default fields except the overrides shown, so `tsLocal(null)` renders `-` and `fmtSol("-0.05")` renders with a `loss` class. The existing `mkClosed` helper above stays untouched.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run test/web-portfolio-page.test.ts`
Expected: FAIL — `renderClosedDetail is not a function` / no exported member.

- [ ] **Step 3: Implement `renderClosedDetail`**

In `src/web/pages/portfolio.ts`, add `PositionPnLData` to the domain type import at line 2-6:

```ts
import type {
	ClosedPool,
	OpenPool,
	PortfolioTotal,
	PositionPnLData,
} from "../../domain/index.js";
```

Add this function after `renderClosed` (after line 205):

```ts
export function renderClosedDetail(
	pair: string,
	positions: readonly PositionPnLData[],
): string {
	const closed = positions.filter((pos) => pos.isClosed);
	if (closed.length === 0) {
		return `<span class="muted">No closed positions</span>`;
	}
	const rows = closed.map((pos) => {
		const pnlPct = parseFloat(pos.pnlPctChange);
		const pnlSol = pos.pnlSol != null ? parseFloat(String(pos.pnlSol)) : NaN;
		const addrLink = `<a href="${escapeHtml(`https://solscan.io/account/${pos.positionAddress}`)}" target="_blank" rel="noopener" class="mono">${escapeHtml(shortAddr(pos.positionAddress))}</a>`;
		return `<tr>
<td>${addrLink}</td>
<td>${fmtUsd(pos.allTimeDeposits.total.usd)}</td>
<td>${fmtUsd(pos.allTimeWithdrawals.total.usd)}</td>
<td>${fmtUsd(pos.allTimeFees.total.usd)}</td>
<td class="${pnlClass(pnlPct)}">${fmtUsd(pos.pnlUsd)}<div class="sub">${fmtPct(pnlPct)}</div></td>
<td class="${pnlClass(pnlSol)}">${fmtSol(pos.pnlSol)}</td>
<td class="mono">${escapeHtml(tsLocal(pos.closedAt))}</td>
</tr>`;
	});
	return `<span class="detail-head">CLOSED POSITIONS // ${escapeHtml(pair)}</span>${table(
		["Position", "Deposit", "Withdraw", "Fees", "PnL USD", "PnL SOL", "Closed"],
		rows,
		"detail-table",
	)}`;
}
```

Imports already present in `src/web/pages/portfolio.ts` that this uses: `escapeHtml` (line 12), `fmtUsd`, `fmtPct`, `fmtSol`, `pnlClass`, `table`, `tsLocal` (lines 18-29). `shortAddr` needs adding to the `../layout.js` import:

```ts
import { errorBanner, escapeHtml, shortAddr } from "../layout.js";
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `npx vitest run test/web-portfolio-page.test.ts`
Expected: PASS (all existing tests in the file still pass too).

- [ ] **Step 5: Run the full verify chain**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/web/pages/portfolio.ts test/web-portfolio-page.test.ts
git commit -m "feat(web): render closed position details per pool"
```

---

### Task 2: Chevron, detail rows, and toggle JS in the closed table

**Files:**
- Modify: `src/web/pages/portfolio.ts` (`renderClosed`, lines 180-205; `renderPortfolio` return, line 87-96)
- Modify: `src/web/theme.ts` (after the table styles around line 314)
- Test: `test/web-portfolio-page.test.ts`

**Interfaces:**
- Consumes: Task 1's `renderClosedDetail` (loaded by the JS fetch, not imported here); `ClosedPool`, `escapeHtml`, `meteoraUrl`.
- Produces: chevron button markup `class="chevron"` with `data-closed-detail` URL, hidden `<tr class="detail-row" hidden><td colspan="7"><div class="detail-inner"></div></td></tr>` after each pool row, and a delegated click handler script (guard flag `window.__vexisClosedBound`).

- [ ] **Step 1: Write the failing tests**

Add to `test/web-portfolio-page.test.ts` (inside the existing `describe("renderPortfolio")` block, after the "renders closed positions with realized pnl class" test at line 112):

```ts
it("adds chevron and detail row for each closed pool", () => {
	const html = renderPortfolio({
		total: mkTotal(),
		open: [],
		closed: [mkClosed()],
	});
	expect(html).toContain('class="chevron"');
	expect(html).toContain('class="detail-row"');
	expect(html).toContain("/partials/closed-positions?pool=pool2");
	expect(html).toContain("__vexisClosedBound");
});

it("does not emit chevron script when there are no closed pools", () => {
	const html = renderPortfolio({ total: mkTotal(), open: [], closed: [] });
	expect(html).not.toContain('class="chevron"');
	expect(html).not.toContain("__vexisClosedBound");
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run test/web-portfolio-page.test.ts`
Expected: FAIL — no `chevron`/`__vexisClosedBound` in HTML.

- [ ] **Step 3: Implement chevron + detail rows + script**

Replace the body of `renderClosed` in `src/web/pages/portfolio.ts` (current lines 180-205):

```ts
function renderClosed(pools: readonly ClosedPool[]): string {
	if (pools.length === 0) {
		return `<h2>Closed Positions <span class="sub">// 0</span></h2><div class="empty">No closed positions</div>`;
	}

	const rows = pools.map((pool) => {
		const pair = `${pool.tokenX ?? "?"}/${pool.tokenY ?? "?"}`;
		const pnlPct = parseFloat(pool.pnlPctChange);
		const pnlSol = parseFloat(pool.pnlSol);
		const detailUrl = `/partials/closed-positions?pool=${encodeURIComponent(pool.poolAddress)}&pair=${encodeURIComponent(pair)}`;
		const chevron = `<button type="button" class="chevron" data-closed-detail="${escapeHtml(detailUrl)}" aria-label="Show closed positions for ${escapeHtml(pair)}">&#9656;</button>`;
		const link = `<a href="${escapeHtml(meteoraUrl(pool.poolAddress))}" target="_blank" rel="noopener">${escapeHtml(pair)}</a>`;
		return `<tr class="closed-row">
<td>${chevron}${link}</td>
<td>${fmtUsd(pool.totalDeposit)}</td>
<td>${fmtUsd(pool.totalWithdrawal)}</td>
<td>${fmtUsd(pool.totalFee)}</td>
<td class="${pnlClass(pnlPct)}">${fmtUsd(pool.pnlUsd)}<div class="sub">${fmtPct(pnlPct)}</div></td>
<td class="${pnlClass(pnlSol)}">${fmtSol(pool.pnlSol)}</td>
<td class="mono">${escapeHtml(tsLocal(pool.lastClosedAt))}</td>
</tr>
<tr class="detail-row" hidden><td colspan="7"><div class="detail-inner"></div></td></tr>`;
	});

	return `<h2>Closed Positions <span class="sub">// ${pools.length} pools</span></h2>${table(
		["Pool", "Deposit", "Withdraw", "Fees", "PnL USD", "PnL SOL", "Closed"],
		rows,
	)}${closedDetailScript()}`;
}

function closedDetailScript(): string {
	return `<script>
(function () {
	if (window.__vexisClosedBound) return;
	window.__vexisClosedBound = true;
	document.addEventListener("click", function (e) {
		var btn = e.target && e.target.closest ? e.target.closest(".chevron") : null;
		if (!btn) return;
		var row = btn.closest("tr");
		var detail = row ? row.nextElementSibling : null;
		if (!detail || !detail.classList.contains("detail-row")) return;
		var inner = detail.querySelector(".detail-inner");
		if (detail.classList.contains("loaded")) {
			detail.hidden = !detail.hidden;
			btn.classList.toggle("open");
			return;
		}
		fetch(btn.getAttribute("data-closed-detail"))
			.then(function (res) { return res.text(); })
			.then(function (html) {
				inner.innerHTML = html;
				detail.hidden = false;
				btn.classList.add("open");
				detail.classList.add("loaded");
			});
	});
})();
</script>`;
}
```

`meteoraUrl` must be added to the `../templates.js` import list in `src/web/pages/portfolio.ts` (line 18-29).

- [ ] **Step 4: Add the CSS to `src/web/theme.ts`**

Insert after the `.mono` rule (line 314):

```css
.chevron { padding: 0 6px 0 0; border: 0; background: transparent; color: var(--muted); font: 700 12px monospace; cursor: pointer; transition: transform 150ms ease; vertical-align: middle; }
.chevron.open { transform: rotate(90deg); }
.detail-row td { padding: 0 18px 16px; background: color-mix(in srgb, var(--panel-2) 45%, var(--panel)); }
.detail-row:hover { background: transparent; }
.detail-row[hidden] { display: none; }
.detail-inner { padding: 14px 0 0; }
.detail-head { display: block; margin-bottom: 10px; color: var(--muted); font: 9px monospace; letter-spacing: 0.1em; }
.table-scroll .detail-table { min-width: 0 !important; }
.detail-error { padding: 14px 18px; border: 1px solid var(--loss); color: var(--loss); font-size: 11px; }
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `npx vitest run test/web-portfolio-page.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full verify chain**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/web/pages/portfolio.ts src/web/theme.ts test/web-portfolio-page.test.ts
git commit -m "feat(web): expandable closed positions rows with lazy detail"
```

---

### Task 3: `/partials/closed-positions` route + effect

**Files:**
- Modify: `src/web/pages/portfolio.ts` (add `closedPositionsContent`)
- Modify: `src/web/server.ts` (imports + route in `buildRouter`, lines 85-197)
- Test: `test/web-portfolio-page.test.ts`

**Interfaces:**
- Consumes: `AppConfig` (from `../../services/Config.js`), `MeteoraApi` (from `../../services/MeteoraApi.js`), `api.positionPnl(pool, wallet, "closed", 1, 100)` (already on the service, `MeteoraApi.ts:238`), Task 1's `renderClosedDetail`, `errorBanner`/`errorMessage`.
- Produces: `closedPositionsContent(pool: string, pair: string): Effect.Effect<string, never, AppConfig | MeteoraApi>` and route `GET /partials/closed-positions?pool=ADDR&pair=PAIR` returning detail HTML (or `detail-error` div on API failure).

- [ ] **Step 1: Write the failing tests**

Add to `test/web-portfolio-page.test.ts`:

```ts
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { AppConfigTest } from "../src/services/Config.js";
import { MeteoraApiLayer } from "../src/services/MeteoraApi.js";
import { closedPositionsContent } from "../src/web/pages/portfolio.js";

const closedPnlBody = {
	totalCount: 1,
	page: 1,
	pageSize: 100,
	hasNext: false,
	positions: [
		{
			positionAddress: "posA",
			minPrice: "0.5",
			maxPrice: "2",
			lowerBinId: -34,
			upperBinId: 35,
			feePerTvl24h: "0.5",
			isClosed: true,
			pnlUsd: "10",
			pnlPctChange: "5.2",
			pnlSol: "0.1",
			pnlSolPctChange: "5.1",
			allTimeDeposits: {
				tokenX: { amount: "10", amountSol: null, usd: "5" },
				tokenY: { amount: "1", amountSol: "1", usd: "100" },
				total: { usd: "105", sol: "1" },
			},
			allTimeWithdrawals: {
				tokenX: { amount: "0", amountSol: null, usd: "0" },
				tokenY: { amount: "0", amountSol: "0", usd: "0" },
				total: { usd: "60", sol: "0.4" },
			},
			allTimeFees: {
				tokenX: { amount: "0.1", amountSol: null, usd: "0.05" },
				tokenY: { amount: "0.01", amountSol: "0.01", usd: "1" },
				total: { usd: "1.05", sol: "0.01" },
			},
			closedAt: 1_754_000_000,
			createdAt: 1_753_000_000,
			isOutOfRange: false,
			poolActiveBinId: 0,
			poolActivePrice: "1.5",
		},
	],
	tokenX: "OLD",
	tokenXPrice: "1",
	tokenY: "SOL",
	tokenYPrice: "150",
	solPrice: "150",
	rewardTokenX: null,
	rewardTokenXPrice: "0",
	rewardTokenY: null,
	rewardTokenYPrice: "0",
};

const mockClient = (
	handler: (url: string) => { body: unknown; status?: number },
) =>
	Layer.succeed(
		HttpClient.HttpClient,
		HttpClient.make((req) => {
			const { body, status } = handler(req.url);
			return Effect.succeed(
				HttpClientResponse.fromWeb(
					HttpClientRequest.get(req.url),
					new Response(JSON.stringify(body), {
						status: status ?? 200,
						headers: { "content-type": "application/json" },
					}),
				),
			);
		}),
	);

const layerWith = (
	handler: (url: string) => { body: unknown; status?: number },
) =>
	MeteoraApiLayer.pipe(
		Layer.provide(mockClient(handler)),
		Layer.provideMerge(AppConfigTest({})),
	);

describe("closedPositionsContent", () => {
	it("renders closed positions detail for a pool", async () => {
		const result = await Effect.runPromise(
			closedPositionsContent("PoolX", "OLD/SOL").pipe(
				Effect.provide(
					layerWith((url) =>
						url.includes("/positions/PoolX/pnl")
							? { body: closedPnlBody }
							: { body: { error: "unexpected" }, status: 404 },
					),
				),
			),
		);
		expect(result).toContain("CLOSED POSITIONS // OLD/SOL");
		expect(result).toContain("posA");
		expect(result).toContain("$105.00");
	});

	it("returns an empty string when no pool is given", async () => {
		const result = await Effect.runPromise(
			closedPositionsContent("", "").pipe(Effect.provide(layerWith(() => ({ body: {} })))),
		);
		expect(result).toBe("");
	});

	it("shows an error message when the API call fails", async () => {
		const result = await Effect.runPromise(
			closedPositionsContent("PoolX", "OLD/SOL").pipe(
				Effect.provide(
					layerWith(() => ({ body: { error: "nope" }, status: 500 })),
				),
			),
		);
		expect(result).toContain("Failed to load closed positions");
	});
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run test/web-portfolio-page.test.ts`
Expected: FAIL — `closedPositionsContent is not a function`.

- [ ] **Step 3: Implement `closedPositionsContent`**

In `src/web/pages/portfolio.ts`, add the effect after `renderClosedDetail`. No new imports are needed: `Effect` (line 1), `errorMessage` (line 7), `AppConfig` (line 8), and `MeteoraApi` (line 10) are all already imported.

```ts
export const closedPositionsContent = (
	pool: string,
	pair: string,
): Effect.Effect<string, never, AppConfig | MeteoraApi> =>
	Effect.gen(function* () {
		if (!pool) return "";
		const config = yield* AppConfig;
		const wallet = yield* config.wallet();
		const api = yield* MeteoraApi;
		const res = yield* api
			.positionPnl(pool, wallet, "closed", 1, 100)
			.pipe(Effect.catchAll(() => Effect.succeed(null)));
		if (res === null) {
			return `<div class="detail-error">Failed to load closed positions</div>`;
		}
		return renderClosedDetail(pair, res.positions);
	});
```

- [ ] **Step 4: Wire the route in `src/web/server.ts`**

Add `closedPositionsContent` to the import from `./pages/portfolio.js` (line 22):

```ts
import {
	closedPositionsContent,
	portfolioContent,
} from "./pages/portfolio.js";
```

Add `errorMessage` to the import from `../errors.js` (new import line, after the `AppConfig` import on line 9):

```ts
import { errorMessage } from "../errors.js";
```

Add `errorBanner` to the `./layout.js` import (line 18):

```ts
import {
	contentRegion,
	errorBanner,
	loginPage,
	pageShell,
	rpcHost,
} from "./layout.js";
```

Inside `buildRouter`, after `portfolioPartial` (line 140), add:

```ts
const closedDetailRoute = Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	const url = new URL(request.url, "http://localhost");
	const pool = url.searchParams.get("pool") ?? "";
	const pair = url.searchParams.get("pair") ?? "";
	const html = yield* closedPositionsContent(pool, pair).pipe(
		Effect.catchAll((error) =>
			Effect.succeed(errorBanner(errorMessage(error))),
		),
	);
	return HttpServerResponse.html(html);
});
```

Register the route in the router chain after `/partials/portfolio` (line 191):

```ts
HttpRouter.get("/partials/closed-positions", closedDetailRoute),
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `npx vitest run test/web-portfolio-page.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full verify chain**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/web/pages/portfolio.ts src/web/server.ts test/web-portfolio-page.test.ts
git commit -m "feat(web): lazy closed position detail endpoint"
```

---

### Task 4: Manual smoke test

**Files:** none (run the app)

- [ ] **Step 1: Run the bot with the web dashboard**

Run: `npm run bot` (config must have `web.enabled: true` and `web.password` set).

- [ ] **Step 2: Verify on the dashboard**

- Open `http://127.0.0.1:<port>/portfolio`.
- In the Closed Positions table, each pool row now has a `▸` chevron before the pool name.
- Click the chevron: a nested table appears with one row per closed position (Position address, Deposit, Withdraw, Fees, PnL USD, PnL SOL, Closed). Position addresses link to `https://solscan.io/account/...`.
- Click again: the detail collapses (no re-fetch).
- Expand a pool whose positions all show `isClosed=false` (should not happen in practice) or an API failure: the row shows the muted empty message or `detail-error` respectively.
- Wait for the 30s auto-refresh: the table re-renders collapsed — expanding again still works (script rebinding is guarded).
- Confirm the aggregate totals per pool are unchanged vs. before this feature.

**Expected:** all interactions work; the rest of the dashboard is unaffected.
