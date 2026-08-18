# Responsive Sheet Side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make portfolio and pool detail sheets open from the bottom on mobile and from the right on desktop.

**Architecture:** Reuse the existing `useIsMobile` hook in the three sheet-owning components and pass its result to the existing `SheetContent side` prop. No state or API changes are needed.

**Tech Stack:** React, TypeScript, existing shadcn Sheet.

## Global Constraints

- Mobile uses `side="bottom"`.
- Desktop uses `side="right"`.
- Keep existing sheet state, detail content, focus handling, and close behavior.
- Do not add dependencies or change APIs.

---

### Task 1: Apply Responsive Sheet Sides

**Files:**
- Modify: `src/web-react/app/components/portfolio/positions-table.tsx`
- Modify: `src/web-react/app/components/portfolio/closed-table.tsx`
- Modify: `src/web-react/app/components/pools/pool-detail-sheet.tsx`

- [ ] **Step 1: Import and call `useIsMobile`**

In each component that renders a detail sheet, import `useIsMobile` from `~/hooks/use-mobile` and call it inside the component.

- [ ] **Step 2: Set the sheet side**

Pass this prop to each detail sheet content:

```tsx
<SheetContent side={isMobile ? "bottom" : "right"}>
```

Keep all existing classes and children unchanged.

- [ ] **Step 3: Run verification**

Run: `npm run check`, `npm run typecheck`, `npm test`, and `npm run web:build`.

Expected: all commands pass.

- [ ] **Step 4: Commit**

```bash
git add src/web-react/app/components/portfolio/positions-table.tsx src/web-react/app/components/portfolio/closed-table.tsx src/web-react/app/components/pools/pool-detail-sheet.tsx docs/superpowers/plans/2026-08-18-responsive-sheet-side.md
git commit -m "feat(web): use bottom sheets on mobile"
```
