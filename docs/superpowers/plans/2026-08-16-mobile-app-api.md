# Mobile App — Backend API Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a token-authenticated JSON API to the existing Effect web server (`/api/login`, `/api/portfolio`, `/api/positions`, `/api/pools`) that the future Expo mobile app will consume — Phase 1 of the mobile app spec (`docs/superpowers/specs/2026-08-16-mobile-app-design.md`).

**Architecture:** Extend the existing `src/web/` Effect `HttpServer`. API routes live beside the HTML routes in `buildRouter`. Auth reuses the existing HMAC machinery in `src/web/auth.ts`: the dashboard password signs a 30-day bearer token. The server-level cookie middleware (`requireAuth`) exempts `/api/*` paths; each protected API route is individually wrapped by a new `requireApiToken` gate that validates the `Authorization: Bearer` header. Data endpoints call the same services the web pages use (`MeteoraApi`, `Dlmm`, `Screening`) through the shared `AppLayer` — no new execution logic.

**Tech Stack:** Effect 3 (`@effect/platform` HttpServer/HttpRouter/HttpServerRequest/HttpServerResponse), TypeScript strict, Vitest, Biome, ESM.

## Global Constraints

- ESM-only. Use `.js` extensions in local imports (e.g. `from "../auth.js"`).
- TypeScript strict mode; no `any`; no unused locals. Biome formatting (`npm run check`).
- Effect-first: no throwing; use tagged errors from `src/errors.ts`; `errorMessage(e)` converts them to strings.
- Tests must not hit the live network. Localhost real-server tests on a free port are the established pattern (see `test/web-server-lifecycle.test.ts`).
- Do not modify `vexis.config.json`, `.vexis-*.json`, or `src/telegram/` in this plan.
- Every commit must leave `npm run check && npm run typecheck && npm test` green (run once per task end).
- No new dependencies.
- Existing code facts verified at plan time:
  - `HttpServerResponse.unsafeJson(body, options)` returns a plain `HttpServerResponse`; options include `status` (`node_modules/@effect/platform/dist/dts/HttpServerResponse.d.ts:46`).
  - `HttpServerRequest.schemaBodyJson(schema)` parses a JSON body as an Effect (`HttpServerRequest.d.ts:122`).
  - `HttpServerRequest.HttpServerRequest` is provided to handlers by the server; `request.headers.get("authorization")` reads headers.
  - `parseTimeframe(input)` (`src/lib/screening.ts:6`) returns `null` for invalid/empty input; valid: `5m, 30m, 1h, 2h, 4h, 12h, 24h`.
  - `OpenPool`/`PortfolioTotal`/`ClosedPool` types: `src/domain/portfolio.ts:3-123`.
  - `ScreenResult = { pools: ScreenedPool[]; total: number; filtered: number }` (`src/lib/screening.ts:176`).

---

### Task 1: API bearer token sign/verify in `src/web/auth.ts`

**Files:**
- Modify: `src/web/auth.ts` (append after `verifySessionCookie`, before `sessionCookieHeader`)
- Test: `test/web-api-auth.test.ts`

**Interfaces:**
- Consumes: existing private `hmac(password, payload)` in `src/web/auth.ts` (already defined at line 6) and existing `verifySessionCookie` (line 25).
- Produces:
  - `export const API_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000`
  - `export function signApiToken(password: string, now?: number): string`
  - `export function verifyApiToken(token: string, password: string, now?: number): boolean`

Token format is identical to the session cookie: `base64url(JSON { exp }) + "." + hmac-hex`. The token is a signed expiring value; `verifyApiToken` delegates to `verifySessionCookie` (same payload format, same verification). No server-side token store.

- [ ] **Step 1: Write the failing test**

Create `test/web-api-auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	API_TOKEN_TTL_MS,
	signApiToken,
	verifyApiToken,
} from "../src/web/auth.js";

describe("api token", () => {
	const NOW = 1_752_000_000_000;

	it("sign/verify roundtrip", () => {
		const token = signApiToken("pw", NOW);
		expect(verifyApiToken(token, "pw", NOW)).toBe(true);
	});

	it("rejects token signed with a different password", () => {
		const token = signApiToken("pw", NOW);
		expect(verifyApiToken(token, "other", NOW)).toBe(false);
	});

	it("rejects tampered token", () => {
		const token = signApiToken("pw", NOW);
		const flip = token.endsWith("0") ? "1" : "0";
		const tampered = `${token.slice(0, -1)}${flip}`;
		expect(verifyApiToken(tampered, "pw", NOW)).toBe(false);
	});

	it("rejects expired token", () => {
		const token = signApiToken("pw", NOW - API_TOKEN_TTL_MS - 1);
		expect(verifyApiToken(token, "pw", NOW)).toBe(false);
	});

	it("rejects garbage", () => {
		expect(verifyApiToken("not-a-token", "pw", NOW)).toBe(false);
		expect(verifyApiToken("a.b", "pw", NOW)).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/web-api-auth.test.ts`
