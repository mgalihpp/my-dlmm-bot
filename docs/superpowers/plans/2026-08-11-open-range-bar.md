# Range Bars in `/open` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the agent-style `▰/▱` range bar for every open position in the `/open` command output.

**Architecture:** Extend the existing `enrichOpenPortfolioPnl` with an opt-in `withRanges` flag that captures per-position `minPrice`/`maxPrice`/`poolActivePrice` into a new `positionsRange` field on `OpenPool`. Move the agent's `formatRangeBar` helper into the shared `telegram/format.ts` and render one bar line per position in `tgOpenPools`.

**Tech Stack:** TypeScript (strict, ESM), Effect (Schema, Effect, Layer), grammY, Vitest.

## Global Constraints

- ESM-only — all relative imports end in `.js` (e.g. `from "../domain/portfolio.js"`).
- Biome: tab indent, double quotes, organized imports. Do NOT hand-format; run `npm run check` and `npm run format` if needed.
- TypeScript strict; no unused locals/params. Tests are excluded from `tsc`.
- MarkdownV2: user-facing strings must go through `escapeMarkdown`/`tgBold`/etc. `formatRangeBar` already escapes its label.
- Verification for every task: `npm run check && npm run typecheck && npm test`
- Commit after each task; conventional commit style (`feat(portfolio): ...`).
- Spec: `docs/superpowers/specs/2026-08-11-open-range-bar-design.md`

---

### Task 1: `PositionRangeEntry` schema on `OpenPool`

**Files:**
- Modify: `src/domain/portfolio.ts` (append schema; add field to `OpenPool`)
- Create: `test/domain-portfolio.test.ts`

**Interfaces:**
- Produces: `PositionRangeEntry` schema + type:
  `{ address: string; minPrice: string; maxPrice: string; poolActivePrice: string | null }`
  and optional field `positionsRange?: PositionRangeEntry[]` on `OpenPool`.
  (Auto-exported via `export *` in `src/domain/index.ts`.)

- [ ] **Step 1: Write the failing test**

Create `test/domain-portfolio.test.ts`:

```ts
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { OpenPool } from "../src/domain/portfolio.js";

const basePool = {
	poolAddress: "Pool1",
	binStep: 25,
	baseFee: 0.25,
	tokenX: "JUP",
	tokenY: "SOL",
	tokenXMint: "MintX",
	tokenYMint: "So11111111111111111111111111111111111111112",
	balances: "100",
	unclaimedFees: "1.5",
	feePerTvl24h: "0.5",
	pnl: "10",
	pnlPctChange: "5.2",
	pnlSol: "0.1",
	pnlSolPctChange: "5.1",
	totalDeposit: "50",
	openPositionCount: 1,
	listPositions: ["Pos1"],
	positionsOutOfRange: [],
	outOfRange: false,
	poolPrice: 1.5,
};

describe("OpenPool schema", () => {
	it("decodes a pool with positionsRange", () => {
		const decoded = Schema.decodeUnknownSync(OpenPool)({
			...basePool,
			positionsRange: [
				{
					address: "Pos1",
					minPrice: "0.5",
					maxPrice: "2",
					poolActivePrice: "1.5",
				},
			],
		});
		expect(decoded.positionsRange?.[0]).toEqual({
			address: "Pos1",
			minPrice: "0.5",
			maxPrice: "2",
			poolActivePrice: "1.5",
		});
	});
	it("decodes a pool without positionsRange", () => {
		const decoded = Schema.decodeUnknownSync(OpenPool)({ ...basePool });
		expect(decoded.positionsRange).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/domain-portfolio.test.ts`
Expected: FAIL — `positionsRange` is not a known property / undefined.

- [ ] **Step 3: Implement the schema**

In `src/domain/portfolio.ts`, after `PositionPnlEntry` (line ~42), add:

```ts
export const PositionRangeEntry = Schema.Struct({
	address: Schema.String,
	minPrice: Schema.String,
	maxPrice: Schema.String,
	poolActivePrice: Schema.NullOr(Schema.String),
});
export type PositionRangeEntry = Schema.Schema.Type<
	typeof PositionRangeEntry
>;
```

