# Position and Pool Card View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add responsive card views and a persistent Table/Card switcher to open positions, closed positions, and pool results without changing data behavior.

**Architecture:** Keep each existing component's filtering, sorting, expansion, and pagination logic. Extract only the view preference/switcher concern into a small shared component/helper, then branch at the render point so exactly one table or card renderer is mounted. Card renderers consume the same already-filtered rows as the current tables.

**Tech Stack:** React, TypeScript, React Router, Tailwind CSS, existing shadcn UI primitives, Vitest, Biome.

## Global Constraints

- Desktop defaults to `Table`.
- Mobile defaults to `Card`.
- A `Table / Card` switcher is shown for each of the three data sections.
- The selected view is persisted in `localStorage` and restored on later visits.
- Switching views changes presentation only; filtering, sorting, expansion, pagination, links, currency formatting, and pool detail behavior remain the same.
- Render only the active presentation; do not hide a duplicate table/card DOM tree with CSS.
- Avoid new dependencies and avoid per-row callback memoization unless profiling shows a need.
- Preserve keyboard-operable controls, visible focus states, semantic links, and accessible labels.
- Do not change loaders, APIs, domain types, or persisted runtime state.

---

### Task 1: Add Shared View Preference and Switcher

**Files:**
- Create: `src/web-react/app/components/view-switcher.tsx`
- Create: `src/web-react/app/lib/view-preference.ts`
- Create: `test/web-react-view-preference.test.ts`

**Interfaces:**
- `ViewMode`: `"table" | "card"`.
- `readViewPreference(storage: Storage, key: string, fallback: ViewMode): ViewMode` reads only valid stored values and returns `fallback` for missing or invalid data.
- `writeViewPreference(storage: Storage, key: string, mode: ViewMode): void` stores the selected mode.
- `getDefaultViewMode(width: number, breakpoint?: number): ViewMode` returns `"card"` below the breakpoint and `"table"` at or above it; default breakpoint is `768`.
- `ViewSwitcher({ value, onValueChange, label })` renders an accessible existing `ToggleGroup` with `Table` and `Card` options.

- [ ] **Step 1: Write failing preference tests**

Add tests covering valid `table`, valid `card`, missing values, invalid values, mobile/desktop defaults, and the exact breakpoint boundary:

```ts
expect(readViewPreference(storage, "view", "table")).toBe("table");
storage.setItem("view", "card");
expect(readViewPreference(storage, "view", "table")).toBe("card");
storage.setItem("view", "other");
expect(readViewPreference(storage, "view", "table")).toBe("table");
expect(getDefaultViewMode(767)).toBe("card");
expect(getDefaultViewMode(768)).toBe("table");
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run test/web-react-view-preference.test.ts`

Expected: FAIL because `src/web-react/app/lib/view-preference.ts` does not exist yet.

- [ ] **Step 3: Implement the pure preference helper**

Use `storage.getItem`/`setItem` and a small validity check. Do not access `window` at module scope so SSR remains safe.

- [ ] **Step 4: Implement `ViewSwitcher`**

Use the existing `ToggleGroup` and `ToggleGroupItem` from `~/components/ui/toggle-group`. Use `type="single"`, `value`, and `onValueChange`; give the group `aria-label={label}` and each item a visible icon plus text. Do not introduce a new UI dependency.

- [ ] **Step 5: Run the focused test and formatting check**

Run: `npx vitest run test/web-react-view-preference.test.ts` and `npx biome check src/web-react/app/components/view-switcher.tsx src/web-react/app/lib/view-preference.ts test/web-react-view-preference.test.ts`

Expected: PASS with no Biome errors.

- [ ] **Step 6: Commit the shared control**

```bash
git add src/web-react/app/components/view-switcher.tsx src/web-react/app/lib/view-preference.ts test/web-react-view-preference.test.ts
git commit -m "feat(web): add persistent table card view preference"
```

### Task 2: Add Card Presentation to Portfolio Sections

**Files:**
- Modify: `src/web-react/app/components/portfolio/positions-table.tsx`
- Modify: `src/web-react/app/components/portfolio/closed-table.tsx`
- Modify: `src/web-react/app/components/portfolio/portfolio-page.tsx` only if shared preference state must be lifted for one consistent portfolio default

**Interfaces:**
- Keep `PositionsTable` and `ClosedTable` public props unchanged.
- Add local `ViewMode` state initialized from `getDefaultViewMode(window.innerWidth)` inside an effect-safe initializer, then hydrate from the section-specific localStorage key.
- Use section keys `vexis:portfolio:open-view` and `vexis:portfolio:closed-view`.
- Existing table rows remain the source of truth for their corresponding card renderers.

- [ ] **Step 1: Add view state and switcher to `PositionsTable`**

