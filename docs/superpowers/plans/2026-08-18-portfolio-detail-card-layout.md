# Portfolio Detail Card Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make portfolio detail sheets readable on mobile without horizontal table scrolling.

**Architecture:** Replace only the `PositionsDetail` and `ClosedDetail` sheet renderers in their existing files. Reuse existing formatting, currency, link, copy, and PnL helpers.

**Tech Stack:** React, TypeScript, Tailwind CSS, existing shadcn UI components.

## Global Constraints

- Do not change API/domain data.
- Keep the main table views unchanged.
- Do not add dependencies.
- Preserve existing links, values, loading, and error states.

### Task 1: Replace detail tables with stacked cards

**Files:**
- Modify: `src/web-react/app/components/portfolio/positions-table.tsx`
- Modify: `src/web-react/app/components/portfolio/closed-table.tsx`

- [ ] Replace open detail table with pool summary plus one responsive card per live position, including PnL summary and existing position fields.
- [ ] Replace closed detail table and skeleton with stacked cards containing all existing metrics and PnL percentages.
- [ ] Keep links and copy actions usable without nested interactive elements.
- [ ] Run `npm run check`, `npm run typecheck`, `npm test`, and `npm run web:build`.
- [ ] Commit with `feat(web): use cards for portfolio detail sheets`.