In the `OpenPool` struct, after `positionsLive` (line ~64), add:

```ts
	positionsRange: Schema.optional(Schema.Array(PositionRangeEntry)),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/domain-portfolio.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Full verification**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/portfolio.ts test/domain-portfolio.test.ts
git commit -m "feat(portfolio): add positionsRange schema to OpenPool"
```

---

### Task 2: Opt-in range enrichment in `enrichOpenPortfolioPnl`

**Files:**
- Modify: `src/services/MeteoraApi.ts` (service interface ~line 71; implementation ~lines 237-265; import block line 16-30)
- Modify: `src/telegram/fx.ts:68-73`
- Test: `test/meteora-api.test.ts`

**Interfaces:**
- Consumes: `PositionRangeEntry` from Task 1.
- Produces: `enrichOpenPortfolioPnl(pools: readonly OpenPool[], wallet: string, opts?: { withRanges?: boolean }) => Effect.Effect<OpenPool[]>` — when `opts.withRanges === true`, fetches `positionPnl` for ALL pools (not just `openPositionCount > 1`) and sets `positionsRange` on each pool. Default behavior unchanged.
- Consumes from existing code: `positionPnl(poolAddress, user, status?, page?, pageSize?)` returns `PositionPnLResponse` with `positions: PositionPnLData[]` (`minPrice`, `maxPrice` strings; `poolActivePrice: string | null`).

- [ ] **Step 1: Write the failing tests**

Append to `test/meteora-api.test.ts` (reuse the existing `jsonResponse`, `mockClient`, `layerWith` helpers). Add this fixture near the top of the describe:

```ts
const positionPnlBody = {
	totalCount: 1,
	page: 1,
	pageSize: 100,
	hasNext: false,
	positions: [
		{
			positionAddress: "Pos1",
			minPrice: "0.5",
			maxPrice: "2",
			lowerBinId: -34,
			upperBinId: 35,
			feePerTvl24h: "0.5",
			isClosed: false,
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
				total: { usd: "0", sol: "0" },
			},
			allTimeFees: {
				tokenX: { amount: "0.1", amountSol: null, usd: "0.05" },
				tokenY: { amount: "0.01", amountSol: "0.01", usd: "1" },
				total: { usd: "1.05", sol: "0.01" },
			},
			closedAt: null,
			createdAt: 1720000000,
			isOutOfRange: false,
			poolActiveBinId: 0,
			poolActivePrice: "1.5",
		},
	],
	tokenX: "JUP",
	tokenXPrice: "1",
	tokenY: "SOL",
	tokenYPrice: "150",
	solPrice: "150",
	rewardTokenX: null,
	rewardTokenXPrice: "0",
	rewardTokenY: null,
	rewardTokenYPrice: "0",
};

const pnlUrl = (pool: string) => (url: string) =>
	url.includes(`/positions/${pool}/pnl`)
		? { body: positionPnlBody }
		: { body: { error: "unexpected" }, status: 404 };

const pnlPool = {
	poolAddress: "Pool1",
	binStep: 25,
	baseFee: 0.25,
	tokenX: "JUP",
	tokenY: "SOL",
	tokenXMint: "MintX",
	tokenYMint: "So11111111111111111111111111111111111111112",
	balances: "100",
	unclaimedFees: "1.5",
	feePerTvl24h: "0.5",
	pnl: "10",
	pnlPctChange: "5.2",
	pnlSol: "0.1",
	pnlSolPctChange: "5.1",
	totalDeposit: "50",
	openPositionCount: 1,
	listPositions: ["Pos1"],
	positionsOutOfRange: [],
	outOfRange: false,
	poolPrice: 1.5,
};
```

Then these tests inside `describe("MeteoraApi", ...)`:

