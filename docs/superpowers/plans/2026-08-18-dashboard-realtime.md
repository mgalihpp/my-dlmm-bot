# Dashboard Realtime (SSE Heartbeat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh dashboard data (~10s cadence) even while the browser tab is in the background, via a single SSE heartbeat channel that triggers `useRevalidator`.

**Architecture:** Server holds a `Set` of SSE stream controllers in an `EventHub` singleton; a `setInterval` broadcasts `data: ping` every 10s to connected clients. A new resource route `/api/live` registers each client's stream. A client hook opens `EventSource("/api/live")` and calls `revalidate()` on every message (skipping when a revalidation is already in flight). Mounted once in `DashboardShell`; the old per-page `setInterval`/`visibilitychange` polling is deleted.

**Tech Stack:** React Router 8.3.0 (framework mode, SSR), Node 22 web streams, browser `EventSource`, Vitest (root config).

## Global Constraints

- ESM-only, `.js` extensions in local imports (repo convention).
- Biome formatting/import organization — run `npm run check` before committing.
- No new dependencies.
- Tests must not touch network/RPC/Telegram — pure logic only (root `vitest.config.ts` includes `src/**/*.test.ts` and aliases `~` → `src/web-react/app`).
- Auth on the SSE route: reuse existing `authMiddleware` (session cookie).
- Work on branch `feat/dashboard-realtime`.

---

### Task 1: EventHub registry with unit test (TDD)

**Files:**
- Create: `src/web-react/app/lib/server/event-hub.ts`
- Test: `src/web-react/app/lib/server/event-hub.test.ts`

**Interfaces:**
- Produces:
  - `export class EventHub`
    - `add(client: ReadableStreamDefaultController<Uint8Array>): () => void` — register; returned fn unregisters.
    - `get size(): number`
    - `broadcast(data: string): void` — writes `data: <data>\n\n` to each client; a client whose `enqueue` throws is removed.
    - `start(cadenceMs: number): void` — starts the heartbeat timer once; no-op if already started; broadcasts only when `size > 0`.
  - `export const realtimeHub: EventHub` — module-level singleton.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { EventHub } from "./event-hub";

function fakeController() {
	return {
		enqueue: vi.fn(),
	} as unknown as ReadableStreamDefaultController<Uint8Array>;
}

