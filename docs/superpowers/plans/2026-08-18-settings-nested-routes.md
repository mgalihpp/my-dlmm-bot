# Settings Nested Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each settings category a stable URL while preserving the existing parent loader, action, auth, and UI behavior.

**Architecture:** Convert the settings route into a parent layout with an index list and child category routes. Child pages read the parent loader data and render the existing settings editors; links replace local section state.

**Tech Stack:** React Router 8, React 19, TypeScript, existing shadcn components.

## Global Constraints

- Preserve existing settings actions and server validation.
- Keep `/settings` as the category index.
- Use `/settings/general`, `/settings/agent`, `/settings/create`, `/settings/pools`, and `/settings/preferences`.
- No new dependencies.

---

### Task 1: Add nested settings route structure

**Files:**
- Modify: `src/web-react/app/routes.ts`
- Modify: `src/web-react/app/routes/settings.tsx`
- Create: `src/web-react/app/routes/settings-index.tsx`
- Create: `src/web-react/app/routes/settings-category.tsx`

- [ ] Update the route config with an index child and `:category` child.
- [ ] Keep loader/action/auth on the parent and render an `Outlet`.
- [ ] Move list and detail rendering into index/category route components using parent loader data.
- [ ] Add links and back navigation using route URLs.
- [ ] Run `npm run typecheck` in `src/web-react`.
- [ ] Run focused settings tests.
