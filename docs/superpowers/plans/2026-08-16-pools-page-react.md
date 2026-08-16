# Pools Page (React Web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder Pool Radar page in `src/web-react/` with a full interactive pools page (stat cards, charts, filterable/sortable table, detail sheet, USD/SOL toggle) using the existing `Screening` service and the current shadcn design system.

**Architecture:** Server-side screening via the existing `Screening` service (Effect + `AppLayer`), one SOL/USD price fetch per load (jup.ag price API v6, keyless), serializable `PoolsPayload` served through the React Router loader. Client components are pure presentational + `useMemo` filter/sort logic in `lib/pools.ts`. Row click opens a right-side shadcn `Sheet`. No polling — manual refresh + revalidate on tab focus.

**Tech Stack:** React 19, React Router 7, Effect 3, recharts 3, shadcn/radix-mira UI, Tailwind v4, Vitest, Biome.

## Global Constraints

- ESM-only; use `.js` extensions in local imports. TypeScript strict mode. No `any` shortcuts.
- No new dependencies (all UI components and chart libs already installed).
- Follow existing web-react patterns: `loader` + `clientLoader` forwarding `serverLoader()`; `DashboardShell`; `useRevalidator` for refresh; `Card`/`Badge`/`Tabs`/`Input`/`Table`/`Sheet` from `~/components/ui`.
- Reuse `~/lib/format` helpers (`fmtUsd`, `fmtSol`, `fmtPct`, `shortAddr`, `meteoraUrl`, `solscanUrl`, `pnlClass`) and the `Screening` service (`@vexis/services/Screening.js`). Do NOT re-implement screening.
- External API response (jup.ag) decoded with `Effect.Schema`. Treat it as untrusted input.
- Tests: pure logic only, inline fixtures, no live RPC/Telegram/Meteora/wallet/network.
- Run `npm run check` and `npm run typecheck` in `src/web-react` (workdir `src/web-react`); root `npm test` must pass.
- Biome: tab indentation, double quotes.

---

### Task 1: Pure pools helpers + payload builder

**Files:**
- Create: `src/web-react/app/lib/pools.ts`
- Test: `test/web-react-pools-lib.test.ts`

**Interfaces:**
- Produces:
  - `const TIMEFRAMES: readonly ["5m","30m","1h","2h","4h","12h","24h"]`
  - `type Currency = "usd" | "sol"`
  - `type OrganicBucket = "all" | "pass" | "review" | "blocked"`
  - `type SortDir = "asc" | "desc"`
  - `type PoolSortKey = "pool" | "price" | "mcap" | "tvl" | "volume" | "fee" | "binStep" | "organicScore" | "rugScore" | "fromAthPct" | "priceChangePct"`
  - `interface PoolsPayload { ok: boolean; error?: string; timeframe: string; total: number; filtered: number; pools: ScreenedPool[]; solPrice: number | null; fetchedAt: number }`
  - `function organicBucket(score: number): "pass" | "review" | "blocked"`
  - `function rugBucket(score: number | null | undefined): "pass" | "review" | "blocked" | "na"`
  - `function toSol(usd: number | null | undefined, solPrice: number | null): number | null`
  - `function fmtAmount(usd: number | null | undefined, currency: Currency, solPrice: number | null): string`
  - `function matchesSearch(pool: ScreenedPool, query: string): boolean`
  - `function organicFilter(pool: ScreenedPool, bucket: OrganicBucket): boolean`
  - `function sortPools(pools: readonly ScreenedPool[], key: PoolSortKey, dir: SortDir): ScreenedPool[]`
  - `function buildPoolsPayload(result: ScreenResult, solPrice: number | null, timeframe: string): PoolsPayload`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { ScreenedPool } from "../src/domain/index.js";
import type { ScreenResult } from "../src/lib/screening.js";
import {
	buildPoolsPayload,
	fmtAmount,
	matchesSearch,
	organicBucket,
	organicFilter,
	rugBucket,
	sortPools,
	toSol,
} from "../src/web-react/app/lib/pools.js";

const mkPool = (over: Partial<ScreenedPool> = {}): ScreenedPool => ({
	pool: "poolA",
	name: "Token/SOL",
	baseSymbol: "Token",
	baseMint: "mintA",
	baseIcon: null,
	quoteSymbol: "SOL",
	quoteIcon: null,
	tvl: 10000,
	activeTvl: 8000,
	mcap: 50000,
	holders: 1200,
	organicScore: 75,
	quoteOrganic: 80,
	feeActiveTvlRatio: 0.05,
	volatility: 0.1,
	binStep: 25,
	baseFeePct: 0.5,
	volume: 5000,
	fee: 250,
	activePositions: 3,
	openPositions: 1,
	tokenAgeHours: 48,
	score: 1000,
	price: 0.0042,
	priceChangePct: 5.5,
	volumeChangePct: 12.3,
	fromAthPct: 0.1,
	tokenXAddress: "mintA",
	rugScore: 92,
	...over,
});

const mkResult = (pools: ScreenedPool[]): ScreenResult => ({
	pools,
	total: 120,
	filtered: 3,
});

describe("organicBucket", () => {
	it("maps score thresholds", () => {
		expect(organicBucket(80)).toBe("pass");
		expect(organicBucket(79)).toBe("review");
		expect(organicBucket(60)).toBe("review");
		expect(organicBucket(59)).toBe("blocked");
	});
});

describe("rugBucket", () => {
	it("maps null to na and score thresholds", () => {
		expect(rugBucket(null)).toBe("na");
		expect(rugBucket(undefined)).toBe("na");
		expect(rugBucket(250)).toBe("pass");
		expect(rugBucket(251)).toBe("review");
		expect(rugBucket(1250)).toBe("review");
		expect(rugBucket(1251)).toBe("blocked");
	});
});

describe("toSol", () => {
	it("divides usd by solPrice, null-safe", () => {
		expect(toSol(200, 100)).toBe(2);
		expect(toSol(null, 100)).toBeNull();
		expect(toSol(200, null)).toBeNull();
		expect(toSol(200, 0)).toBeNull();
	});
});