```ts
it("withRanges enriches even single-position pools", async () => {
	const result = await Effect.runPromise(
		Effect.gen(function* () {
			const api = yield* MeteoraApi;
			return yield* api.enrichOpenPortfolioPnl(
				[{ ...pnlPool, openPositionCount: 1 } as never],
				"W",
				{ withRanges: true },
			);
		}).pipe(Effect.provide(layerWith(pnlUrl("Pool1")))),
	);
	expect(result[0].positionsRange).toEqual([
		{ address: "Pos1", minPrice: "0.5", maxPrice: "2", poolActivePrice: "1.5" },
	]);
	expect(result[0].positionsPnl).toHaveLength(1);
});

it("default skips single-position pools", async () => {
	let calls = 0;
	const result = await Effect.runPromise(
		Effect.gen(function* () {
			const api = yield* MeteoraApi;
			return yield* api.enrichOpenPortfolioPnl(
				[
					{ ...pnlPool, poolAddress: "Pool1", openPositionCount: 1 } as never,
					{ ...pnlPool, poolAddress: "Pool2", openPositionCount: 2 } as never,
				],
				"W",
			);
		}).pipe(
			Effect.provide(
				layerWith((url) => {
					if (url.includes("/positions/")) calls++;
					return { body: positionPnlBody };
				}),
			),
		),
	);
	expect(calls).toBe(1);
	expect(result[0].positionsPnl).toBeUndefined();
	expect(result[1].positionsPnl).toHaveLength(1);
});
```

Note: `as never` is used so the test doesn't have to import/fully type the pool literal.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/meteora-api.test.ts`
Expected: FAIL — `positionsRange` is `undefined`; the default test fails because `opts` isn't accepted yet (TS) or behavior unchanged.

- [ ] **Step 3: Update the service interface**

In `src/services/MeteoraApi.ts`, change `enrichOpenPortfolioPnl` (line ~71):

```ts
	readonly enrichOpenPortfolioPnl: (
		pools: readonly OpenPool[],
		wallet: string,
		opts?: { withRanges?: boolean },
	) => Effect.Effect<OpenPool[]>;
```

Add `type PositionRangeEntry` to the `../domain/index.js` import block (line ~29):

```ts
	type PositionRangeEntry,
```

- [ ] **Step 4: Implement the enrichment change**

Replace the `enrichOpenPortfolioPnl` body (currently lines 237-265) with:

```ts
		enrichOpenPortfolioPnl: (pools, wallet, opts) =>
			Effect.gen(function* () {
				const enriched = pools.map((p) => ({ ...p }));
				yield* Effect.forEach(
					enriched.filter(
						(pool) => opts?.withRanges === true || pool.openPositionCount > 1,
					),
					(pool) =>
						positionPnl(pool.poolAddress, wallet, "open").pipe(
							Effect.map((res) => {
								const entries: PositionPnlEntry[] = res.positions.map(
									(pos) => ({
										address: pos.positionAddress,
										pnlUsd: pos.pnlUsd,
										pnlPctChange: pos.pnlPctChange,
										pnlSol: pos.pnlSol != null ? String(pos.pnlSol) : null,
										pnlSolPctChange:
											pos.pnlSolPctChange != null
												? String(pos.pnlSolPctChange)
												: null,
									}),
								);
								(pool as { positionsPnl?: PositionPnlEntry[] }).positionsPnl =
									entries;
								if (opts?.withRanges === true) {
									const ranges: PositionRangeEntry[] = res.positions.map(
										(pos) => ({
											address: pos.positionAddress,
											minPrice: pos.minPrice,
											maxPrice: pos.maxPrice,
											poolActivePrice: pos.poolActivePrice,
										}),
									);
									(pool as { positionsRange?: PositionRangeEntry[] })
										.positionsRange = ranges;
								}
							}),
							Effect.ignore,
						),
					{ concurrency: 5, discard: true },
				);
				return enriched;
			}),
```

- [ ] **Step 5: Update the fx wrapper**

In `src/telegram/fx.ts`, replace lines 68-73:

```ts
	enrichOpenPortfolioPnl: (
		pools: readonly OpenPool[],
		wallet: string,
		opts?: { withRanges?: boolean },
	) =>
		runFx(
			Effect.flatMap(MeteoraApi, (a) =>
				a.enrichOpenPortfolioPnl(pools, wallet, opts),
			),
		),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run test/meteora-api.test.ts`
