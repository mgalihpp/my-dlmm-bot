# Server Data Fetching and Loading Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep application data fetching in server loaders and show a global top loading indicator during route loader navigation.

**Architecture:** Route loaders remain the only source of page data. Query filters use URL navigation so the server loader runs again. The root app observes React Router navigation state only for visual feedback; it does not fetch data.

**Tech Stack:** React Router 8 framework mode, React 19, TypeScript, Tailwind CSS.

## Global Constraints

- Keep `ssr: true`.
- Do not add dependencies.
- Keep external API/RPC access in `*.server.ts` modules.
- Preserve existing routes and filter behavior.

---

### Task 1: Make currency selection URL/server-driven

**Files:**
- Modify: `src/web-react/app/components/portfolio/portfolio-page.tsx`
- Modify: `src/web-react/app/components/pools/pools-page.tsx`
- Modify: `src/web-react/app/routes/portfolio.tsx`

- [ ] Read currency from `searchParams` and pass it as the rendered `Currency` value.
- [ ] Update USD/SOL clicks through `setSearchParams`, without maintaining a separate currency state or localStorage-driven currency state.
- [ ] Preserve `closedPage` while changing portfolio currency query parameters.
- [ ] Read and validate the portfolio currency query in the server loader so the server-rendered page receives the selected currency.
- [ ] Run `npm run typecheck --prefix src/web-react` and verify the route/component types pass.

### Task 2: Add global top loading indicator

**Files:**
- Create: `src/web-react/app/components/top-loading-indicator.tsx`
- Modify: `src/web-react/app/root.tsx`
- Modify: `src/web-react/app/app.css`

- [ ] Use `useNavigation()` and render nothing while navigation state is `idle`.
- [ ] Render a fixed, accessible progress bar at the top of the viewport while navigation is loading/submitting.
- [ ] Mount it once in `App` above `Outlet` so it covers every route loader and URL filter navigation.
- [ ] Add minimal CSS animation using existing Tailwind/CSS conventions, including reduced-motion handling.
- [ ] Run the web typecheck and Biome check.

### Task 3: Remove clientLoader duplication

**Files:**
- Modify: `src/web-react/app/routes/api/closed-detail.tsx`

- [ ] Remove the redundant `clientLoader`; retain only the server `loader`.
- [ ] Keep the existing authenticated route boundary and response shape unchanged.
- [ ] Run targeted tests and the web build to verify route generation and SSR compilation.

### Task 4: Verify end-to-end behavior

**Files:**
- Test: `test/web-react-currency.test.ts`

- [ ] Add pure tests for valid URL currency values and USD default behavior.
- [ ] Run `npm run check`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build --prefix src/web-react`.