Initialize the mode without reading `window` during SSR, update it on `ViewSwitcher` change, and write the new mode to `localStorage`. Keep `filtered` and `rangeCounts` unchanged. Place the switcher in the existing card header beside the range tabs/search controls.

- [ ] **Step 2: Extract the open-position row data needed by cards**

Reuse the existing calculations for `oor`, `pnlUsd`, `pnlPct`, and range data. Do not create a second filtering/sorting pass. Keep expansion available in card mode by making each card a keyboard-operable button-like row or by placing an explicit accessible details button that calls the existing `setExpanded` handler.

- [ ] **Step 3: Implement the open-position card renderer**

Render pair/icon/address and status badge on top, then Balance, Fees, and PnL USD in three columns, followed by `RangeVisual`. Preserve existing Meteora/Solscan links and copy actions. Mount the existing table only when `viewMode === "table"`; mount cards only when `viewMode === "card"`.

- [ ] **Step 4: Add view state and cards to `ClosedTable`**

Use key `vexis:portfolio:closed-view`. Keep pagination and detail fetching unchanged. Card rows show pair, closure time, Deposit, Withdraw, Fees, PnL USD, and PnL SOL, with the same `CurrencyValue`, PnL classes, and expansion behavior as the table.

- [ ] **Step 5: Run portfolio tests and typecheck**

Run: `npx vitest run test/web-react-view-preference.test.ts test/web-react-ssr.test.ts test/web-react-currency.test.ts` and `npm run typecheck`

Expected: PASS; no SSR access to `window` or `localStorage` at module evaluation.

- [ ] **Step 6: Commit portfolio card views**

```bash
git add src/web-react/app/components/portfolio/positions-table.tsx src/web-react/app/components/portfolio/closed-table.tsx src/web-react/app/components/portfolio/portfolio-page.tsx
git commit -m "feat(web): add portfolio card views"
```

### Task 3: Add Card Presentation to Pool Results

**Files:**
- Modify: `src/web-react/app/components/pools/pools-table.tsx`

**Interfaces:**
- Keep `PoolsTable` props unchanged: `pools`, `currency`, `solPrice`, and `onSelect`.
- Use localStorage key `vexis:pools:results-view`.
- Continue passing the same filtered/sorted `rows` to the active renderer and keep `onSelect(pool)` as the card click action.

- [ ] **Step 1: Add view state and switcher**

Add SSR-safe preference initialization and put `ViewSwitcher` in the existing `CardHeader` beside the organic filter/search controls. Leave `rows`, `toggleSort`, and filter state unchanged.

- [ ] **Step 2: Implement pool cards**

Render the token icon, pool name, shortened address, organic/rug badges, price, MC, TVL, volume, fee, bin/fee detail, and trend sparkline/percentage. Use `fmtAmount`, `fmtPct`, `organicBucket`, `rugBucket`, `pnlClass`, and existing links rather than duplicating formatting logic. Clicking the card calls `onSelect(pool)`; links stop propagation as they do in the table.

- [ ] **Step 3: Mount only the selected pool renderer**

Keep the current table under `viewMode === "table"`; render the card list under `viewMode === "card"`. Do not use CSS visibility or duplicate hidden markup.

- [ ] **Step 4: Verify pool behavior**

Run: `npx vitest run test/web-react-pools-lib.test.ts test/web-react-view-preference.test.ts` and `npm run typecheck`

Expected: PASS with existing pool filtering/formatting tests unchanged.

- [ ] **Step 5: Commit pool cards**

```bash
git add src/web-react/app/components/pools/pools-table.tsx
git commit -m "feat(web): add pool card view"
```

### Task 4: Responsive and Full Verification

**Files:**
- Modify: `src/web-react/app/components/view-switcher.tsx` or affected component files only if verification finds an accessibility or responsive defect.

- [ ] **Step 1: Run project checks**

Run: `npm run check`

Expected: Biome formats and checks the changed files without errors.

- [ ] **Step 2: Run typecheck and all unit tests**

Run: `npm run typecheck` and `npm test`

Expected: both commands pass.

- [ ] **Step 3: Run the web build**

Run: `npm run web:build`

Expected: the React web application builds successfully without SSR or route type errors.

- [ ] **Step 4: Manually verify responsive behavior**

Run: `npm run web:dev`, then inspect the portfolio and pools pages at a desktop width and a mobile width. Confirm desktop starts in table mode, mobile starts in card mode, switching is immediate, and a refresh restores each section's selected mode.

- [ ] **Step 5: Review the final diff**

Run: `git status --short` and `git diff HEAD~3..HEAD --stat`

Confirm only the shared preference/switcher, portfolio/pool view components, tests, and plan/spec documentation changed.
