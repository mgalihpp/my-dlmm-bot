# Portfolio Card Details Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open portfolio card details in a right-side sheet while preserving table expansion behavior.

**Architecture:** Keep `PositionsDetail` and `ClosedDetail` as the single detail implementations. Card components will report the selected pool to their parent section, and each section will mount one controlled `Sheet` only while a card is selected.

**Tech Stack:** React, TypeScript, existing shadcn `Sheet`, Vitest, Biome.

## Global Constraints

- Reuse the existing shadcn `Sheet` primitives and current detail components.
- Do not duplicate detail fetching or formatting logic.
- Do not mount hidden detail sheets for every card.
- Table mode keeps the current inline row expansion unchanged.
- Use `SheetTitle` and `SheetDescription` for an accessible dialog label.

---

### Task 1: Move Open Card Details Into a Sheet

**Files:**
- Modify: `src/web-react/app/components/portfolio/positions-table.tsx`

**Interfaces:**
- Keep `PositionsTable` props unchanged.
- Change `OpenPositionCard` from `expanded/onToggle` props to `onDetails: () => void`.
- Store the selected `OpenPoolWithIcons | null` in `PositionsTable` only for card mode.

- [ ] **Step 1: Replace inline card detail props**

Remove `expanded` and `onToggle` from `OpenPositionCard`; keep the `Details` button and call the new `onDetails` callback.

- [ ] **Step 2: Add the controlled open-position sheet**

Import `Sheet`, `SheetContent`, `SheetDescription`, `SheetHeader`, and `SheetTitle`. Render one sheet after the active card/table content:

```tsx
<Sheet
  open={selectedCard !== null}
  onOpenChange={(open) => !open && setSelectedCard(null)}
>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>{selectedCard ? pair(selectedCard.tokenX, selectedCard.tokenY) : "Position details"}</SheetTitle>
      <SheetDescription>
        {selectedCard ? shortAddr(selectedCard.poolAddress, 6) : ""}
      </SheetDescription>
    </SheetHeader>
    {selectedCard ? <PositionsDetail pool={selectedCard} /> : null}
  </SheetContent>
</Sheet>
```

Use the existing `PositionsDetail` and mount it only when `selectedCard` exists.

- [ ] **Step 3: Verify open card behavior compiles**

Run: `npm run typecheck` and `npx vitest run test/web-react-ssr.test.ts`

Expected: PASS with no SSR access errors.

- [ ] **Step 4: Commit the open-position sheet**

```bash
git add src/web-react/app/components/portfolio/positions-table.tsx
git commit -m "feat(web): open position card details in sheet"
```

### Task 2: Move Closed Card Details Into a Sheet

**Files:**
- Modify: `src/web-react/app/components/portfolio/closed-table.tsx`

**Interfaces:**
- Keep `ClosedTable` props unchanged.
- Change `ClosedPoolCard` from `expanded/onToggle` props to `onDetails: () => void`.
- Store the selected `ClosedPool | null` in `ClosedTable` only for card mode.

- [ ] **Step 1: Replace inline closed detail props**

Remove `expanded` and `onToggle` from `ClosedPoolCard`; keep the `Details` button and call `onDetails`.

- [ ] **Step 2: Add the controlled closed-position sheet**

Use the same sheet primitives. Title it with the selected pair, describe it with the shortened pool address, and render `<ClosedDetail pool={selectedCard.poolAddress} pairLabel={pair(...)} />` only when a card is selected. This preserves `ClosedDetail`'s existing lazy fetch because it is not mounted until the sheet opens.

- [ ] **Step 3: Verify closed card behavior compiles**

Run: `npm run typecheck` and `npx vitest run test/web-react-ssr.test.ts test/web-react-currency.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit the closed-position sheet**

```bash
git add src/web-react/app/components/portfolio/closed-table.tsx
git commit -m "feat(web): open closed position card details in sheet"
```

### Task 3: Run Full Verification

**Files:**
- No planned files; only fix formatting or type errors in the two portfolio components if checks identify them.

- [ ] **Step 1: Run formatting and lint checks**

Run: `npm run check`

Expected: PASS with no Biome errors.

- [ ] **Step 2: Run typecheck and all tests**

Run: `npm run typecheck` and `npm test`

Expected: PASS.

- [ ] **Step 3: Run the web build**

Run: `npm run web:build`

Expected: client and SSR builds complete successfully.

- [ ] **Step 4: Review the branch**

Run: `rtk git status --short` and `rtk git log --oneline -5`

Confirm the branch contains only the portfolio sheet implementation and its plan/spec documentation.