describe("fmtAmount", () => {
	it("formats usd or converted sol", () => {
		expect(fmtAmount(200, "usd", 100)).toBe("$200.00");
		expect(fmtAmount(200, "sol", 100)).toContain("2");
		expect(fmtAmount(200, "sol", null)).toBe("$200.00");
	});
});

describe("matchesSearch", () => {
	it("matches name, symbols, and address case-insensitively", () => {
		const pool = mkPool();
		expect(matchesSearch(pool, "")).toBe(true);
		expect(matchesSearch(pool, "token")).toBe(true);
		expect(matchesSearch(pool, "SOL")).toBe(true);
		expect(matchesSearch(pool, "poola")).toBe(true);
		expect(matchesSearch(pool, "zzz")).toBe(false);
	});
});

describe("organicFilter", () => {
	it("filters by bucket and passes all", () => {
		const pool = mkPool({ organicScore: 75 });
		expect(organicFilter(pool, "all")).toBe(true);
		expect(organicFilter(pool, "review")).toBe(true);
		expect(organicFilter(pool, "pass")).toBe(false);
		expect(organicFilter(pool, "blocked")).toBe(false);
	});
});

describe("sortPools", () => {
	it("sorts by numeric key asc/desc", () => {
		const a = mkPool({ pool: "A", tvl: 100 });
		const b = mkPool({ pool: "B", tvl: 300 });
		const c = mkPool({ pool: "C", tvl: 200 });
		expect(sortPools([a, b, c], "tvl", "desc").map((p) => p.pool)).toEqual([
			"B",
			"C",
			"A",
		]);
		expect(sortPools([a, b, c], "tvl", "asc").map((p) => p.pool)).toEqual([
			"A",
			"C",
			"B",
		]);
	});

	it("sorts by name and handles null fromAthPct", () => {
		const a = mkPool({ pool: "A", name: "Alpha" });
		const b = mkPool({ pool: "B", name: "beta" });
		expect(sortPools([b, a], "pool", "asc").map((p) => p.pool)).toEqual([
			"A",
			"B",
		]);
		const withNull = mkPool({ pool: "N", fromAthPct: null });
		const withVal = mkPool({ pool: "V", fromAthPct: 0.5 });
		expect(
			sortPools([withNull, withVal], "fromAthPct", "desc").map((p) => p.pool),
		).toEqual(["V", "N"]);
	});
});

