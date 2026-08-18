# Settings Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the React settings page into a responsive card-based configuration dashboard.

**Architecture:** Reuse the existing settings route, payload, field rows, cards, and shadcn tokens. Replace only the page-level tab navigation with local section-card navigation and improve the section/status presentation.

**Tech Stack:** React 19, React Router 8, Tailwind CSS 4, shadcn UI, lucide-react, Vitest.

## Global Constraints

- No new dependencies.
- Preserve existing server actions, config persistence, secret handling, and settings field behavior.
- Keep ESM imports and existing formatting conventions.
- Support desktop and mobile layouts, keyboard focus, and reduced motion.

---

### Task 1: Replace settings page navigation with card dashboard

**Files:**
- Modify: `src/web-react/app/components/settings/settings-page.tsx`

**Interfaces:**
- Consumes: existing `SettingsPayload`, `SettingsSection`, `PreferencesCard`, `AgentStatusCard`.
- Produces: the redesigned `/settings` page with local section selection.

- [ ] **Step 1: Implement local section state and section metadata**

Use `useState` for the active section and define title, description, and icon metadata for `general`, `agent`, `create`, `pools`, and `preferences`. Keep the existing loader/action data selection and error handling.

- [ ] **Step 2: Render the header, agent card, section overview cards, and selected section**

Render section cards as accessible buttons with `aria-pressed`, count badges, visible focus styles, and responsive grid classes. Render only the selected `SettingsSection` or `PreferencesCard` below the overview. Keep save/error feedback in the header.

- [ ] **Step 3: Run web typecheck**

Run from `src/web-react`: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Format and lint the changed file**

Run: `npx biome check --write src/web-react/app/components/settings/settings-page.tsx`

Expected: PASS.

### Task 2: Verify behavior and responsive rendering

**Files:**
- No additional files unless verification exposes a focused styling/type issue.

- [ ] **Step 1: Run settings tests**

Run: `npx vitest run test/web-react-settings.test.ts`

Expected: PASS.

- [ ] **Step 2: Run repository checks**

Run: `npm run check`, `npm run typecheck`, and `npm test`.

Expected: all PASS.

- [ ] **Step 3: Smoke-test the page at desktop and mobile widths**

Confirm section cards switch the visible editor, field edits still submit, the agent action remains available, and the error state remains readable. Confirm no secrets are rendered.
