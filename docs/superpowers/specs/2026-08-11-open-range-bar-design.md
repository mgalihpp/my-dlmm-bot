# Design: Range bars in `/open`

Date: 2026-08-11

## Problem

The `/open` command lists open DLMM positions with balances, fees, and PnL, but
no visual indication of where the current price sits within each position's
range. The agent already renders a 20-cell `▰`/`▱` range bar
(`formatRangeBar` in `src/telegram/agent/format.ts`), and the user wants the
same visualization in `/open`:

```
▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ in-range
```

## Approach

Extend the existing portfolio enrichment with an opt-in `withRanges` flag so
only `/open` pays the extra API cost (alerts fetch up to 100 pools every 15
minutes and must stay unchanged). Reuse the agent's `formatRangeBar` helper
by moving it to the shared `telegram/format.ts`.

### 1. Data model — `src/domain/portfolio.ts`

New schema:

```ts
export const PositionRangeEntry = Schema.Struct({
  address: Schema.String,
  minPrice: Schema.String,
  maxPrice: Schema.String,
  poolActivePrice: Schema.NullOr(Schema.String),
});
```

`OpenPool` gains `positionsRange: Schema.optional(Schema.Array(PositionRangeEntry))`.

### 2. Enrichment — `src/services/MeteoraApi.ts` (+ `fx.ts` wrapper)

`enrichOpenPortfolioPnl(pools, wallet, opts?: { withRanges?: boolean })`:

- `withRanges: true` → drop the `openPositionCount > 1` filter (fetch
  `positionPnl` for **all** pools) and, besides the existing PnL entries, map
  `minPrice` / `maxPrice` / `poolActivePrice` into `positionsRange`.
- Default (`false`) → identical behavior to today (alerts / CLI / menu
  unchanged).
- Per-pool failures keep the existing `Effect.ignore` behavior.

### 3. Shared bar helper — `src/telegram/format.ts`

Move `formatRangeBar` (20-cell bar + `in-range` / `below` / `above` label,
incl. the `min >= max` guard) from `src/telegram/agent/format.ts` into
`src/telegram/format.ts`. `agent/format.ts` re-exports it:

```ts
export { formatRangeBar } from "../format.js";
```

so agent code and its tests (`test/agent-format.test.ts`) keep working
unchanged.

### 4. Rendering — `tgOpenPools` in `src/telegram/format.ts`

For each position line (both the single-position and multi-position branches
in `tgOpenPools`):

- Look up the position's range entry in `p.positionsRange` by address.
- price = `poolActivePrice ?? pool.poolPrice`; `min`/`max` from the entry.
- Entry present → append `Range: <bar>` line under the position.
- Entry missing → no bar line (keeps output compact; no "range n/a" noise in
  multi-position lists).

Example single-position output:

```
   └ ✅ <addr>
      Range: ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ in-range
      <amountX> X + <amountY> Y
      Fees: <feeX> X + <feeY> Y
```

### 5. Wiring — `src/telegram/handlers/portfolio.ts`

`/open` calls `enrichOpenPortfolioPnl(res.pools, wallet, { withRanges: true })`.

### 6. Tests

- `test/format.test.ts` (or a new test file): `tgOpenPools` with an `OpenPool`
  fixture carrying `positionsRange` — verifies the bar line appears for
  in-range / below / above and that it is omitted when no entry exists.
- Existing `test/agent-format.test.ts` unchanged (re-export preserves imports).

## Edge cases

- `positionPnl` fetch fails for a pool → skipped silently (existing behavior);
  no bar line for that pool's positions.
- `poolActivePrice` null → fallback to `pool.poolPrice`.
- Existing OOR badges (`⚠️ OOR`) stay alongside the bar.
- Message length: one extra line per position — negligible for `/open`'s
  10-pool cap.

## Out of scope

- Range bars in `/watchpositions`, `/wallets`, alerts, dashboard, `/manage`.
- Range bar in the `/create` wizard.