Expected: FAIL — `signApiToken` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/web/auth.ts` (after `verifySessionCookie`, line 48):

```ts
export const API_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function signApiToken(password: string, now = Date.now()): string {
	const payload = Buffer.from(
		JSON.stringify({ exp: now + API_TOKEN_TTL_MS }),
		"utf8",
	).toString("base64url");
	return `${payload}.${hmac(password, payload).toString("hex")}`;
}

export function verifyApiToken(
	token: string,
	password: string,
	now = Date.now(),
): boolean {
	return verifySessionCookie(token, password, now);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/web-api-auth.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Check + commit**

```bash
npm run check && npm run typecheck && npx vitest run
git add src/web/auth.ts test/web-api-auth.test.ts
git commit -m "feat(web): API bearer token sign/verify (30-day, HMAC)"
```

---

### Task 2: API gate helpers — `bearerToken`, `apiError`, `requireApiToken`

**Files:**
- Create: `src/web/api/shared.ts`
- Test: `test/web-api-gate.test.ts`

**Interfaces:**
- Consumes: `verifyApiToken` from Task 1 (`src/web/auth.js`).
- Produces:
  - `export function bearerToken(authorization: string | null | undefined): string | null`
  - `export function apiError(status: number, message: string): HttpServerResponse.HttpServerResponse`
  - `export function requireApiToken<R>(password: string, handler: Effect.Effect<HttpServerResponse.HttpServerResponse, never, R>): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R | HttpServerRequest.HttpServerRequest>`

Response shape on rejection: HTTP 401, body `{ "error": "unauthorized" }`.

- [ ] **Step 1: Write the failing test**

Create `test/web-api-gate.test.ts`. It boots a real server on a free port (same pattern as `test/web-server-lifecycle.test.ts`) with a router whose only protected route is `/api/probe` (no services needed), and asserts the gate behavior over HTTP:

```ts
import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect, Fiber } from "effect";
import { describe, expect, it } from "vitest";
import { createWebServerProgram } from "../src/web/lifecycle.js";
import { signApiToken } from "../src/web/auth.js";
import { requireApiToken } from "../src/web/api/shared.js";

async function freePort(): Promise<number> {
	const server = await import("node:net").then(({ createServer }) => {
		const probe = createServer();
		return new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
			probe.once("error", reject);
			probe.listen(0, "127.0.0.1", () => resolve(probe));
		});
	});
	const address = server.address();
	if (address === null || typeof address === "string") {
		server.close();
		throw new Error("Could not determine an available port");
	}
	const port = address.port;
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	return port;
}

async function bootServer(): Promise<{ url: string; stop: () => Promise<void> }> {
	const port = await freePort();
	const probe = Effect.succeed(HttpServerResponse.unsafeJson({ ok: true }));
	const router = HttpRouter.empty.pipe(
		HttpRouter.get("/api/probe", requireApiToken("pw", probe)),
	);
	const fiber = Effect.runFork(createWebServerProgram(router, port));
	const url = `http://127.0.0.1:${port}`;
	const deadline = Date.now() + 2_000;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${url}/api/probe`);
			if (res.status === 401) break;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	}
	return {
		url,
		stop: () => Effect.runPromise(Fiber.interrupt(fiber)),
	};
}

describe("requireApiToken gate", () => {
	const NOW = 1_752_000_000_000;

	it("rejects missing token with 401 JSON", async () => {
		const server = await bootServer();
		try {
			const res = await fetch(`${server.url}/api/probe`);
			expect(res.status).toBe(401);
			expect(await res.json()).toEqual({ error: "unauthorized" });
		} finally {
			await server.stop();
		}
	});

	it("rejects tampered token", async () => {
		const server = await bootServer();
		try {
			const token = signApiToken("pw", NOW);
			const tampered = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;
			const res = await fetch(`${server.url}/api/probe`, {
				headers: { authorization: `Bearer ${tampered}` },
			});
			expect(res.status).toBe(401);
		} finally {
			await server.stop();
		}
	});

	it("rejects expired token", async () => {
		const server = await bootServer();
		try {
			const token = signApiToken("pw", NOW - 31 * 24 * 3_600_000);
			const res = await fetch(`${server.url}/api/probe`, {
				headers: { authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(401);
		} finally {
			await server.stop();
		}
	});

	it("passes a valid token", async () => {
		const server = await bootServer();
		try {
			const token = signApiToken("pw", NOW);
			const res = await fetch(`${server.url}/api/probe`, {
				headers: { authorization: `Bearer ${token}` },
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ ok: true });
		} finally {
			await server.stop();
		}
	});
});
```

Note: the `bootServer` readiness loop polls `/api/probe` until it answers 401 (server up + gate wired); the 2s deadline fails loudly if the server never becomes ready. This also exercises the "missing token" path implicitly in every test's setup.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/web-api-gate.test.ts`
Expected: FAIL — module `../src/web/api/shared.js` cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

Create `src/web/api/shared.ts`:

```ts
import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { verifyApiToken } from "../auth.js";

export function bearerToken(
	authorization: string | null | undefined,
): string | null {
	if (typeof authorization !== "string") return null;
	const match = /^Bearer\s+(.+)$/.exec(authorization.trim());
	return match ? match[1] : null;
}

export function apiError(
	status: number,
	message: string,
): HttpServerResponse.HttpServerResponse {
	return HttpServerResponse.unsafeJson({ error: message }, { status });
}

export function requireApiToken<R>(
	password: string,
	handler: Effect.Effect<HttpServerResponse.HttpServerResponse, never, R>,
): Effect.Effect<
	HttpServerResponse.HttpServerResponse,
	never,
	R | HttpServerRequest.HttpServerRequest
> {
	return Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const token = bearerToken(request.headers.get("authorization"));
		if (token === null || !verifyApiToken(token, password)) {
			return apiError(401, "unauthorized");
		}
		return yield* handler;
	});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/web-api-gate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Check + commit**

```bash
npm run check && npm run typecheck && npx vitest run
git add src/web/api/shared.ts test/web-api-gate.test.ts
git commit -m "feat(web): bearer token gate for API routes"
```

---

### Task 3: `POST /api/login` endpoint

**Files:**
- Create: `src/web/api/auth.ts`
- Modify: `src/web/server.ts` (wire the route)
- Modify: `src/web/routes/shared.ts` (`isPublicPath` — exempt `/api/*` from the cookie middleware)
- Test: `test/web-api-login.test.ts`

**Interfaces:**
- Consumes: `passwordMatches` + `signApiToken` from `src/web/auth.js`; `apiError` from `./shared.js` (Task 2).
- Produces: `export function apiLogin(password: string): Effect.Effect<HttpServerResponse.HttpServerResponse, never, HttpServerRequest.HttpServerRequest>`

Behavior:
- `POST /api/login` with JSON body `{ "password": "..." }`:
  - malformed body → 400 `{ "error": "invalid body" }`
  - wrong password → 401 `{ "error": "unauthorized" }`
  - correct → 200 `{ "token": "<signed token>" }`

**Why `isPublicPath` changes:** the whole server is wrapped in the cookie middleware `requireAuth(password)` which redirects every non-public path to `/login` (HTML 302). `/api/*` paths must bypass it — the API routes authenticate themselves via `requireApiToken` (Task 2). `/api/login` stays unwrapped.

- [ ] **Step 1: Write the failing test**

Create `test/web-api-login.test.ts` (reuse the `freePort`/boot pattern from Task 2's test; build the router with both `/api/login` and a protected probe so the test asserts the full login→token→probe flow):

```ts
import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect, Fiber } from "effect";
import { describe, expect, it } from "vitest";
import { createWebServerProgram } from "../src/web/lifecycle.js";
import { apiLogin } from "../src/web/api/auth.js";
import { requireApiToken } from "../src/web/api/shared.js";

// freePort() — copy from test/web-api-gate.test.ts

async function bootServer(): Promise<{ url: string; stop: () => Promise<void> }> {
	const port = await freePort();
	const probe = Effect.succeed(HttpServerResponse.unsafeJson({ ok: true }));
	const router = HttpRouter.empty.pipe(
		HttpRouter.post("/api/login", apiLogin("pw")),
		HttpRouter.get("/api/probe", requireApiToken("pw", probe)),
	);
	const fiber = Effect.runFork(createWebServerProgram(router, port));
	const url = `http://127.0.0.1:${port}`;
	// wait until the probe route answers (401 without token == server is up)
	const deadline = Date.now() + 2_000;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${url}/api/probe`);
			if (res.status === 401) break;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	}
	return { url, stop: () => Effect.runPromise(Fiber.interrupt(fiber)) };
}

describe("POST /api/login", () => {
	it("returns a token that unlocks protected routes", async () => {
		const server = await bootServer();
		try {
			const login = await fetch(`${server.url}/api/login`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ password: "pw" }),
			});
			expect(login.status).toBe(200);
			const { token } = (await login.json()) as { token: string };
			expect(typeof token).toBe("string");
			expect(token.length).toBeGreaterThan(20);

			const probe = await fetch(`${server.url}/api/probe`, {
				headers: { authorization: `Bearer ${token}` },
			});
			expect(probe.status).toBe(200);
		} finally {
			await server.stop();
		}
	});

	it("rejects wrong password with 401", async () => {
		const server = await bootServer();
		try {
			const res = await fetch(`${server.url}/api/login`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ password: "nope" }),
			});
			expect(res.status).toBe(401);
			expect(await res.json()).toEqual({ error: "unauthorized" });
		} finally {
			await server.stop();
		}
	});

	it("rejects malformed body with 400", async () => {
		const server = await bootServer();
		try {
			const res = await fetch(`${server.url}/api/login`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "not-json",
			});
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "invalid body" });
		} finally {
			await server.stop();
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/web-api-login.test.ts`
Expected: FAIL — module `../src/web/api/auth.js` cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

Create `src/web/api/auth.ts`:

```ts
import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Schema } from "effect";
import { passwordMatches, signApiToken } from "../auth.js";
import { apiError } from "./shared.js";

const LoginBody = Schema.Struct({ password: Schema.String });

export function apiLogin(
	password: string,
): Effect.Effect<
	HttpServerResponse.HttpServerResponse,
	never,
	HttpServerRequest.HttpServerRequest
> {
	return Effect.gen(function* () {
		const body = yield* HttpServerRequest.schemaBodyJson(LoginBody).pipe(
			Effect.either,
		);
		if (Effect.isFailure(body)) {
			return apiError(400, "invalid body");
		}
		if (!passwordMatches(body.right.password, password)) {
			return apiError(401, "unauthorized");
		}
		return HttpServerResponse.unsafeJson({
			token: signApiToken(password),
		});
	});
}
```

- [ ] **Step 4: Wire routes**

In `src/web/server.ts`:

1. Add imports:
```ts
import { apiLogin } from "./api/auth.js";
```
2. In `buildRouter`, add to the `HttpRouter.empty.pipe(...)` chain:
```ts
HttpRouter.post("/api/login", apiLogin(password)),
```
3. In `src/web/routes/shared.ts`, extend `isPublicPath` so the cookie middleware lets `/api/*` through:
```ts
export function isPublicPath(path: string): boolean {
	return (
		path === "/login" ||
		path === "/logout" ||
		path === "/health" ||
		path === "/images/logo.png" ||
		path.startsWith("/api/")
	);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/web-api-login.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Check + commit**

```bash
npm run check && npm run typecheck && npx vitest run
git add src/web/api/auth.ts src/web/server.ts src/web/routes/shared.ts test/web-api-login.test.ts
git commit -m "feat(web): POST /api/login issues bearer token"
```

---

### Task 4: `GET /api/portfolio` and `GET /api/positions`

**Files:**
- Create: `src/web/api/portfolio.ts`
- Modify: `src/web/server.ts` (wire both routes)
- Test: `test/web-api-portfolio.test.ts`

**Interfaces:**
- Consumes: `apiError` from `./shared.js` (Task 2); `AppConfig`, `MeteoraApi`, `Dlmm` services; `OpenPool`/`PortfolioTotal` types from `../../domain/portfolio.js`; `errorMessage` from `../../errors.js`.
- Produces:
  - `export interface PortfolioSummary { readonly openBalanceUsd: number; readonly openFeesUsd: number; readonly openPositionCount: number; readonly outOfRangePositions: number; readonly outOfRangePools: number; readonly unrealizedUsd: number; readonly unrealizedSol: number }`
  - `export function computePortfolioSummary(open: readonly OpenPool[]): PortfolioSummary` (pure — tested)
  - `export interface PortfolioApiData { readonly total: PortfolioTotal; readonly summary: PortfolioSummary; readonly pools: readonly OpenPool[] }`
  - `export const portfolioData: Effect.Effect<PortfolioApiData, never, AppConfig | MeteoraApi | Dlmm>`
  - `export const portfolioApi: Effect.Effect<HttpServerResponse.HttpServerResponse, never, AppConfig | MeteoraApi | Dlmm>`
  - `export const positionsApi: Effect.Effect<HttpServerResponse.HttpServerResponse, never, AppConfig | MeteoraApi | Dlmm>`

Response shapes:
- `GET /api/portfolio` → `200 { "total": PortfolioTotal, "summary": PortfolioSummary }`; on service failure → `500 { "error": "<message>" }`
- `GET /api/positions` → `200 { "pools": OpenPool[] }`; same 500 error shape

`portfolioData` mirrors the data flow of `src/web/pages/portfolio.ts` `portfolioContent` (`openPortfolio(1,10)` → `enrichOpenPortfolioPnl(withRanges: true)` → `dlmm.attachLivePositions`, plus `totalPnl`), but does **not** record a portfolio-history snapshot (the HTML page owns that; the API must not double-record).

- [ ] **Step 1: Write the failing test**

Create `test/web-api-portfolio.test.ts` — unit test of the pure summary computation with an inline `OpenPool` fixture (no live calls):

```ts
import { describe, expect, it } from "vitest";
import type { OpenPool } from "../src/domain/portfolio.js";
import { computePortfolioSummary } from "../src/web/api/portfolio.js";

function openPool(overrides: Partial<OpenPool>): OpenPool {
	return {
		poolAddress: "pool",
		binStep: 20,
		baseFee: 0.1,
		tokenX: "TOKENX",
		tokenY: "TOKENY",
		tokenXMint: "x",
		tokenYMint: "y",
		balances: "0",
		unclaimedFees: "0",
		feePerTvl24h: "0",
		pnl: "0",
		pnlPctChange: "0",
		pnlSol: "0",
		pnlSolPctChange: "0",
		totalDeposit: "0",
		openPositionCount: 1,
		listPositions: [],
		positionsOutOfRange: [],
		outOfRange: false,
		poolPrice: 1,
		...overrides,
	};
}

describe("computePortfolioSummary", () => {
	it("aggregates balances, fees and unrealized pnl across pools", () => {
		const open = [
			openPool({
				balances: "10.5",
				unclaimedFees: "2",
				openPositionCount: 3,
				pnl: "1.25",
				pnlSol: "0.02",
			}),
			openPool({
				balances: "4.5",
				unclaimedFees: "0.5",
				openPositionCount: 1,
				pnl: "-0.75",
				pnlSol: "0.01",
			}),
		];
		expect(computePortfolioSummary(open)).toEqual({
			openBalanceUsd: 15,
			openFeesUsd: 2.5,
			openPositionCount: 4,
			outOfRangePositions: 0,
			outOfRangePools: 0,
			unrealizedUsd: 0.5,
			unrealizedSol: 0.03,
		});
	});

	it("counts out-of-range positions and pools", () => {
		const open = [
			openPool({
				positionsOutOfRange: ["a", "b"],
				openPositionCount: 3,
			}),
			openPool({ outOfRange: true, openPositionCount: 1 }),
		];
		expect(computePortfolioSummary(open)).toMatchObject({
			outOfRangePositions: 2,
			outOfRangePools: 2,
			openPositionCount: 4,
		});
	});

	it("tolerates NaN pnl strings", () => {
		const open = [openPool({ pnl: "not-a-number", pnlSol: null })];
		expect(computePortfolioSummary(open)).toMatchObject({
			unrealizedUsd: 0,
			unrealizedSol: 0,
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/web-api-portfolio.test.ts`
Expected: FAIL — module `../src/web/api/portfolio.js` cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

Create `src/web/api/portfolio.ts`:

```ts
import { HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import type { OpenPool, PortfolioTotal } from "../../domain/portfolio.js";
import { errorMessage } from "../../errors.js";
import { AppConfig } from "../../services/Config.js";
import { Dlmm } from "../../services/Dlmm.js";
import { MeteoraApi } from "../../services/MeteoraApi.js";
import { apiError } from "./shared.js";

export interface PortfolioSummary {
	readonly openBalanceUsd: number;
	readonly openFeesUsd: number;
	readonly openPositionCount: number;
	readonly outOfRangePositions: number;
	readonly outOfRangePools: number;
	readonly unrealizedUsd: number;
	readonly unrealizedSol: number;
}

export function computePortfolioSummary(
	open: readonly OpenPool[],
): PortfolioSummary {
	const openBalanceUsd = open.reduce(
		(sum, pool) => sum + (parseFloat(pool.balances) || 0),
		0,
	);
	const openFeesUsd = open.reduce(
		(sum, pool) => sum + (parseFloat(pool.unclaimedFees) || 0),
		0,
	);
	const openPositionCount = open.reduce(
		(sum, pool) => sum + pool.openPositionCount,
		0,
	);
	const outOfRangePositions = open.reduce(
		(sum, pool) => sum + pool.positionsOutOfRange.length,
		0,
	);
	const outOfRangePools = open.filter(
		(pool) => pool.outOfRange === true || pool.positionsOutOfRange.length > 0,
	).length;
	const unrealizedUsd = open.reduce((sum, pool) => {
		const n = parseFloat(pool.pnl);
		return Number.isNaN(n) ? sum : sum + n;
	}, 0);
	const unrealizedSol = open.reduce((sum, pool) => {
		if (pool.pnlSol == null) return sum;
		const n = parseFloat(pool.pnlSol);
		return Number.isNaN(n) ? sum : sum + n;
	}, 0);
	return {
		openBalanceUsd,
		openFeesUsd,
		openPositionCount,
		outOfRangePositions,
		outOfRangePools,
		unrealizedUsd,
		unrealizedSol,
	};
}

export interface PortfolioApiData {
	readonly total: PortfolioTotal;
	readonly summary: PortfolioSummary;
	readonly pools: readonly OpenPool[];
}

export const portfolioData: Effect.Effect<
	PortfolioApiData,
	never,
	AppConfig | MeteoraApi | Dlmm
> = Effect.gen(function* () {
	const config = yield* AppConfig;
	const wallet = yield* config.wallet();
	const api = yield* MeteoraApi;
	const dlmm = yield* Dlmm;

	const open = yield* api.openPortfolio(wallet, 1, 10).pipe(
		Effect.flatMap((response) =>
			api.enrichOpenPortfolioPnl(response.pools, wallet, {
				withRanges: true,
			}),
		),
		Effect.flatMap((enriched) => dlmm.attachLivePositions(enriched, wallet)),
	);

	const total = yield* api.totalPnl(wallet);

	return {
		total,
		summary: computePortfolioSummary(open),
		pools: open,
	};
});

export const portfolioApi: Effect.Effect<
	HttpServerResponse.HttpServerResponse,
	never,
	AppConfig | MeteoraApi | Dlmm
> = Effect.map(portfolioData, (data) =>
	HttpServerResponse.unsafeJson({
		total: data.total,
		summary: data.summary,
	}),
).pipe(Effect.catchAll((error) => Effect.succeed(apiError(500, errorMessage(error)))));

export const positionsApi: Effect.Effect<
	HttpServerResponse.HttpServerResponse,
	never,
	AppConfig | MeteoraApi | Dlmm
> = Effect.map(portfolioData, (data) =>
	HttpServerResponse.unsafeJson({ pools: data.pools }),
).pipe(Effect.catchAll((error) => Effect.succeed(apiError(500, errorMessage(error)))));
```

Note on typing: `Effect.map` + `catchAll` is the lazy composition; if the compiler complains about the `.pipe(catchAll)` on a non-effect response, wrap the `unsafeJson` call in `Effect.succeed(...)` inside the map (the API returns the same shape either way).

- [ ] **Step 4: Wire routes**

In `src/web/server.ts`:

1. Add imports:
```ts
import { portfolioApi, positionsApi } from "./api/portfolio.js";
import { requireApiToken } from "./api/shared.js";
```
2. In `buildRouter`, inside the `HttpRouter.empty.pipe(...)` chain, after the login route:
```ts
HttpRouter.get(
	"/api/portfolio",
	requireApiToken(password, portfolioApi),
),
HttpRouter.get(
	"/api/positions",
	requireApiToken(password, positionsApi),
),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/web-api-portfolio.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Manual smoke test (local, against your own config)**

Start the server in one terminal (`npm run web`), then in another:

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8080/api/login -H "content-type: application/json" -d '{"password":"<your-web-password>"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/api/portfolio            # expect 401
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8080/api/portfolio | head -c 400   # expect JSON with total+summary
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8080/api/positions | head -c 400   # expect JSON with pools
```

Use the port from your `vexis.config.json` `web.port` (default 8080) and the configured `web.password`.

- [ ] **Step 7: Check + commit**

```bash
npm run check && npm run typecheck && npx vitest run
git add src/web/api/portfolio.ts src/web/server.ts test/web-api-portfolio.test.ts
git commit -m "feat(web): /api/portfolio and /api/positions endpoints"
```

---

### Task 5: `GET /api/pools`

**Files:**
- Create: `src/web/api/pools.ts`
- Modify: `src/web/server.ts` (wire the route)
- Test: `test/web-api-pools.test.ts`

**Interfaces:**
- Consumes: `apiError` from `./shared.js` (Task 2); `parseTimeframe` from `../../lib/screening.js`; `Screening`, `AppConfig` services; `errorMessage` from `../../errors.js`.
- Produces:
  - `export interface PoolsQuery { readonly timeframe: string | null; readonly limit: string | null }`
  - `export function parsePoolsQuery(params: URLSearchParams): PoolsQuery`
  - `export type ValidatedPoolsQuery = { readonly timeframe: string | null; readonly displayLimit: number | undefined } | { readonly error: string }`
  - `export function validatePoolsQuery(query: PoolsQuery): ValidatedPoolsQuery`
  - `export const poolsApi: Effect.Effect<HttpServerResponse.HttpServerResponse, never, AppConfig | Screening | HttpServerRequest.HttpServerRequest>`

Validation rules:
- `timeframe`: if provided and `parseTimeframe` returns `null` → `{ error: "invalid timeframe" }`. If absent → `null` (handler applies config default `current.pools?.timeframe ?? "30m"`).
- `limit`: if provided, must be a positive safe integer → else `{ error: "invalid limit" }`. Absent → `undefined`.
- Both valid → `{ timeframe, displayLimit }`.

Response: `200 { "timeframe": string, "total": number, "filtered": number, "pools": ScreenedPool[] }`; validation failure → `400 { "error": "<message>" }`; service failure → `500 { "error": "<message>" }`.

- [ ] **Step 1: Write the failing test**

Create `test/web-api-pools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	parsePoolsQuery,
	validatePoolsQuery,
} from "../src/web/api/pools.js";

describe("parsePoolsQuery", () => {
	it("reads timeframe and limit from query params", () => {
		expect(
			parsePoolsQuery(new URLSearchParams("timeframe=30m&limit=20")),
		).toEqual({ timeframe: "30m", limit: "20" });
	});

	it("returns nulls when params are absent", () => {
		expect(parsePoolsQuery(new URLSearchParams(""))).toEqual({
			timeframe: null,
			limit: null,
		});
	});
});

describe("validatePoolsQuery", () => {
	it("accepts valid timeframe and limit", () => {
		expect(validatePoolsQuery({ timeframe: "30m", limit: "20" })).toEqual({
			timeframe: "30m",
			displayLimit: 20,
		});
	});

	it("accepts missing params (config defaults apply later)", () => {
		expect(validatePoolsQuery({ timeframe: null, limit: null })).toEqual({
			timeframe: null,
			displayLimit: undefined,
		});
	});

	it("rejects unknown timeframe", () => {
		expect(validatePoolsQuery({ timeframe: "99h", limit: null })).toEqual({
			error: "invalid timeframe",
		});
	});

	it("rejects non-numeric or non-positive limit", () => {
		expect(validatePoolsQuery({ timeframe: null, limit: "abc" })).toEqual({
			error: "invalid limit",
		});
		expect(validatePoolsQuery({ timeframe: null, limit: "0" })).toEqual({
			error: "invalid limit",
		});
		expect(validatePoolsQuery({ timeframe: null, limit: "-5" })).toEqual({
			error: "invalid limit",
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/web-api-pools.test.ts`
Expected: FAIL — module `../src/web/api/pools.js` cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

Create `src/web/api/pools.ts`:

```ts
import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { errorMessage } from "../../errors.js";
import { parseTimeframe } from "../../lib/screening.js";
import { AppConfig } from "../../services/Config.js";
import { Screening } from "../../services/Screening.js";
import { apiError } from "./shared.js";

export interface PoolsQuery {
	readonly timeframe: string | null;
	readonly limit: string | null;
}

export function parsePoolsQuery(params: URLSearchParams): PoolsQuery {
	return {
		timeframe: params.get("timeframe"),
		limit: params.get("limit"),
	};
}

export type ValidatedPoolsQuery =
	| { readonly timeframe: string | null; readonly displayLimit: number | undefined }
	| { readonly error: string };

export function validatePoolsQuery(query: PoolsQuery): ValidatedPoolsQuery {
	const timeframe =
		query.timeframe !== null ? parseTimeframe(query.timeframe) : null;
	if (query.timeframe !== null && timeframe === null) {
		return { error: "invalid timeframe" };
	}
	if (query.limit !== null) {
		const n = Number(query.limit);
		if (!Number.isSafeInteger(n) || n <= 0) {
			return { error: "invalid limit" };
		}
		return { timeframe, displayLimit: n };
	}
	return { timeframe, displayLimit: undefined };
}

export const poolsApi: Effect.Effect<
	HttpServerResponse.HttpServerResponse,
	never,
	AppConfig | Screening | HttpServerRequest.HttpServerRequest
> = Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;
	const url = new URL(request.url, "http://localhost");
	const validated = validatePoolsQuery(parsePoolsQuery(url.searchParams));
	if ("error" in validated) {
		return apiError(400, validated.error);
	}

	const config = yield* AppConfig;
	const current = yield* config.get;
	const timeframe =
		validated.timeframe ?? current.pools?.timeframe ?? "30m";
	const screening = yield* Screening;
	const result = yield* screening.screen({
		timeframe,
		displayLimit: validated.displayLimit,
	});

	return HttpServerResponse.unsafeJson({
		timeframe,
		total: result.total,
		filtered: result.filtered,
		pools: result.pools,
	});
}).pipe(Effect.catchAll((error) => Effect.succeed(apiError(500, errorMessage(error)))));
```

- [ ] **Step 4: Wire route**

In `src/web/server.ts`:

1. Add import:
```ts
import { poolsApi } from "./api/pools.js";
```
2. In `buildRouter`, after the positions route:
```ts
HttpRouter.get("/api/pools", requireApiToken(password, poolsApi)),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/web-api-pools.test.ts`
Expected: PASS (2 describe blocks, 6 `it`s)

- [ ] **Step 6: Manual smoke test**

With the server running (as in Task 4 Step 6):

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8080/api/pools?timeframe=30m&limit=5" | head -c 400   # expect JSON with pools
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8080/api/pools?timeframe=99h"   # expect 400
```
- [ ] **Step 7: Check + commit**

```bash
npm run check && npm run typecheck && npx vitest run
git add src/web/api/pools.ts src/web/server.ts test/web-api-pools.test.ts
git commit -m "feat(web): /api/pools endpoint with query validation"
```

---

### Task 6: README + final verification

**Files:**
- Modify: `README.md` (Web UI section — add a short "JSON API" subsection)

**Interfaces:**
- Consumes: nothing new; documents the endpoints from Tasks 3-5.

- [ ] **Step 1: Read the Web UI section of the README**

Read `README.md`, find the "Web UI" section.

- [ ] **Step 2: Add the JSON API subsection**

Append to the Web UI section (matching the README's existing style, English):

```markdown
#### JSON API (mobile app)

The same server exposes a token-authenticated JSON API under `/api/`:

- `POST /api/login` — body `{"password": "..."}` → `{"token": "..."}` (30-day HMAC-signed token)
- `GET /api/portfolio` — `{"total": ..., "summary": ...}`
- `GET /api/positions` — `{"pools": [...]}`
- `GET /api/pools?timeframe=&limit=` — `{"timeframe": ..., "total": ..., "filtered": ..., "pools": [...]}`

All endpoints except `/api/login` require `Authorization: Bearer <token>`. Errors return JSON `{"error": "..."}` with a 4xx/5xx status.
```

- [ ] **Step 3: Full verification**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green, including the 7 existing web test files and the 4 new ones.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: JSON API endpoints for mobile app"
```

---

## Self-review notes

- **Spec coverage:** Phase 1 items all present — token auth (Tasks 1-3), `/api/portfolio` + `/api/positions` (Task 4), `/api/pools` (Task 5), error format `{"error": ...}` (Tasks 2-5), tests (each task). Phase 2+ (Expo app, remaining endpoints, actions, push) is out of scope for this plan by design; those get their own plans.
- **Placeholder scan:** no TBDs; every code step contains full code.
- **Type consistency:** `signApiToken`/`verifyApiToken` (Task 1) are consumed with matching signatures in Tasks 2-3; `apiError(status, message)` shape is identical everywhere; `requireApiToken(password, handler)` signature matches all four wiring sites; `ValidatedPoolsQuery` narrowing via `"error" in validated` is used consistently in Task 5.
- **Deliberate simplification:** `/api/portfolio` returns the summary + closed positions come later (Phase 3 plan adds `/api/closed-positions`); the API does not record portfolio-history snapshots (page owns that); no CORS headers (native app fetch, not a browser). `verifyApiToken` delegates to `verifySessionCookie` — same token format, one verification path.
