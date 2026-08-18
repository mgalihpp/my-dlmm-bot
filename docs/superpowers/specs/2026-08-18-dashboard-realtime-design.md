# Dashboard Realtime (SSE Heartbeat) — Design

Date: 2026-08-18
Branch: feat/dashboard-realtime

## Problem

Dashboard pages only refresh when the browser tab is visible/active:

- `portfolio-page.tsx` and `agent-page.tsx` poll with `setInterval(30s)` but skip when `document.hidden` is true.
- `pools-page.tsx` has no interval at all, only refreshes on `visibilitychange`.
- Browsers throttle `setInterval` in background tabs (~1/min), so client polling can never deliver real-time updates in the background.

Goal: data refreshes in the background even when the user is on another browser tab, at ~10s cadence.

## Non-Goals

- No WebSocket (bidirectional not needed).
- No push of full payloads over SSE — revalidation reuses existing loaders.
- No Telegram/notification integration.

## Architecture

Single SSE heartbeat channel, one connection per authenticated browser, revalidates whichever route is active.

### Server side

New resource route `src/web-react/app/routes/api/live.tsx`:

- Uses existing `authMiddleware` (session cookie; EventSource is same-origin and sends cookies).
- A small `EventHub` registry (`Set` of stream controllers) lives in `src/web-react/app/lib/server/event-hub.ts`:

  ```ts
  export class EventHub {
    private clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
    add(c: ReadableStreamDefaultController<Uint8Array>): () => void;
    broadcast(data: string): void;  // writes `data: ping\n\n`; drops dead controllers on error
    start(cadenceMs: number): void; // setInterval; no-op when no clients
  }
  ```

- `loader` returns a `Response` with:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache, no-transform`
  - `X-Accel-Buffering: no` (so nginx-style buffering does not delay pings)
  - a `ReadableStream` whose `start()` registers the controller in the hub and whose `cancel()` unregisters it.
- One module-level `EventHub` instance, `start(10_000)` on first use.
- Heartbeat writes only when at least one client is connected.

### Client side

New hook `src/web-react/app/hooks/use-realtime.ts`:

- Opens `new EventSource("/api/live")`.
- On `onmessage` → `revalidate()`, skipping if the revalidator `state` is `"loading"` (prevents stacked RPC/API calls).
- Cleans up: closes EventSource on unmount.
- EventSource auto-reconnects on network drops (browser built-in).

Mounted once in `DashboardShell` (`src/web-react/app/components/dashboard-shell.tsx`), which wraps all three pages and only renders after login — no SSE connection on the login page (avoids 401 reconnect loops).

### Removed

From `portfolio-page.tsx`, `pools-page.tsx`, `agent-page.tsx`:

- the `setInterval` + `document.hidden` guard
- the `visibilitychange` listeners
- the now-unused `REFRESH_MS` constants and imports

`useRevalidator` stays (the hook drives it; manual refresh buttons stay).

## Data flow

1. Page loads → loader runs (initial data).
2. `DashboardShell` mounts → hook opens EventSource → server registers the stream.
3. Server timer (10s) → `broadcast("ping")` to all connected clients.
4. Browser `onmessage` → `revalidate()` (skipped if already loading) → React Router re-runs the active route's loaders → UI updates in place, no navigation/flicker.
5. Tab in background: EventSource is not throttled by the browser, so pings keep arriving and loaders keep re-running.
6. Tab closed/refreshed: stream `cancel()` unregisters the client.

## Error handling

- Server: write error (client gone) → controller dropped from the hub; `broadcast` catches per-controller errors.
- Client: EventSource auto-reconnects (default backoff); no custom retry logic.
- Loader errors are already handled per page (`ok: false` + message rendered in UI); unchanged.

## Testing

One unit test for `EventHub` (`src/web-react/app/lib/server/event-hub.test.ts`): add/remove/broadcast, dead-controller eviction. Pure logic, no network, per repo convention (Vitest, inline fixtures).

## Files touched

| File | Change |
| --- | --- |
| `src/web-react/app/routes/api/live.tsx` | new — SSE resource route |
| `src/web-react/app/lib/server/event-hub.ts` | new — connection registry + heartbeat |
| `src/web-react/app/lib/server/event-hub.test.ts` | new — unit test |
| `src/web-react/app/hooks/use-realtime.ts` | new — client hook |
| `src/web-react/app/components/dashboard-shell.tsx` | mount hook |
| `src/web-react/app/components/portfolio/portfolio-page.tsx` | remove polling + visibility handlers |
| `src/web-react/app/components/pools/pools-page.tsx` | remove visibility handler |
| `src/web-react/app/components/agent/agent-page.tsx` | remove polling + visibility handlers |