describe("EventHub", () => {
	it("registers and unregisters clients", () => {
		const hub = new EventHub();
		const cleanup = hub.add(fakeController());
		expect(hub.size).toBe(1);
		cleanup();
		expect(hub.size).toBe(0);
	});

	it("broadcasts a data frame to all clients", () => {
		const hub = new EventHub();
		const a = fakeController();
		const b = fakeController();
		hub.add(a);
		hub.add(b);
		hub.broadcast("ping");
		expect(a.enqueue).toHaveBeenCalledWith(
			new TextEncoder().encode("data: ping\n\n"),
		);
		expect(b.enqueue).toHaveBeenCalledWith(
			new TextEncoder().encode("data: ping\n\n"),
		);
	});

	it("evicts a dead client whose enqueue throws", () => {
		const hub = new EventHub();
		const dead = fakeController();
		dead.enqueue.mockImplementation(() => {
			throw new Error("closed");
		});
		hub.add(dead);
		hub.add(fakeController());
		hub.broadcast("ping");
		expect(hub.size).toBe(1);
	});

	it("heartbeat broadcasts only while clients are connected", () => {
		vi.useFakeTimers();
		try {
			const hub = new EventHub();
			hub.start(10_000);
			const client = fakeController();
			const cleanup = hub.add(client);
			vi.advanceTimersByTime(20_000);
			expect(client.enqueue).toHaveBeenCalledTimes(2);
			cleanup();
			client.enqueue.mockClear();
			vi.advanceTimersByTime(20_000);
			expect(client.enqueue).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- event-hub`
Expected: FAIL — module `./event-hub` not found.

- [ ] **Step 3: Write the implementation**

```ts
export class EventHub {
	private readonly clients =
		new Set<ReadableStreamDefaultController<Uint8Array>>();
	private timer: ReturnType<typeof setInterval> | null = null;

	add(client: ReadableStreamDefaultController<Uint8Array>): () => void {
		this.clients.add(client);
		return () => {
			this.clients.delete(client);
		};
	}

	get size(): number {
		return this.clients.size;
	}

	broadcast(data: string): void {
		const frame = new TextEncoder().encode(`data: ${data}\n\n`);
		for (const client of [...this.clients]) {
			try {
				client.enqueue(frame);
			} catch {
				this.clients.delete(client);
			}
		}
	}

	start(cadenceMs: number): void {
		if (this.timer !== null) return;
		this.timer = setInterval(() => {
			if (this.clients.size > 0) this.broadcast("ping");
		}, cadenceMs);
		this.timer.unref?.();
	}
}

export const realtimeHub = new EventHub();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- event-hub`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/web-react/app/lib/server/event-hub.ts src/web-react/app/lib/server/event-hub.test.ts
git commit -m "feat: EventHub SSE client registry with heartbeat"
```

---

### Task 2: SSE resource route `/api/live`

**Files:**
- Create: `src/web-react/app/routes/api/live.tsx`
- Modify: `src/web-react/app/routes.ts` (add route line)

**Interfaces:**
- Consumes: `realtimeHub` from `src/web-react/app/lib/server/event-hub.ts`, `authMiddleware` from `src/web-react/app/middleware/auth.ts`.
- Produces: `GET /api/live` → `text/event-stream`; sends `data: connected` once on connect, then `data: ping` every 10s.

- [ ] **Step 1: Create the route**

`src/web-react/app/routes/api/live.tsx`:

```tsx
import { realtimeHub } from "~/lib/server/event-hub";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/live";

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export function loader(_args: Route.LoaderArgs): Response {
	realtimeHub.start(10_000);
	let cleanup: (() => void) | null = null;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			cleanup = realtimeHub.add(controller);
			controller.enqueue(new TextEncoder().encode("data: connected\n\n"));
		},
		cancel() {
			cleanup?.();
		},
	});
	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			"X-Accel-Buffering": "no",
			Connection: "keep-alive",
		},
	});
}
```

`src/web-react/app/routes.ts` — add one line after `api/closed-detail`:

```ts
	route("api/live", "routes/api/live.tsx"),
```

- [ ] **Step 2: Typegen + typecheck**

Run: `npm run typecheck --prefix src/web-react`
Expected: PASS — typegen generates `app/routes/api/+types/live.d.ts`.

- [ ] **Step 3: Smoke-test the endpoint manually**

Run: `npm run web:dev` (from repo root), then in a second terminal:

```bash
curl -N --max-time 25 http://localhost:5173/api/live
```

Expected: if `web.password` is unset in `vexis.config.json`, output shows `data: connected` then `data: ping` every ~10s. If a password is set, expect a 302 redirect to `/` (auth works) — the browser-side stream check happens in Task 3 Step 6 instead. Stop the dev server after verifying.

- [ ] **Step 4: Commit**

```bash
git add src/web-react/app/routes/api/live.tsx src/web-react/app/routes.ts
git commit -m "feat: SSE heartbeat resource route /api/live"
```

---

### Task 3: Client hook + mount in DashboardShell + remove old polling

**Files:**
- Create: `src/web-react/app/hooks/use-realtime.ts`
- Modify: `src/web-react/app/components/dashboard-shell.tsx`
- Modify: `src/web-react/app/components/portfolio/portfolio-page.tsx` (remove lines 78-90 effect + `REFRESH_MS` const at line 35)
- Modify: `src/web-react/app/components/pools/pools-page.tsx` (remove lines 57-63 effect)
- Modify: `src/web-react/app/components/agent/agent-page.tsx` (remove lines 22 `REFRESH_MS`, 30-42 effect; drop `useEffect` from react import at line 2)

**Interfaces:**
- Consumes: `revalidate` + `state` from `useRevalidator()` (React Router).
- Produces: `export function useRealtimeRevalidate(): void` — opens `EventSource("/api/live")`, calls `revalidate()` on each message unless a revalidation is already running; closes the connection on unmount.

- [ ] **Step 1: Create the hook**

`src/web-react/app/hooks/use-realtime.ts`:

```tsx
import { useEffect, useRef } from "react";
import { useRevalidator } from "react-router";

export function useRealtimeRevalidate(): void {
	const { revalidate, state } = useRevalidator();
	const stateRef = useRef(state);
	stateRef.current = state;

	useEffect(() => {
		const events = new EventSource("/api/live");
		events.onmessage = () => {
			if (stateRef.current !== "loading") revalidate();
		};
		return () => events.close();
	}, [revalidate]);
}
```

- [ ] **Step 2: Mount in DashboardShell**

`src/web-react/app/components/dashboard-shell.tsx` — add the hook call at the top of the component body:

```tsx
import { useRealtimeRevalidate } from "~/hooks/use-realtime";
import type { ReactNode } from "react";
import { AppSidebar } from "~/components/app-sidebar";
import { MobileBottomNav } from "~/components/mobile-bottom-nav";
import { SiteHeader } from "~/components/site-header";
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar";

export function DashboardShell({
	title = "Documents",
	wallet,
	rpc,
	children,
}: {
	title?: string;
	wallet?: string;
	rpc?: string;
	children: ReactNode;
}) {
	useRealtimeRevalidate();
	return (
		// ...unchanged JSX
	);
}
```

- [ ] **Step 3: Strip old polling from portfolio-page.tsx**

Remove:
- `const REFRESH_MS = 30_000;` (line 35)
- the whole `useEffect` block at lines 78-90 (interval + `visibilitychange` listener)

Keep `useEffect` in the react import (still used for greeting at line 70 and storedCurrency at line 74). Keep `useRevalidator` (manual refresh button still uses it).

- [ ] **Step 4: Strip old polling from pools-page.tsx**

Remove the whole `useEffect` block at lines 57-63 (`visibilitychange` listener only). `useEffect` is still used for storedCurrency at line 53 — keep the import.

- [ ] **Step 5: Strip old polling from agent-page.tsx**

Remove:
- `const REFRESH_MS = 30_000;` (line 22)
- the whole `useEffect` block at lines 30-42
- `useEffect` from the react import at line 2 → `import { lazy, Suspense } from "react";`

Keep `useRevalidator` (manual refresh button at line 64 uses `state`).

- [ ] **Step 6: Verify in dev**

Run: `npm run web:dev` — open `http://localhost:5173/portfolio`, log in. Open DevTools → Network → filter `live`. Expect:
- One `api/live` request held open (status 200, `text/event-stream`).
- New `data: ping` events every ~10s while the tab is **hidden** too (open another browser tab and wait 30s; the ping events keep arriving).
- Portfolio numbers update in place without manual refresh.

- [ ] **Step 7: Commit**

```bash
git add src/web-react/app/hooks/use-realtime.ts src/web-react/app/components/dashboard-shell.tsx src/web-react/app/components/portfolio/portfolio-page.tsx src/web-react/app/components/pools/pools-page.tsx src/web-react/app/components/agent/agent-page.tsx
git commit -m "feat: realtime dashboard revalidation via SSE heartbeat"
```

---

### Task 4: Full verification

**Files:** none.

- [ ] **Step 1: Run tests**

Run: `npm test`
Expected: PASS (existing suite + new `event-hub.test.ts`).

- [ ] **Step 2: Run typecheck (both projects)**

Run: `npm run typecheck` and `npm run typecheck --prefix src/web-react`
Expected: PASS for both.

- [ ] **Step 3: Run Biome check + lint**

Run: `npm run check` and `npm run lint`
Expected: no errors; if Biome reformats files, review and commit the formatting.

- [ ] **Step 4: Final commit if formatting changed**

```bash
git add -A
git commit -m "style: biome format"
```

- [ ] **Step 5: Confirm spec coverage**

Check each spec section against the implemented code:
- `routes/api/live.tsx` — SSE resource route with `authMiddleware` ✅ (Task 2)
- `lib/server/event-hub.ts` — registry + 10s heartbeat, dead-controller eviction ✅ (Task 1)
- `hooks/use-realtime.ts` + `dashboard-shell.tsx` mount ✅ (Task 3)
- old polling removed from all 3 pages ✅ (Task 3)
- `event-hub.test.ts` unit test ✅ (Task 1)