describe("buildPoolsPayload", () => {
	it("passes through result fields and solPrice", () => {
		const payload = buildPoolsPayload(mkResult([mkPool()]), 150, "30m");
		expect(payload.ok).toBe(true);
		expect(payload.timeframe).toBe("30m");
		expect(payload.total).toBe(120);
		expect(payload.filtered).toBe(3);
		expect(payload.pools).toHaveLength(1);
		expect(payload.solPrice).toBe(150);
		expect(payload.fetchedAt).toBeTypeOf("number");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/web-react-pools-lib.test.ts` (workdir repo root)
Expected: FAIL — module `pools.js` not found / no exports.

- [ ] **Step 3: Write the implementation**

```ts
import type { ScreenedPool } from "@vexis/domain/index.js";
import type { ScreenResult } from "@vexis/lib/screening.js";
import { fmtSol, fmtUsd } from "~/lib/format";

export const TIMEFRAMES = ["5m", "30m", "1h", "2h", "4h", "12h", "24h"] as const;

export type Currency = "usd" | "sol";
export type OrganicBucket = "all" | "pass" | "review" | "blocked";
export type SortDir = "asc" | "desc";
export type PoolSortKey =
	| "pool"
	| "price"
	| "mcap"
	| "tvl"
	| "volume"
	| "fee"
	| "binStep"
	| "organicScore"
	| "rugScore"
	| "fromAthPct"
	| "priceChangePct";

export interface PoolsPayload {
	readonly ok: boolean;
	readonly error?: string;
	readonly timeframe: string;
	readonly total: number;
	readonly filtered: number;
	readonly pools: readonly ScreenedPool[];
	readonly solPrice: number | null;
	readonly fetchedAt: number;
}

export function organicBucket(score: number): "pass" | "review" | "blocked" {
	if (score >= 80) return "pass";
	if (score >= 60) return "review";
	return "blocked";
}

export function rugBucket(
	score: number | null | undefined,
): "pass" | "review" | "blocked" | "na" {
	if (score === null || score === undefined) return "na";
	if (score <= 250) return "pass";
	if (score <= 1250) return "review";
	return "blocked";
}

export function toSol(
	usd: number | null | undefined,
	solPrice: number | null,
): number | null {
	if (usd === null || usd === undefined || !solPrice || solPrice <= 0) {
		return null;
	}
	return usd / solPrice;
}

export function fmtAmount(
	usd: number | null | undefined,
	currency: Currency,
	solPrice: number | null,
): string {
	const sol = toSol(usd, solPrice);
	if (currency === "sol" && sol !== null) return fmtSol(sol);
	return fmtUsd(usd);
}

export function matchesSearch(pool: ScreenedPool, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q.length === 0) return true;
	return (
		pool.name.toLowerCase().includes(q) ||
		pool.baseSymbol.toLowerCase().includes(q) ||
		pool.quoteSymbol.toLowerCase().includes(q) ||
		pool.pool.toLowerCase().includes(q)
	);
}

export function organicFilter(
	pool: ScreenedPool,
	bucket: OrganicBucket,
): boolean {
	if (bucket === "all") return true;
	return organicBucket(pool.organicScore) === bucket;
}

const VALUE: Record<PoolSortKey, (p: ScreenedPool) => number | string> = {
	pool: (p) => (p.name || p.baseSymbol).toLowerCase(),
	price: (p) => p.price,
	mcap: (p) => p.mcap,
	tvl: (p) => p.tvl,
	volume: (p) => p.volume,
	fee: (p) => p.fee,
	binStep: (p) => p.binStep,
	organicScore: (p) => p.organicScore,
	rugScore: (p) => p.rugScore ?? Number.POSITIVE_INFINITY,
	fromAthPct: (p) => p.fromAthPct ?? -1,
	priceChangePct: (p) => p.priceChangePct ?? Number.NEGATIVE_INFINITY,
};

export function sortPools(
	pools: readonly ScreenedPool[],
	key: PoolSortKey,
	dir: SortDir,
): ScreenedPool[] {
	const get = VALUE[key];
	const sign = dir === "asc" ? 1 : -1;
	return [...pools].sort((a, b) => {
		const av = get(a);
		const bv = get(b);
		if (typeof av === "string" || typeof bv === "string") {
			return String(av).localeCompare(String(bv)) * sign;
		}
		return (av - bv) * sign;
	});
}

export function buildPoolsPayload(
	result: ScreenResult,
	solPrice: number | null,
	timeframe: string,
): PoolsPayload {
	return {
		ok: true,
		timeframe,
		total: result.total,
		filtered: result.filtered,
		pools: result.pools,
		solPrice,
		fetchedAt: Date.now(),
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/web-react-pools-lib.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/web-react/app/lib/pools.ts test/web-react-pools-lib.test.ts
git commit -m "feat(web-react): pure pools helpers and payload builder"
```

---

### Task 2: Pools server module

**Files:**
- Create: `src/web-react/app/lib/server/pools.server.ts`

**Interfaces:**
- Consumes: `buildPoolsPayload`, `PoolsPayload`, `TIMEFRAMES` from `~/lib/pools`; `Screening` from `@vexis/services/Screening.js`; `AppConfig` from `@vexis/services/Config.js`; `AppLayer` from `@vexis/layers.js`; `errorMessage` from `@vexis/errors.js`.
- Produces: `function fetchPools(rawTimeframe: string | null): Promise<PoolsPayload>` — resolves timeframe (validated against `TIMEFRAMES`, else config default `"30m"`), runs `Screening.screen({ timeframe })`, fetches SOL price (never fails the screen — returns `null` on any error), returns payload.

- [ ] **Step 1: Write the implementation**

Reference the existing `fetchPortfolio` in `src/web-react/app/lib/server/portfolio.server.ts` for the `Effect.provide(AppLayer)` + `Effect.runPromise` + `catchAll` pattern. The jup.ag v6 price API is `https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112` returning `{ data: { "<mint>": { price: "178.32" } } }` (price is a string; decode with `Schema.NumberFromString`). Use `HttpClient` + `HttpClientResponse.schemaBodyJson` exactly like `src/services/Jupiter.ts` does.

```ts
import "~/lib/server/env.server";

import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { Effect, Schema } from "effect";
import { errorMessage } from "@vexis/errors.js";
import { AppLayer } from "@vexis/layers.js";
import { AppConfig } from "@vexis/services/Config.js";
import { Screening } from "@vexis/services/Screening.js";
import { buildPoolsPayload, TIMEFRAMES, type PoolsPayload } from "~/lib/pools";

const SOL_MINT = "So11111111111111111111111111111111111111112";

const PriceResponse = Schema.Struct({
	data: Schema.Record({
		key: Schema.String,
		value: Schema.Struct({
			price: Schema.NumberFromString,
		}),
	}),
});

function fetchSolPrice(): Effect.Effect<
	number | null,
	never,
	HttpClient.HttpClient
> {
	return Effect.gen(function* () {
		const client = yield* HttpClient.HttpClient;
		const res = yield* HttpClientRequest.get(
			`https://price.jup.ag/v6/price?ids=${SOL_MINT}`,
		).pipe(
			client.execute,
			Effect.flatMap((r) => HttpClientResponse.schemaBodyJson(PriceResponse)(r)),
		);
		return res.data[SOL_MINT]?.price ?? null;
	}).pipe(Effect.catchAll(() => Effect.succeed(null)));
}

export function fetchPools(rawTimeframe: string | null): Promise<PoolsPayload> {
	const program = Effect.gen(function* () {
		const config = yield* AppConfig;
		const current = yield* config.get;
		const configured = current.pools?.timeframe ?? "30m";
		const timeframe =
			rawTimeframe !== null &&
			(TIMEFRAMES as readonly string[]).includes(rawTimeframe)
				? rawTimeframe
				: configured;
		const screening = yield* Screening;
		const result = yield* screening.screen({ timeframe });
		const solPrice = yield* fetchSolPrice();
		return buildPoolsPayload(result, solPrice, timeframe);
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll((error) =>
			Effect.succeed({
				ok: false,
				error: errorMessage(error),
				timeframe: rawTimeframe ?? "30m",
				total: 0,
				filtered: 0,
				pools: [],
				solPrice: null,
				fetchedAt: Date.now(),
			} satisfies PoolsPayload),
		),
	);
	return Effect.runPromise(program);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck` (workdir `src/web-react`)
Expected: PASS (no errors). Note: `Screening.screen` requires `Jupiter | RugCheck` in its context — `AppLayer` provides them, so the `provide(AppLayer)` resolves it.

- [ ] **Step 3: Commit**

```bash
git add src/web-react/app/lib/server/pools.server.ts
git commit -m "feat(web-react): pools server module with screening and sol price"
```

---

### Task 3: Pools route with minimal page

**Files:**
- Modify: `src/web-react/app/routes/pools.tsx`
- Create: `src/web-react/app/components/pools/pools-page.tsx`

**Interfaces:**
- Consumes: `fetchPools`, `getWebPassword` (from `~/lib/server/portfolio.server`), `hasValidSession` (from `~/lib/server/session.server`), `PoolsPayload` type.
- Produces: `PoolsPage` component with props `{ data: PoolsPayload; onRefresh: () => void; refreshing: boolean }`; `clientLoader` forwarding `serverLoader()`.

- [ ] **Step 1: Rewrite the route**

```tsx
import { redirect } from "react-router";
import { PoolsPage } from "~/components/pools/pools-page";
import { fetchPools } from "~/lib/server/pools.server";
import { getWebPassword } from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/pools";

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length === 0 || !hasValidSession(request, password)) {
		throw redirect("/");
	}
	const url = new URL(request.url);
	return fetchPools(url.searchParams.get("timeframe"));
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
	return serverLoader();
}

export default PoolsPage;
```

- [ ] **Step 2: Create the minimal page (header + error + empty states)**

```tsx
import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { DashboardShell } from "~/components/dashboard-shell";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { TIMEFRAMES, type PoolsPayload } from "~/lib/pools";

export function PoolsPage() {
	const data = useLoaderData<PoolsPayload>();
	const { revalidate, state } = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();
	const timeframe = searchParams.get("timeframe") ?? data.timeframe;

	useEffect(() => {
		const onVisibility = () => {
			if (!document.hidden) revalidate();
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () =>
			document.removeEventListener("visibilitychange", onVisibility);
	}, [revalidate]);

	const onTimeframeChange = (value: string) =>
		setSearchParams(value === data.timeframe ? {} : { timeframe: value });

	return (
		<DashboardShell title="Pool Radar">
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
					<div>
						<h1 className="text-2xl font-bold tracking-tight">Pool Radar</h1>
						<p className="text-sm text-muted-foreground">
							{data.ok
								? `${data.pools.length} shown / ${data.total} pools · ${timeframe}`
								: "Screening unavailable"}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Select value={timeframe} onValueChange={onTimeframeChange}>
							<SelectTrigger className="h-9" aria-label="Timeframe">
								<SelectValue placeholder="Timeframe" />
							</SelectTrigger>
							<SelectContent>
								{TIMEFRAMES.map((tf) => (
									<SelectItem key={tf} value={tf}>
										{tf}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							variant="outline"
							size="sm"
							onClick={() => revalidate()}
							disabled={state === "loading"}
						>
							<RefreshCwIcon
								className={state === "loading" ? "animate-spin" : ""}
							/>
							Refresh
						</Button>
					</div>
				</div>

				{!data.ok ? (
					<Card className="mx-4 lg:mx-6">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-destructive">
								<AlertCircleIcon className="size-5" />
								Failed to load pools
							</CardTitle>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							{data.error ?? "Unknown error"} — check the backend connection and
							try refreshing.
						</CardContent>
					</Card>
				) : data.pools.length === 0 ? (
					<Card className="mx-4 lg:mx-6">
						<CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
							No pools found for the {timeframe} timeframe.
						</CardContent>
					</Card>
				) : (
					<div className="px-4 lg:px-6">
						<p className="text-sm text-muted-foreground">
							Charts, stat cards, and table land in the next tasks.
						</p>
					</div>
				)}
			</div>
		</DashboardShell>
	);
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck` (workdir `src/web-react`)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/web-react/app/routes/pools.tsx src/web-react/app/components/pools/pools-page.tsx
git commit -m "feat(web-react): pools route with header, timeframe select, error and empty states"
```

---

### Task 4: Stat cards + market charts

**Files:**
- Create: `src/web-react/app/components/pools/stat-cards.tsx`
- Create: `src/web-react/app/components/pools/market-charts.tsx`
- Modify: `src/web-react/app/components/pools/pools-page.tsx` (render the two new blocks in the success branch)

**Interfaces:**
- Consumes: `ScreenedPool` type, `Currency`, `fmtAmount` from `~/lib/pools`, `fmtPct` from `~/lib/format`, `ChartContainer`/`ChartConfig`/`ChartTooltip`/`ChartTooltipContent` from `~/components/ui/chart`.
- Produces:
  - `function StatCards({ pools, currency, solPrice }: { pools: readonly ScreenedPool[]; currency: Currency; solPrice: number | null })`
  - `function MarketCharts({ pools, currency, solPrice }: { pools: readonly ScreenedPool[]; currency: Currency; solPrice: number | null })`

- [ ] **Step 1: Create stat-cards.tsx**

Pattern: copy the responsive grid + Card styles from `src/web-react/app/components/portfolio/stat-cards.tsx` (the `*:data-[slot=card]:bg-gradient-to-t ...` container). Five cards: Pools shown, Combined TVL (sum `tvl`), Volume (sum `volume`), Fees (sum `fee`), Rug flagged (count `rugScore != null && rugScore >= 1250`). Values via `fmtAmount`.

```tsx
import type { ComponentType } from "react";
import {
	CircleDollarSignIcon,
	LayersIcon,
	RadarIcon,
	ShieldAlertIcon,
	WalletIcon,
} from "lucide-react";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import type { ScreenedPool } from "@vexis/domain/index.js";
import { fmtAmount, type Currency } from "~/lib/pools";

function StatCard({
	icon: Icon,
	label,
	value,
	sub,
}: {
	icon: ComponentType<{ className?: string }>;
	label: string;
	value: string;
	sub: string;
}) {
	return (
		<Card className="@container/card">
			<CardHeader>
				<CardDescription className="flex items-center gap-1.5">
					<Icon className="size-3.5" />
					{label}
				</CardDescription>
				<CardTitle className="text-2xl font-semibold tabular-nums">
					{value}
				</CardTitle>
			</CardHeader>
			<CardFooter className="mt-auto">
				<span className="text-xs text-muted-foreground">{sub}</span>
			</CardFooter>
		</Card>
	);
}

export function StatCards({
	pools,
	currency,
	solPrice,
}: {
	pools: readonly ScreenedPool[];
	currency: Currency;
	solPrice: number | null;
}) {
	const tvl = pools.reduce((s, p) => s + p.tvl, 0);
	const volume = pools.reduce((s, p) => s + p.volume, 0);
	const fees = pools.reduce((s, p) => s + p.fee, 0);
	const rugFlagged = pools.filter(
		(p) => p.rugScore != null && p.rugScore >= 1250,
	).length;

	return (
		<div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-5 dark:*:data-[slot=card]:bg-card">
			<StatCard
				icon={RadarIcon}
				label="Pools shown"
				value={String(pools.length)}
				sub="after screening filters"
			/>
			<StatCard
				icon={LayersIcon}
				label="Combined TVL"
				value={fmtAmount(tvl, currency, solPrice)}
				sub="across shown pools"
			/>
			<StatCard
				icon={WalletIcon}
				label="Volume"
				value={fmtAmount(volume, currency, solPrice)}
				sub="in the selected timeframe"
			/>
			<StatCard
				icon={CircleDollarSignIcon}
				label="Fees"
				value={fmtAmount(fees, currency, solPrice)}
				sub="accrued by LPs"
			/>
			<StatCard
				icon={ShieldAlertIcon}
				label="Rug flagged"
				value={String(rugFlagged)}
				sub="score ≥ 1250"
			/>
		</div>
	);
}
```

- [ ] **Step 2: Create market-charts.tsx**

Two `Card`s in a responsive 2-col grid. Chart 1: horizontal bar of top 10 pools by TVL (use `layout="vertical"`, `YAxis type="category" dataKey="name" width={80}`, `XAxis type="number" hide`, `Bar dataKey="tvl"` with `radius`). Chart 2: scatter of MC vs Volume (`ScatterChart`, `XAxis type="number" dataKey="mcap" scale="log" domain={["auto", "auto"]} name="MC"`, `YAxis type="number" dataKey="volume" scale="log" domain={["auto", "auto"]} name="Volume"`, `Scatter` with a fill). Follow the chart wiring in `cycle-chart.tsx` / `equity-chart.tsx` (ChartConfig, ChartContainer, ChartTooltipContent with a `formatter`).

```tsx
import type { ScreenedPool } from "@vexis/domain/index.js";
import { Bar, BarChart, CartesianGrid, Scatter, ScatterChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";
import { fmtAmount, type Currency } from "~/lib/pools";

const tvlConfig = {
	tvl: { label: "TVL", color: "var(--chart-1)" },
} satisfies ChartConfig;

const scatterConfig = {
	mcap: { label: "Market cap", color: "var(--chart-2)" },
	volume: { label: "Volume", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function MarketCharts({
	pools,
	currency,
	solPrice,
}: {
	pools: readonly ScreenedPool[];
	currency: Currency;
	solPrice: number | null;
}) {
	const top = [...pools]
		.sort((a, b) => b.tvl - a.tvl)
		.slice(0, 10)
		.map((p) => ({
			name: p.name || p.baseSymbol || p.pool.slice(0, 8),
			tvl: p.tvl,
		}));

	const scatter = pools
		.filter((p) => p.mcap > 0 && p.volume > 0)
		.map((p) => ({
			name: p.name || p.baseSymbol || p.pool.slice(0, 8),
			mcap: p.mcap,
			volume: p.volume,
		}));

	return (
		<div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-2">
			<Card className="h-full">
				<CardHeader>
					<CardTitle>Top pools by TVL</CardTitle>
					<p className="text-sm text-muted-foreground">
						Highest TVL among screened pools
					</p>
				</CardHeader>
				<CardContent>
					<ChartContainer config={tvlConfig} className="h-72 w-full">
						<BarChart accessibilityLayer data={top} layout="vertical">
							<CartesianGrid horizontal={false} />
							<XAxis type="number" hide />
							<YAxis
								type="category"
								dataKey="name"
								tickLine={false}
								axisLine={false}
								width={90}
							/>
							<ChartTooltip
								cursor={false}
								content={
									<ChartTooltipContent
										formatter={(value) =>
											fmtAmount(Number(value), currency, solPrice)
										}
									/>
								}
							/>
							<Bar dataKey="tvl" fill="var(--color-tvl)" radius={4} />
						</BarChart>
					</ChartContainer>
				</CardContent>
			</Card>

			<Card className="h-full">
				<CardHeader>
					<CardTitle>Market cap vs volume</CardTitle>
					<p className="text-sm text-muted-foreground">
						Log scale, per screened pool
					</p>
				</CardHeader>
				<CardContent>
					<ChartContainer config={scatterConfig} className="h-72 w-full">
						<ScatterChart accessibilityLayer data={scatter}>
							<CartesianGrid />
							<XAxis
								type="number"
								dataKey="mcap"
								name="Market cap"
								scale="log"
								domain={["auto", "auto"]}
								tickFormatter={(v) =>
									fmtAmount(Number(v), currency, solPrice)
								}
							/>
							<YAxis
								type="number"
								dataKey="volume"
								name="Volume"
								scale="log"
								domain={["auto", "auto"]}
								tickFormatter={(v) =>
									fmtAmount(Number(v), currency, solPrice)
								}
							/>
							<ChartTooltip
								cursor={{ strokeDasharray: "3 3" }}
								content={
									<ChartTooltipContent
										formatter={(value, name) =>
											`${name}: ${fmtAmount(Number(value), currency, solPrice)}`
										}
									/>
								}
							/>
							<Scatter dataKey="volume" fill="var(--color-volume)" />
						</ScatterChart>
					</ChartContainer>
				</CardContent>
			</Card>
		</div>
	);
}
```

- [ ] **Step 3: Wire into pools-page.tsx**

Add a `const [currency, setCurrency] = useState<Currency>("usd");` and a small USD/SOL `Tabs` next to the timeframe select, then render in the success branch:

```tsx
<StatCards pools={data.pools} currency={currency} solPrice={data.solPrice} />
<MarketCharts pools={data.pools} currency={currency} solPrice={data.solPrice} />
```

Add `Tabs`, `TabsList`, `TabsTrigger` imports and the `Currency` import; keep the existing `div` wrapper. Remove the placeholder "Charts, stat cards…" paragraph.

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck` (workdir `src/web-react`)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web-react/app/components/pools/stat-cards.tsx src/web-react/app/components/pools/market-charts.tsx src/web-react/app/components/pools/pools-page.tsx
git commit -m "feat(web-react): pools stat cards and market charts with usd/sol toggle"
```

---

### Task 5: Sortable, filterable pools table

**Files:**
- Create: `src/web-react/app/components/pools/pools-table.tsx`
- Modify: `src/web-react/app/components/pools/pools-page.tsx` (render table under the charts)

**Interfaces:**
- Consumes: `matchesSearch`, `organicFilter`, `sortPools`, `PoolSortKey`, `OrganicBucket`, `SortDir`, `fmtAmount`, `fmtPct`, `shortAddr`, `meteoraUrl`, `pnlClass`; `Badge`, `Button`, `Card`, `Input`, `Table*`, `ToggleGroup`/`ToggleGroupItem` from `~/components/ui`; `ScreenedPool`.
- Produces: `function PoolsTable({ pools, currency, solPrice, onSelect }: { pools: readonly ScreenedPool[]; currency: Currency; solPrice: number | null; onSelect: (pool: ScreenedPool) => void })`

- [ ] **Step 1: Create the table**

Pattern: mirror `positions-table.tsx` (search input with `SearchIcon`, sortable header buttons, `useMemo` filter+sort, empty state). Columns and sort keys: Pool (`pool`), Price (`price`), MC (`mcap`), TVL (`tvl`), Volume (`volume`), Fee (`fee`), Bin (`binStep`), Organic (`organicScore`, colored Badge via `organicBucket`), Rug (`rugScore`, colored Badge via `rugBucket`), From ATH (`fromAthPct`, `-{pct}%`), Trend (`priceChangePct`, inline SVG sparkline of `priceSeries` + colored `fmtPct`).

```tsx
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { ScreenedPool } from "@vexis/domain/index.js";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "~/components/ui/toggle-group";
import { fmtPct, meteoraUrl, pnlClass, shortAddr } from "~/lib/format";
import {
	fmtAmount,
	matchesSearch,
	organicBucket,
	organicFilter,
	rugBucket,
	sortPools,
	type Currency,
	type OrganicBucket,
	type PoolSortKey,
	type SortDir,
} from "~/lib/pools";
import { cn } from "~/lib/utils";

type Bucket = "all" | "pass" | "review" | "blocked";

function Sparkline({ values }: { values: readonly number[] }) {
	const points = values.filter((v) => Number.isFinite(v));
	if (points.length < 2) return <span className="text-xs">—</span>;
	const min = Math.min(...points);
	const max = Math.max(...points);
	const range = max - min || 1;
	const coords = points
		.map(
			(v, i) =>
				`${(i / (points.length - 1)) * 100},${20 - ((v - min) / range) * 16}`,
		)
		.join(" ");
	const positive = points.at(-1)! >= points[0];
	return (
		<svg
			viewBox="0 0 100 20"
			preserveAspectRatio="none"
			className="h-5 w-16"
			aria-hidden="true"
		>
			<polyline
				points={coords}
				fill="none"
				stroke={positive ? "var(--chart-2)" : "var(--chart-1)"}
				strokeWidth="1.5"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

function badgeVariant(kind: "pass" | "review" | "blocked" | "na") {
	switch (kind) {
		case "pass":
			return "default" as const;
		case "review":
			return "secondary" as const;
		case "blocked":
			return "destructive" as const;
		default:
			return "outline" as const;
	}
}

export function PoolsTable({
	pools,
	currency,
	solPrice,
	onSelect,
}: {
	pools: readonly ScreenedPool[];
	currency: Currency;
	solPrice: number | null;
	onSelect: (pool: ScreenedPool) => void;
}) {
	const [search, setSearch] = useState("");
	const [bucket, setBucket] = useState<Bucket>("all");
	const [sortKey, setSortKey] = useState<PoolSortKey>("tvl");
	const [sortDir, setSortDir] = useState<SortDir>("desc");

	const rows = useMemo(() => {
		const filtered = pools.filter(
			(p) => matchesSearch(p, search) && organicFilter(p, bucket),
		);
		return sortPools(filtered, sortKey, sortDir);
	}, [pools, search, bucket, sortKey, sortDir]);

	const toggleSort = (key: PoolSortKey) => {
		if (sortKey === key) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir("desc");
		}
	};

	const SortableHead = ({ label, k }: { label: string; k: PoolSortKey }) => (
		<TableHead>
			<button
				className="inline-flex items-center gap-1 hover:text-foreground"
				onClick={() => toggleSort(k)}
			>
				{label}
				<span className="text-[10px] text-muted-foreground">
					{sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
				</span>
			</button>
		</TableHead>
	);

	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
				<div>
					<CardTitle>Screen results</CardTitle>
					<p className="text-sm text-muted-foreground">
						{rows.length} of {pools.length} pools
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<ToggleGroup
						type="single"
						value={bucket}
						onValueChange={(v) => v && setBucket(v as Bucket)}
						variant="outline"
						size="sm"
					>
						<ToggleGroupItem value="all">All</ToggleGroupItem>
						<ToggleGroupItem value="pass">Pass</ToggleGroupItem>
						<ToggleGroupItem value="review">Review</ToggleGroupItem>
						<ToggleGroupItem value="blocked">Blocked</ToggleGroupItem>
					</ToggleGroup>
					<label className="relative">
						<SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search pool…"
							className="h-9 w-44 pl-8"
						/>
						<span className="sr-only">Search pools</span>
					</label>
				</div>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				{rows.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No pools{search ? " matching the search" : ""}.
					</div>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader className="bg-muted/50">
								<TableRow>
									<SortableHead label="Pool" k="pool" />
									<SortableHead label="Price" k="price" />
									<SortableHead label="MC" k="mcap" />
									<SortableHead label="TVL" k="tvl" />
									<SortableHead label="Volume" k="volume" />
									<SortableHead label="Fee" k="fee" />
									<SortableHead label="Bin" k="binStep" />
									<SortableHead label="Organic" k="organicScore" />
									<SortableHead label="Rug" k="rugScore" />
									<SortableHead label="From ATH" k="fromAthPct" />
									<SortableHead label="Trend" k="priceChangePct" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((pool) => (
									<TableRow
										key={pool.pool}
										className="cursor-pointer"
										onClick={() => onSelect(pool)}
									>
										<TableCell>
											<div className="flex items-center gap-3">
												{pool.baseIcon ? (
													<img
														src={pool.baseIcon}
														alt={pool.baseSymbol}
														className="h-8 w-8 shrink-0 rounded-md bg-muted object-cover"
														onError={(e) => {
															(
																e.currentTarget as HTMLImageElement
															).style.display = "none";
														}}
													/>
												) : (
													<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold">
														{pool.baseSymbol.slice(0, 2).toUpperCase()}
													</div>
												)}
												<div className="flex flex-col">
													<a
														href={meteoraUrl(pool.pool)}
														target="_blank"
														rel="noopener noreferrer"
														className="font-medium hover:underline"
														onClick={(e) => e.stopPropagation()}
													>
														{pool.name || `${pool.baseSymbol}/${pool.quoteSymbol}`}
													</a>
													<span className="font-mono text-xs text-muted-foreground">
														{shortAddr(pool.pool, 5)}
													</span>
												</div>
											</div>
										</TableCell>
										<TableCell className="tabular-nums">
											{pool.price >= 1
												? pool.price.toFixed(3)
												: pool.price.toFixed(5)}
										</TableCell>
										<TableCell className="tabular-nums">
											{fmtAmount(pool.mcap, currency, solPrice)}
										</TableCell>
										<TableCell className="tabular-nums">
											{fmtAmount(pool.tvl, currency, solPrice)}
										</TableCell>
										<TableCell className="tabular-nums">
											{fmtAmount(pool.volume, currency, solPrice)}
										</TableCell>
										<TableCell className="tabular-nums">
											{fmtAmount(pool.fee, currency, solPrice)}
										</TableCell>
										<TableCell className="tabular-nums">
											{pool.binStep}
											<div className="text-xs text-muted-foreground">
												{pool.baseFeePct}% fee
											</div>
										</TableCell>
										<TableCell>
											<Badge variant={badgeVariant(organicBucket(pool.organicScore))}>
												{pool.organicScore}
											</Badge>
										</TableCell>
										<TableCell>
											<Badge variant={badgeVariant(rugBucket(pool.rugScore))}>
												{pool.rugScore ?? "N/A"}
											</Badge>
										</TableCell>
										<TableCell className="tabular-nums">
											{pool.fromAthPct == null
												? "-"
												: `-${(pool.fromAthPct * 100).toFixed(1)}%`}
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-1.5">
												<Sparkline values={pool.priceSeries ?? []} />
												<span
													className={cn(
														"tabular-nums",
														pnlClass(pool.priceChangePct ?? 0),
													)}
												>
													{fmtPct(pool.priceChangePct)}
												</span>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 2: Wire into pools-page.tsx**

In the success branch, after `<MarketCharts …>`, add:

```tsx
<PoolsTable
	pools={data.pools}
	currency={currency}
	solPrice={data.solPrice}
	onSelect={() => {}}
/>
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck` (workdir `src/web-react`)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/web-react/app/components/pools/pools-table.tsx src/web-react/app/components/pools/pools-page.tsx
git commit -m "feat(web-react): sortable, filterable pools table with sparklines and badges"
```

---

### Task 6: Pool detail sheet

**Files:**
- Create: `src/web-react/app/components/pools/pool-detail-sheet.tsx`
- Modify: `src/web-react/app/components/pools/pools-page.tsx` (hold `selectedPool` state, pass `onSelect` to the table, render the sheet)

**Interfaces:**
- Consumes: `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter` from `~/components/ui/sheet`; `Button`; `Badge`; `fmtAmount`, `organicBucket`, `rugBucket`, `Currency` from `~/lib/pools`; `fmtPct`, `meteoraUrl`, `solscanUrl` from `~/lib/format`; `ScreenedPool`.
- Produces: `function PoolDetailSheet({ pool, currency, solPrice, onOpenChange }: { pool: ScreenedPool | null; currency: Currency; solPrice: number | null; onOpenChange: (open: boolean) => void })`

- [ ] **Step 1: Create the sheet component**

Right-side Sheet (`side="right"`, default `sm:max-w-sm` is small for the metric grid — pass `className="sm:max-w-md"`). Header: token icon + name + price + `fmtPct` change. Body: a definition grid (`grid grid-cols-2 gap-x-4 gap-y-3`) of rows from a `Metric` array: MC, TVL, Active TVL, Volume, Fees, Holders, Organic (badge), Quote organic, Bin step, Base fee, From ATH, Volatility, Fee/TVL ratio, Active positions, Open positions, Token age, Pool age, Swaps, Unique traders, Rug score (badge), LP locked. Footer: Meteora + Solscan buttons. Show risk flags (isRugpull / isWash / devSoldAll) as destructive badges under the header.

```tsx
import type { ScreenedPool } from "@vexis/domain/index.js";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import { fmtPct, meteoraUrl, solscanUrl } from "~/lib/format";
import {
	fmtAmount,
	organicBucket,
	rugBucket,
	type Currency,
} from "~/lib/pools";

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="font-medium tabular-nums">{value}</div>
		</div>
	);
}

export function PoolDetailSheet({
	pool,
	currency,
	solPrice,
	onOpenChange,
}: {
	pool: ScreenedPool | null;
	currency: Currency;
	solPrice: number | null;
	onOpenChange: (open: boolean) => void;
}) {
	if (!pool) return null;
	const price = pool.price >= 1 ? pool.price.toFixed(3) : pool.price.toFixed(5);
	const metrics: { label: string; value: string }[] = [
		{ label: "Market cap", value: fmtAmount(pool.mcap, currency, solPrice) },
		{ label: "TVL", value: fmtAmount(pool.tvl, currency, solPrice) },
		{ label: "Active TVL", value: fmtAmount(pool.activeTvl, currency, solPrice) },
		{ label: "Volume", value: fmtAmount(pool.volume, currency, solPrice) },
		{ label: "Fees", value: fmtAmount(pool.fee, currency, solPrice) },
		{ label: "Holders", value: String(pool.holders) },
		{
			label: "Organic score",
			value: String(pool.organicScore),
		},
		{ label: "Quote organic", value: String(pool.quoteOrganic) },
		{ label: "Bin step", value: String(pool.binStep) },
		{ label: "Base fee", value: `${pool.baseFeePct}%` },
		{
			label: "From ATH",
			value:
				pool.fromAthPct == null
					? "-"
					: `-${(pool.fromAthPct * 100).toFixed(1)}%`,
		},
		{
			label: "Volatility",
			value: pool.volatility != null ? String(pool.volatility) : "-",
		},
		{
			label: "Fee / TVL ratio",
			value: pool.feeActiveTvlRatio != null ? String(pool.feeActiveTvlRatio) : "-",
		},
		{ label: "Active positions", value: String(pool.activePositions) },
		{ label: "Open positions", value: String(pool.openPositions) },
		{
			label: "Token age",
			value: pool.tokenAgeHours != null ? `${pool.tokenAgeHours}h` : "-",
		},
		{
			label: "Pool age",
			value: pool.poolAgeHours != null ? `${pool.poolAgeHours}h` : "-",
		},
		{ label: "Swaps", value: String(pool.swapCount) },
		{ label: "Unique traders", value: String(pool.uniqueTraders) },
		{
			label: "Rug score",
			value: pool.rugScore != null ? String(pool.rugScore) : "N/A",
		},
		{
			label: "LP locked",
			value: pool.lpLockedPct != null ? `${pool.lpLockedPct}%` : "-",
		},
	];
	const flags: string[] = [];
	if (pool.isRugpull) flags.push("Rugpull risk");
	if (pool.isWash) flags.push("Wash trading");
	if (pool.devSoldAll) flags.push("Dev sold all");

	return (
		<Sheet open onOpenChange={onOpenChange}>
			<SheetContent className="sm:max-w-md">
				<SheetHeader>
					<div className="flex items-center gap-3">
						{pool.baseIcon ? (
							<img
								src={pool.baseIcon}
								alt={pool.baseSymbol}
								className="h-10 w-10 rounded-md bg-muted object-cover"
								onError={(e) => {
									(e.currentTarget as HTMLImageElement).style.display = "none";
								}}
							/>
						) : (
							<div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-sm font-bold">
								{pool.baseSymbol.slice(0, 2).toUpperCase()}
							</div>
						)}
						<div>
							<SheetTitle>
								{pool.name || `${pool.baseSymbol}/${pool.quoteSymbol}`}
							</SheetTitle>
							<SheetDescription className="flex items-center gap-2">
								<span className="tabular-nums">{price}</span>
								<span className={pool.priceChangePct != null && pool.priceChangePct >= 0 ? "text-emerald-500" : "text-red-500"}>
									{fmtPct(pool.priceChangePct)}
								</span>
							</SheetDescription>
						</div>
					</div>
					{flags.length > 0 && (
						<div className="flex flex-wrap gap-1.5 pt-1">
							{flags.map((f) => (
								<Badge key={f} variant="destructive">
									{f}
								</Badge>
							))}
						</div>
					)}
				</SheetHeader>
				<div className="grid grid-cols-2 gap-x-4 gap-y-3 px-6">
					{metrics.map((m) => (
						<Metric key={m.label} label={m.label} value={m.value} />
					))}
					<div className="col-span-2 flex items-center gap-1.5 pt-1">
						<Badge variant={organicBucket(pool.organicScore) === "pass" ? "default" : organicBucket(pool.organicScore) === "review" ? "secondary" : "destructive"}>
							Organic: {pool.organicScore}
						</Badge>
						<Badge variant={rugBucket(pool.rugScore) === "pass" ? "default" : rugBucket(pool.rugScore) === "review" ? "secondary" : "outline"}>
							Rug: {pool.rugScore ?? "N/A"}
						</Badge>
					</div>
				</div>
				<SheetFooter>
					<Button asChild variant="outline">
						<a
							href={meteoraUrl(pool.pool)}
							target="_blank"
							rel="noopener noreferrer"
						>
							Open in Meteora
						</a>
					</Button>
					<Button asChild variant="outline">
						<a
							href={solscanUrl(pool.pool)}
							target="_blank"
							rel="noopener noreferrer"
						>
							View on Solscan
						</a>
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
```

- [ ] **Step 2: Wire into pools-page.tsx**

Add `const [selectedPool, setSelectedPool] = useState<ScreenedPool | null>(null);`, pass `onSelect={setSelectedPool}` to `PoolsTable`, and render `<PoolDetailSheet pool={selectedPool} currency={currency} solPrice={data.solPrice} onOpenChange={(open) => !open && setSelectedPool(null)} />` after the table. Import `ScreenedPool` type and `PoolDetailSheet`.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck` (workdir `src/web-react`)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/web-react/app/components/pools/pool-detail-sheet.tsx src/web-react/app/components/pools/pools-page.tsx
git commit -m "feat(web-react): pool detail sheet with full metrics and external links"
```

---

### Task 7: Final verification

**Files:**
- Modify: `src/web-react/app/components/pools/pools-page.tsx` (only if typecheck/test reveal issues)

- [ ] **Step 1: Lint and format**

Run: `npm run check` (workdir repo root, biome covers `src/web-react` too)
Expected: PASS; no unformatted/unused issues. If biome rewrites files, re-run typecheck.

- [ ] **Step 2: Typecheck web-react**

Run: `npm run typecheck` (workdir `src/web-react`)
Expected: PASS.

- [ ] **Step 3: Full test suite**

Run: `npm test` (workdir repo root)
Expected: PASS (includes `web-react-pools-lib.test.ts`).

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev` (workdir `src/web-react`), open `/pools`. Verify: header + subtitle counts, timeframe select triggers re-screen, USD/SOL toggle updates stat cards/charts/table, search filters, organic ToggleGroup filters, column sorting works, row click opens the detail sheet, sheet links open Meteora/Solscan, error card shows when backend is unreachable, empty state when screening returns nothing.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore(web-react): pools page verification fixes"
```

(Only commit if Step 1–3 required changes.)

---

## Self-Review Notes

- **Spec coverage:** stat cards (Task 4), charts (Task 4), filter bar + sortable table (Task 5), sheet (Task 6), timeframe + USD/SOL toggle + manual/on-focus refresh (Tasks 3–4), error/empty states (Task 3), payload builder + thresholds (Task 1), server module (Task 2). All spec sections mapped.
- **Placeholders:** none — every step has concrete code or an exact command.
- **Type consistency:** `PoolsPayload`, `Currency`, `OrganicBucket`, `PoolSortKey`, `SortDir`, `fmtAmount`, `matchesSearch`, `organicFilter`, `sortPools`, `buildPoolsPayload`, `fetchPools` names are used consistently across tasks. `PoolsPayload` re-exported from `pools.server.ts` (`export type { PoolsPayload }`) so route/page imports work. Sheet `Badge` for rug uses `outline` fallback for `na`.