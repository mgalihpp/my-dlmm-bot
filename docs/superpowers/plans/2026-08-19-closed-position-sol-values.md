# Closed Position SOL Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render closed-position deposit, withdrawal, and fee amounts from historical SOL values without depending on the open portfolio SOL price.

**Architecture:** Preserve the detail endpoint's SOL price and use each position total's `sol` field directly. Extend closed pool data with optional SOL aggregate fields and make the card prefer those fields, avoiding live-price conversion and price-driven closed renders.

**Tech Stack:** TypeScript, Effect Schema, React, Vitest.

## Global Constraints

- Do not add dependencies.
- Keep closed data independent from open portfolio price changes.
- Preserve USD display and fallback to `-` when historical SOL data is unavailable.

---

### Task 1: Add historical SOL fields and server payload

**Files:**
- Modify: `src/domain/portfolio.ts`
- Modify: `src/web-react/app/lib/server/portfolio.server.ts`
- Test: `test/domain-portfolio.test.ts`

- [ ] Add optional `totalDepositSol`, `totalWithdrawalSol`, and `totalFeeSol` string fields to `ClosedPool`.
- [ ] Extend `fetchClosedPositionDetail` result with `solPrice` and return `res.solPrice`.
- [ ] Add schema coverage for a closed pool carrying the optional SOL aggregate fields.
- [ ] Run `npm test -- --run test/domain-portfolio.test.ts`.

### Task 2: Use historical SOL values in closed UI

**Files:**
- Modify: `src/web-react/app/components/portfolio/closed-pool-card.tsx`
- Modify: `src/web-react/app/components/portfolio/closed-detail.tsx`
- Test: `test/web-react-pools-lib.test.ts`

- [ ] Add an optional `sol` argument to `PortfolioAmount` and use it before `fmtAmount` conversion.
- [ ] Pass `total.sol` for closed detail deposits, withdrawals, and fees.
- [ ] Pass optional aggregate SOL fields for closed pool cards.
- [ ] Use detail response `solPrice` only as fallback compatibility input.
- [ ] Add a formatting test proving SOL output works with `solPrice: null` when a historical SOL value exists.
- [ ] Run the focused tests.

### Task 3: Verify the full change

- [ ] Run `npm run check`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Review `git diff` and confirm no unrelated files changed.