Expected: PASS (all tests, old + new).

- [ ] **Step 7: Full verification**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/services/MeteoraApi.ts src/telegram/fx.ts test/meteora-api.test.ts
git commit -m "feat(portfolio): opt-in range enrichment in open portfolio"
```

---

### Task 3: Move `formatRangeBar` to shared `telegram/format.ts`

**Files:**
- Modify: `src/telegram/format.ts` (append helper)
- Modify: `src/telegram/agent/format.ts` (remove helper, add re-export)
- Test: `test/format.test.ts`

**Interfaces:**
- Produces: `formatRangeBar(price: number, min: number, max: number): string` exported from `src/telegram/format.js` and re-exported from `src/telegram/agent/format.js` (keeps `test/agent-format.test.ts` and all agent imports working).

- [ ] **Step 1: Write the failing test**

In `test/format.test.ts`, extend the `tg helpers` import and add a describe block:

```ts
import {
	escapeMarkdown,
	formatRangeBar,
	tgBold,
	tgCode,
	tgUsd,
} from "../src/telegram/format.js";
```

```ts
describe("formatRangeBar", () => {
	it("renders the 20-cell tick bar matching the agent style", () => {
		expect(formatRangeBar(0.9, 0.5, 1.5)).toBe(
			"▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ in\\-range",
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/format.test.ts`
Expected: FAIL — `formatRangeBar` is not exported from `telegram/format.js`.

- [ ] **Step 3: Move the helper**

In `src/telegram/format.ts`, append (after `tgPoolDetail`):

```ts
/** 20-cell range bar: filled `▰` up to the price tick, `▱` after. */
export function formatRangeBar(
	price: number,
	min: number,
	max: number,
): string {
	if (min >= max) return "range unavailable";
	const width = 20;
	const clamp = Math.min(1, Math.max(0, (price - min) / (max - min)));
	const tick = Math.round(clamp * width);
	const cells = `${"▰".repeat(tick)}${"▱".repeat(width - tick)}`;
	const label = price < min ? "below" : price > max ? "above" : "in-range";
	return `${cells} ${escapeMarkdown(label)}`;
}
```

In `src/telegram/agent/format.ts`, delete the `formatRangeBar` function (lines 366-379) and add this re-export after the import block:

```ts
export { formatRangeBar } from "../format.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/format.test.ts test/agent-format.test.ts`
Expected: PASS — both the new exact-match test and the unchanged agent tests.

- [ ] **Step 5: Full verification**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/telegram/format.ts src/telegram/agent/format.ts test/format.test.ts
git commit -m "refactor(format): move formatRangeBar to shared telegram format"
```

---

### Task 4: Render range bars in `tgOpenPools` + wire `/open`

**Files:**
- Modify: `src/telegram/format.ts` (`tgOpenPools` — both position branches; add `positionRangeLine` helper)
- Modify: `src/telegram/handlers/portfolio.ts:21`
- Test: `test/format.test.ts`

**Interfaces:**
- Consumes: `formatRangeBar` (Task 3), `OpenPool.positionsRange` (Task 1), `enrichOpenPortfolioPnl(..., { withRanges: true })` (Task 2).
- Produces: `/open` output with a `      Range: <bar>` line under each position that has range data.

- [ ] **Step 1: Write the failing tests**

In `test/format.test.ts`, add imports:

```ts
import { Schema } from "effect";
import { OpenPool } from "../src/domain/portfolio.js";
```

and extend the `tg helpers` import with `tgOpenPools`. Then append:

```ts
describe("tgOpenPools range bars", () => {
	const makePool = (overrides: Partial<OpenPool>): OpenPool =>
		Schema.decodeUnknownSync(OpenPool)({
			poolAddress: "Pool1",
			binStep: 25,
			baseFee: 0.25,
			tokenX: "JUP",
			tokenY: "SOL",
			tokenXMint: "MintX",
			tokenYMint: "So11111111111111111111111111111111111111112",
			balances: "100",
			unclaimedFees: "1.5",
			feePerTvl24h: "0.5",
			pnl: "10",
			pnlPctChange: "5.2",
			pnlSol: "0.1",
			pnlSolPctChange: "5.1",
			totalDeposit: "50",
			openPositionCount: 1,
			listPositions: ["Pos1"],
			positionsOutOfRange: [],
			outOfRange: false,
			poolPrice: 1.5,
			...overrides,
		});

	it("renders an in-range bar for a single position", () => {
		const out = tgOpenPools([
			makePool({
				positionsRange: [
					{
						address: "Pos1",
						minPrice: "0.5",
						maxPrice: "1.5",
						poolActivePrice: "0.9",
					},
				],
			}),
		]);
		expect(out).toContain(
			"Range: ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ in\\-range",
		);
	});

	it("marks below and above per position in multi-position pools", () => {
		const out = tgOpenPools([
			makePool({
				openPositionCount: 2,
				listPositions: ["Pos1", "Pos2"],
				positionsOutOfRange: ["Pos1", "Pos2"],
				positionsRange: [
					{
						address: "Pos1",
						minPrice: "0.5",
						maxPrice: "1.5",
						poolActivePrice: "0.2",
					},
					{
						address: "Pos2",
						minPrice: "0.5",
						maxPrice: "1.5",
						poolActivePrice: "5",
					},
				],
			}),
		]);
		expect(out).toContain("below");
		expect(out).toContain("above");
	});

	it("omits the bar when no range data exists", () => {
		const out = tgOpenPools([makePool({})]);
		expect(out).not.toContain("Range:");
	});

	it("falls back to pool price when poolActivePrice is null", () => {
		const out = tgOpenPools([
			makePool({
				poolPrice: 0.9,
				positionsRange: [
					{
						address: "Pos1",
						minPrice: "0.5",
						maxPrice: "1.5",
						poolActivePrice: null,
					},
				],
			}),
		]);
		expect(out).toContain(
			"Range: ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ in\\-range",
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/format.test.ts`
Expected: FAIL — `tgOpenPools` output contains no `Range:` line.

- [ ] **Step 3: Implement the rendering**

In `src/telegram/format.ts`:

(a) In `tgOpenPools`, single-position branch — inside `if (p.openPositionCount <= 1) { ... }`, after the `live` block and before `lines.push("");`, add:

```ts
			const rangeLine = positionRangeLine(p, pos);
			if (rangeLine) lines.push(rangeLine);
```

(b) In the multi-position `for (const pos of p.listPositions)` loop, after the `live` block and before the `pnl` block, add:

```ts
			const rangeLine = positionRangeLine(p, pos);
			if (rangeLine) lines.push(rangeLine);
```

(c) Append this helper at the end of the file:

```ts
/** Range bar line for one position, or null when range data is missing. */
function positionRangeLine(p: OpenPool, pos: string): string | null {
	const range = p.positionsRange?.find((e) => e.address === pos);
	if (!range) return null;
	const price =
		range.poolActivePrice != null
			? Number(range.poolActivePrice)
			: Number(p.poolPrice);
	return `      Range: ${formatRangeBar(
		price,
		Number(range.minPrice),
		Number(range.maxPrice),
	)}`;
}
```

- [ ] **Step 4: Wire `/open`**

In `src/telegram/handlers/portfolio.ts`, change line 21:

```ts
			const enriched = await api.enrichOpenPortfolioPnl(res.pools, wallet, {
				withRanges: true,
			});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/format.test.ts`
Expected: PASS (all 4 new tests + existing).

- [ ] **Step 6: Full verification**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/telegram/format.ts src/telegram/handlers/portfolio.ts test/format.test.ts
git commit -m "feat(portfolio): show range bars in /open positions"
```

---

## Manual smoke test (optional, after all tasks)

Run the bot (`npm run bot`) and execute `/open` in the configured Telegram chat. Each position should show a line like:

```
   └ ✅ <position address>
      Range: ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ in-range
```
