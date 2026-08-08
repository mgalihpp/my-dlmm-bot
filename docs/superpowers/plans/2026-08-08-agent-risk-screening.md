# Agent Risk Screening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add layered risk screening to the DLMM agent — hard-block severe risks (rugpull/wash/bundler/bot-holders/ATH) before opening, weight soft risks in the heuristic, and learn signal weights from actual PnL (Darwinian).

**Architecture:** Two new Effect service layers (`Okx`, `Jupiter`) enrich `ScreenedPool` during screening. A `checkRisks` guardrail hard-blocks in `engine.ts`. `heuristicScore` gains safety metrics modulated by adaptive weights from `signalWeights.ts`, which learn from a perf log persisted in `.vexis-agent-signals.json`.

**Tech Stack:** TypeScript strict, Effect (Schema, Layer, HttpClient), vitest, ESM with `.js` import extensions.

## Global Constraints

- ESM-only; every relative import ends in `.js`.
- Biome: tab indent, double quotes, organize imports. Run `npm run check` before tests.
- Verify order: `npm run check && npm run typecheck && npm test`.
- Tagged errors in `src/errors.ts` (`Data.TaggedError`), never thrown.
- API responses decoded with `Effect.Schema` at runtime (not trusted).
- Effect layers follow the `RugCheck.ts` / `MeteoraApi.ts` pattern (Context.Tag + Layer.effect + HttpClient).
- Tests: `test/**/*.test.ts`, pure logic only, inline fixtures, mocked `HttpClient`.

---

### Task 1: Config + domain types (risk & darwin sections)

**Files:**
- Modify: `src/domain/config.ts` (AgentConfig, add two interfaces)
- Modify: `src/services/Config.ts:93-134` (ResolvedAgentConfig + resolveAgentConfigFrom)
- Modify: `src/domain/screened.ts` (ScreenedPool new nullable fields)
- Test: `test/agent-config.test.ts`, `test/agent-guardrails.test.ts` (cfg fixture), `test/agent-format.test.ts` (cfg fixture)

**Interfaces:**
- Produces:
  - `AgentRiskConfig`, `AgentDarwinConfig` (optional, in `src/domain/config.ts`)
  - `ResolvedAgentRisks`, `ResolvedAgentDarwin`, plus `risks`/`darwin` on `ResolvedAgentConfig` (in `src/services/Config.ts`)
  - `ScreenedPool` gains: `bundlePct?`, `top10Pct?`, `botHoldersPct?`, `globalFeesSol?`, `isRugpull?`, `isWash?`, `devSoldAll?`, `dexScreenerPaid?`, `priceVsAthPct?` — all `number | null` (booleans: `boolean | null`), all optional.

- [ ] **Step 1: Write failing tests**

`test/agent-config.test.ts` — add a describe block:

```ts
describe("resolveAgentConfigFrom risk/darwin defaults", () => {
	it("fills risks and darwin defaults", () => {
		const c = resolveAgentConfigFrom({}, {});
		expect(c.risks.enabled).toBe(true);
		expect(c.risks.minTokenFeesSol).toBe(30);
		expect(c.risks.maxBundlePct).toBe(30);
		expect(c.risks.maxBotHoldersPct).toBe(30);
		expect(c.risks.maxTop10Pct).toBe(60);
		expect(c.risks.maxPriceVsAthPct).toBe(80);
		expect(c.risks.blockWash).toBe(true);
		expect(c.risks.blockRugpull).toBe(true);
		expect(c.risks.blockDexScreenerPaid).toBe(true);
		expect(c.risks.blockDevSoldAll).toBe(true);
		expect(c.darwin.enabled).toBe(true);
		expect(c.darwin.windowDays).toBe(60);
		expect(c.darwin.recalcEvery).toBe(5);
		expect(c.darwin.boostFactor).toBe(1.05);
		expect(c.darwin.decayFactor).toBe(0.95);
		expect(c.darwin.weightFloor).toBe(0.3);
		expect(c.darwin.weightCeiling).toBe(2.5);
		expect(c.darwin.minSamples).toBe(10);
	});
	it("honors overrides", () => {
		const c = resolveAgentConfigFrom(
			{
				agent: {
					risks: { maxBundlePct: 15, blockWash: false },
					darwin: { boostFactor: 1.1, enabled: false },
				},
			},
			{},
		);
		expect(c.risks.maxBundlePct).toBe(15);
		expect(c.risks.blockWash).toBe(false);
		expect(c.darwin.boostFactor).toBe(1.1);
		expect(c.darwin.enabled).toBe(false);
	});
});
```

Fix the two existing `ResolvedAgentConfig` literals that now need `risks` + `darwin`:
- `test/agent-format.test.ts:10` cfg object → add:
  ```ts
  risks: { enabled: true, minTokenFeesSol: 30, maxBundlePct: 30, maxBotHoldersPct: 30, maxTop10Pct: 60, maxPriceVsAthPct: 80, blockWash: true, blockRugpull: true, blockDexScreenerPaid: true, blockDevSoldAll: true },
  darwin: { enabled: true, windowDays: 60, recalcEvery: 5, boostFactor: 1.05, decayFactor: 0.95, weightFloor: 0.3, weightCeiling: 2.5, minSamples: 10 },
  ```
- `test/agent-guardrails.test.ts:8` same addition.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: typecheck/tests fail — `ResolvedAgentConfig` has no `risks`/`darwin`.

- [ ] **Step 3: Implement types**

`src/domain/config.ts` — append after `AgentLlmConfig`:

```ts
export interface AgentRiskConfig {
	enabled?: boolean;
	minTokenFeesSol?: number;
	maxBundlePct?: number;
	maxBotHoldersPct?: number;
	maxTop10Pct?: number;
	maxPriceVsAthPct?: number;
	blockWash?: boolean;
	blockRugpull?: boolean;
	blockDexScreenerPaid?: boolean;
	blockDevSoldAll?: boolean;
}

export interface AgentDarwinConfig {
	enabled?: boolean;
	windowDays?: number;
	recalcEvery?: number;
	boostFactor?: number;
	decayFactor?: number;
	weightFloor?: number;
	weightCeiling?: number;
	minSamples?: number;
}
```

`src/domain/config.ts` AgentConfig — add:
```ts
	risks?: AgentRiskConfig;
	darwin?: AgentDarwinConfig;
```

`src/domain/screened.ts` — append to `ScreenedPool`:
```ts
	bundlePct?: number | null;
	top10Pct?: number | null;
	botHoldersPct?: number | null;
	globalFeesSol?: number | null;
	isRugpull?: boolean | null;
	isWash?: boolean | null;
	devSoldAll?: boolean | null;
	dexScreenerPaid?: boolean | null;
	priceVsAthPct?: number | null;
```

`src/services/Config.ts` — after `ResolvedAgentLlm`, add:

```ts
export interface ResolvedAgentRisks {
	enabled: boolean;
	minTokenFeesSol: number;
	maxBundlePct: number;
	maxBotHoldersPct: number;
	maxTop10Pct: number;
	maxPriceVsAthPct: number;
	blockWash: boolean;
	blockRugpull: boolean;
	blockDexScreenerPaid: boolean;
	blockDevSoldAll: boolean;
}

export interface ResolvedAgentDarwin {
	enabled: boolean;
	windowDays: number;
	recalcEvery: number;
	boostFactor: number;
	decayFactor: number;
	weightFloor: number;
	weightCeiling: number;
	minSamples: number;
}
```

Add to `ResolvedAgentConfig`:
```ts
	risks: ResolvedAgentRisks;
	darwin: ResolvedAgentDarwin;
```

In `resolveAgentConfigFrom`, after `const a = c.agent ?? {};` add `const r = a.risks ?? {}; const d = a.darwin ?? {};` and append to the returned object:

```ts
		risks: {
			enabled: r.enabled ?? true,
			minTokenFeesSol: r.minTokenFeesSol ?? 30,
			maxBundlePct: r.maxBundlePct ?? 30,
			maxBotHoldersPct: r.maxBotHoldersPct ?? 30,
			maxTop10Pct: r.maxTop10Pct ?? 60,
			maxPriceVsAthPct: r.maxPriceVsAthPct ?? 80,
			blockWash: r.blockWash ?? true,
			blockRugpull: r.blockRugpull ?? true,
			blockDexScreenerPaid: r.blockDexScreenerPaid ?? true,
			blockDevSoldAll: r.blockDevSoldAll ?? true,
		},
		darwin: {
			enabled: d.enabled ?? true,
			windowDays: d.windowDays ?? 60,
			recalcEvery: d.recalcEvery ?? 5,
			boostFactor: d.boostFactor ?? 1.05,
			decayFactor: d.decayFactor ?? 0.95,
			weightFloor: d.weightFloor ?? 0.3,
			weightCeiling: d.weightCeiling ?? 2.5,
			minSamples: d.minSamples ?? 10,
		},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run check && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/config.ts src/domain/screened.ts src/services/Config.ts test/agent-config.test.ts test/agent-guardrails.test.ts test/agent-format.test.ts
git commit -m "feat(agent): risk + darwin config types and defaults"
```

---

### Task 2: Okx service

**Files:**
- Modify: `src/errors.ts` (add `OkxApiError`)
- Create: `src/services/Okx.ts`
- Test: `test/okx.test.ts`

**Interfaces:**
- Produces (used by Task 4):
  ```ts
  export interface OkxAdvancedInfo {
  	bundlePct: number | null;
  	top10Pct: number | null;
  	devSoldAll: boolean;
  	dexScreenerPaid: boolean;
  	creator: string | null;
  }
  export interface OkxRiskFlags { isRugpull: boolean; isWash: boolean; }
  export interface OkxPriceInfo { priceVsAthPct: number | null; }
  export interface OkxService {
  	readonly advancedInfo: (mint: string) => Effect.Effect<OkxAdvancedInfo | null, OkxApiError | DecodeError>;
  	readonly riskFlags: (mint: string) => Effect.Effect<OkxRiskFlags | null, OkxApiError | DecodeError>;
  	readonly priceInfo: (mint: string) => Effect.Effect<OkxPriceInfo | null, OkxApiError | DecodeError>;
  }
  export class Okx extends Context.Tag("Okx")<Okx, OkxService>() {}
  export const OkxLive: Layer.Layer<Okx>;
  ```
  `OkxApiError` shape: `{ path: string; status?: number; message: string }`.
  Base URL `https://web3.okx.com`, header `Ok-Access-Client-type: agent-cli`, chain index `501`.

- [ ] **Step 1: Add the error type**

`src/errors.ts` — append after `RugCheckApiError`:

```ts
export class OkxApiError extends Data.TaggedError("OkxApiError")<{
	readonly path: string;
	readonly status?: number;
	readonly message: string;
}> {}
```

Add `| OkxApiError` to the `AppError` union.

- [ ] **Step 2: Write failing tests**

`test/okx.test.ts` (mock `HttpClient` dispatching on URL, copied pattern from `test/meteora-api.test.ts`):

```ts
import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { Okx, OkxLive } from "../src/services/Okx.js";

const jsonResponse = (url: string, body: unknown, status = 200) =>
	HttpClientResponse.fromWeb(
		HttpClientRequest.get(url),
		new Response(JSON.stringify(body), { status }),
	);

const mockClient = (
	handler: (url: string, init: RequestInit | undefined) => { body: unknown; status?: number },
) =>
	Layer.succeed(
		HttpClient.HttpClient,
		HttpClient.make((req, init) => {
			const { body, status } = handler(req.url, init);
			return Effect.succeed(jsonResponse(req.url, body, status ?? 200));
		}),
	);

const layerWith = (
	handler: (url: string, init: RequestInit | undefined) => { body: unknown; status?: number },
) =>
	OkxLive.pipe(
		Layer.provide(
			mockClient((url, init) => {
				const { body, status } = handler(url, init);
				return { body, status };
			}),
		),
	);

describe("Okx", () => {
	const run = <A>(
		effect: Effect.Effect<A, never>,
		handler: (url: string, init: RequestInit | undefined) => { body: unknown; status?: number },
	) =>
		Effect.runPromise(effect.pipe(Effect.provide(layerWith(handler))));

	it("decodes advanced-info", async () => {
		const advanced = await run(
			Effect.gen(function* () {
				const okx = yield* Okx;
				return yield* okx.advancedInfo("Mint111");
			}),
			(url) =>
				url.includes("advanced-info")
					? {
							body: {
								code: "0",
								data: [
									{
										bundleHoldingPercent: "42.5",
										top10HoldPercent: "70",
										tokenTags: ["dexScreenerPaid", "devHoldingStatusSellAll"],
										creatorAddress: "Dev111",
									},
								],
							},
						}
					: { body: { code: "0", data: null } },
		);
		expect(advanced).toEqual({
			bundlePct: 42.5,
			top10Pct: 70,
			devSoldAll: true,
			dexScreenerPaid: true,
			creator: "Dev111",
		});
	});

	it("decodes risk check flags", async () => {
		const risk = await run(
			Effect.gen(function* () {
				const okx = yield* Okx;
				return yield* okx.riskFlags("Mint111");
			}),
			(url) =>
				url.includes("risk")
					? {
							body: {
								code: "0",
								data: {
									allAnalysis: [
										{ riskKey: "isLiquidityRemoval", newRiskLabel: "yes" },
										{ riskKey: "isWash", newRiskLabel: "no" },
									],
								},
							},
						}
					: { body: { code: "0", data: null } },
		);
		expect(risk).toEqual({ isRugpull: true, isWash: false });
	});

	it("decodes price-info into price vs ATH", async () => {
		const price = await run(
			Effect.gen(function* () {
				const okx = yield* Okx;
				return yield* okx.priceInfo("Mint111");
			}),
			(url) =>
				url.includes("price-info")
					? {
							body: { code: "0", data: [{ price: "80", maxPrice: "100" }] },
						}
					: { body: { code: "0", data: null } },
		);
		expect(price).toEqual({ priceVsAthPct: 80 });
	});

	it("returns null when data is empty", async () => {
		const res = await run(
			Effect.gen(function* () {
				const okx = yield* Okx;
				return yield* okx.advancedInfo("Mint111");
			}),
			() => ({ body: { code: "0", data: [] } }),
		);
		expect(res).toBeNull();
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: fails — `../src/services/Okx.js` not found.

- [ ] **Step 4: Implement the service**

`src/services/Okx.ts`:

```ts
import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import {
	Context,
	Duration,
	Effect,
	Layer,
	ParseResult,
	Schedule,
	Schema,
} from "effect";
import { DecodeError, OkxApiError } from "../errors.js";

const BASE = "https://web3.okx.com";
const CHAIN = "501";
const PUBLIC_HEADERS = { "Ok-Access-Client-type": "agent-cli" };

const pct = (v: unknown): number | null => {
	if (typeof v !== "string" || v === "") return null;
	const n = Number.parseFloat(v);
	return Number.isFinite(n) ? n : null;
};

const AdvancedItem = Schema.Struct({
	bundleHoldingPercent: Schema.optional(Schema.String),
	top10HoldPercent: Schema.optional(Schema.String),
	tokenTags: Schema.optional(Schema.Array(Schema.String)),
	creatorAddress: Schema.optional(Schema.String),
});

const RiskEntry = Schema.Struct({
	riskKey: Schema.optional(Schema.String),
	newRiskLabel: Schema.optional(Schema.String),
});
const RiskData = Schema.Struct({
	allAnalysis: Schema.optional(Schema.Array(RiskEntry)),
	swapAnalysis: Schema.optional(Schema.Array(RiskEntry)),
	contractAnalysis: Schema.optional(Schema.Array(RiskEntry)),
	extraAnalysis: Schema.optional(Schema.Array(RiskEntry)),
});

const PriceItem = Schema.Struct({
	price: Schema.optional(Schema.String),
	maxPrice: Schema.optional(Schema.String),
});

const retryPolicy = Schedule.exponential(Duration.millis(400)).pipe(
	Schedule.intersect(Schedule.recurs(2)),
);

const transient = (e: OkxApiError): boolean =>
	e.status === undefined || e.status === 429 || e.status >= 500;

const make = Effect.gen(function* () {
	const client = (yield* HttpClient.HttpClient).pipe(
		HttpClient.mapRequest(
			HttpClientRequest.setHeaders(PUBLIC_HEADERS),
		),
	);

	const request = <A extends Schema.Schema<any, any>>(
		path: string,
		body: unknown | null,
		schema: A,
		method: "GET" | "POST" = "GET",
	): Effect.Effect<unknown, OkxApiError | DecodeError> => {
		const url = `${BASE}${path}`;
		const send = method === "POST" ? HttpClientRequest.post(url) : HttpClientRequest.get(url);
		const withBody = body != null
			? send.pipe(HttpClientRequest.setBody(JSON.stringify(body), "application/json"))
			: send;
		return withBody.pipe(
			client.execute,
			Effect.mapError(
				(e) => new OkxApiError({ path, message: `Request failed: ${e.message}` }),
			),
			Effect.flatMap((res) =>
				res.status >= 200 && res.status < 300
					? Effect.succeed(res)
					: Effect.fail(
							new OkxApiError({ path, status: res.status, message: `OKX API ${res.status}` }),
						),
			),
			Effect.flatMap((res) =>
				HttpClientResponse.schemaBodyJson(Schema.Struct({ data: Schema.optional(schema) }))(res).pipe(
					Effect.map((json) => json.data),
					Effect.mapError(
						(e) =>
							new DecodeError({
								source: "okx",
								message: ParseResult.isParseError(e)
									? ParseResult.ArrayFormatter.formatErrorSync(e).map((i) => i.message).join(";")
									: String(e),
							}),
					),
				),
			),
			Effect.retry({ schedule: retryPolicy, while: transient }),
			Effect.scoped,
		);
	};

	const toArray = (v: unknown): unknown[] => {
		if (Array.isArray(v)) return v;
		if (v && typeof v === "object") return [v];
		return [];
	};

	const service: OkxService = {
		advancedInfo: (mint) =>
			request(
				`/api/v6/dex/market/token/advanced-info?chainIndex=${CHAIN}&tokenContractAddress=${mint}`,
				null,
				Schema.Array(AdvancedItem),
			).pipe(
				Effect.map((data) => {
					const d = toArray(data)[0] as
						| Schema.Schema.Type<typeof AdvancedItem>
						| undefined;
					if (!d) return null;
					const tags = d.tokenTags ?? [];
					return {
						bundlePct: pct(d.bundleHoldingPercent),
						top10Pct: pct(d.top10HoldPercent),
						devSoldAll: tags.includes("devHoldingStatusSellAll"),
						dexScreenerPaid:
							tags.includes("dexScreenerPaid") || tags.includes("dsPaid"),
						creator: d.creatorAddress ?? null,
					};
				}),
			),
		riskFlags: (mint) =>
			request(
				`/priapi/v1/dx/market/v2/risk/new/check?chainId=${CHAIN}&tokenContractAddress=${mint}&t=${Date.now()}`,
				null,
				RiskData,
			).pipe(
				Effect.map((data) => {
					const d = data as Schema.Schema.Type<typeof RiskData> | undefined;
					const entries = [
						...(d?.allAnalysis ?? []),
						...(d?.swapAnalysis ?? []),
						...(d?.contractAnalysis ?? []),
						...(d?.extraAnalysis ?? []),
					];
					const has = (key: string) =>
						entries.some(
							(e) => e.riskKey === key && e.newRiskLabel?.toLowerCase() === "yes",
						);
					return { isRugpull: has("isLiquidityRemoval"), isWash: has("isWash") };
				}),
			),
		priceInfo: (mint) =>
			request(
				"/api/v6/dex/market/price-info",
				[{ chainIndex: CHAIN, tokenContractAddress: mint }],
				Schema.Array(PriceItem),
				"POST",
			).pipe(
				Effect.map((data) => {
					const d = toArray(data)[0] as
						| Schema.Schema.Type<typeof PriceItem>
						| undefined;
					if (!d) return null;
					const price = pct(d.price);
					const maxPrice = pct(d.maxPrice);
					return {
						priceVsAthPct:
							price != null && maxPrice != null && maxPrice > 0
								? Number(((price / maxPrice) * 100).toFixed(1))
								: null,
					};
				}),
			),
	};
	return service;
});

export const OkxLive = Layer.effect(Okx, make);
```

Note: typecheck runs with `noUnusedLocals` — do not introduce unused variables in the final code.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run check && npm run typecheck && npm test`
Expected: `test/okx.test.ts` passes; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/errors.ts src/services/Okx.ts test/okx.test.ts
git commit -m "feat(services): OKX DEX risk enrichment service"
```

---

### Task 3: Jupiter service

**Files:**
- Modify: `src/errors.ts` (extend `JupiterApiError.stage`)
- Create: `src/services/Jupiter.ts`
- Test: `test/jupiter.test.ts`

**Interfaces:**
- Produces (used by Task 4):
  ```ts
  export interface JupiterTokenAudit {
  	botHoldersPct: number | null;
  	top10Pct: number | null;
  	globalFeesSol: number | null;
  }
  export interface JupiterService {
  	readonly search: (query: string) => Effect.Effect<JupiterTokenAudit | null, JupiterApiError | DecodeError>;
  }
  export class Jupiter extends Context.Tag("Jupiter")<Jupiter, JupiterService>() {}
  export const JupiterLive: Layer.Layer<Jupiter>;
  ```
  Endpoint: `GET https://datapi.jup.ag/v1/assets/search?query=<mint>`, top-level JSON array (or single object).

- [ ] **Step 1: Extend error stage**

`src/errors.ts` — change `JupiterApiError` stage union to `"order" | "execute" | "audit"`.

- [ ] **Step 2: Write failing tests**

`test/jupiter.test.ts`:

```ts
import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { Jupiter, JupiterLive } from "../src/services/Jupiter.js";

const jsonResponse = (url: string, body: unknown, status = 200) =>
	HttpClientResponse.fromWeb(
		HttpClientRequest.get(url),
		new Response(JSON.stringify(body), { status }),
	);

const layerWith = (handler: (url: string) => { body: unknown; status?: number }) =>
	JupiterLive.pipe(
		Layer.provide(
			Layer.succeed(
				HttpClient.HttpClient,
				HttpClient.make((req) => {
					const { body, status } = handler(req.url);
					return Effect.succeed(jsonResponse(req.url, body, status ?? 200));
				}),
			),
		),
	);

describe("Jupiter", () => {
	it("decodes audit + fees from array response", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const j = yield* Jupiter;
				return yield* j.search("Mint111");
			}).pipe(
				Effect.provide(
					layerWith(() => ({
						body: [
							{
								id: "Mint111",
								fees: 45.2,
								audit: {
									topHoldersPercentage: 55,
									botHoldersPercentage: 22,
								},
							},
						],
					})),
				),
			),
		);
		expect(result).toEqual({ botHoldersPct: 22, top10Pct: 55, globalFeesSol: 45.2 });
	});

	it("handles string-typed numeric fields", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const j = yield* Jupiter;
				return yield* j.search("Mint111");
			}).pipe(
				Effect.provide(
					layerWith(() => ({
						body: {
							id: "Mint111",
							fees: "10",
							audit: { topHoldersPercentage: "70", botHoldersPercentage: "5" },
						},
					})),
				),
			),
		);
		expect(result).toEqual({ botHoldersPct: 5, top10Pct: 70, globalFeesSol: 10 });
	});

	it("returns null when no token found", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const j = yield* Jupiter;
				return yield* j.search("Mint111");
			}).pipe(Effect.provide(layerWith(() => ({ body: [] })))),
		);
		expect(result).toBeNull();
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: fails — module not found.

- [ ] **Step 4: Implement the service**

`src/services/Jupiter.ts`:

```ts
import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import {
	Context,
	Duration,
	Effect,
	Layer,
	ParseResult,
	Schedule,
	Schema,
} from "effect";
import { DecodeError, JupiterApiError } from "../errors.js";

const DATAPI = "https://datapi.jup.ag/v1";

const Asset = Schema.Struct({
	id: Schema.optional(Schema.String),
	fees: Schema.optional(Schema.Unknown),
	audit: Schema.optional(
		Schema.Struct({
			topHoldersPercentage: Schema.optional(Schema.Unknown),
			botHoldersPercentage: Schema.optional(Schema.Unknown),
		}),
	),
});

const toNum = (v: unknown): number | null => {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v !== "") {
		const n = Number.parseFloat(v);
		if (Number.isFinite(n)) return n;
	}
	return null;
};

const retryPolicy = Schedule.exponential(Duration.millis(400)).pipe(
	Schedule.intersect(Schedule.recurs(2)),
);

const transient = (e: JupiterApiError): boolean =>
	e.status === undefined || e.status === 429 || e.status >= 500;

const make = Effect.gen(function* () {
	const client = yield* HttpClient.HttpClient;

	const service: JupiterService = {
		search: (query) =>
			HttpClientRequest.get(`${DATAPI}/assets/search?query=${encodeURIComponent(query)}`).pipe(
				client.execute,
				Effect.mapError(
					(e) =>
						new JupiterApiError({ stage: "audit", message: `Request failed: ${e.message}` }),
				),
				Effect.flatMap((res) =>
					res.status >= 200 && res.status < 300
						? Effect.succeed(res)
						: Effect.fail(
								new JupiterApiError({
									stage: "audit",
									status: res.status,
									message: `Jupiter audit API ${res.status}`,
								}),
							),
				),
				Effect.flatMap((res) =>
					HttpClientResponse.schemaBodyJson(Schema.Array(Asset))(res).pipe(
						Effect.mapError(
							(e) =>
								new DecodeError({
									source: "jupiter",
									message: ParseResult.isParseError(e)
										? ParseResult.ArrayFormatter.formatErrorSync(e)
												.map((i) => i.message)
												.join(";")
										: String(e),
								}),
						),
					),
				),
				Effect.map((assets) => {
					const first = assets[0];
					if (!first) return null;
					return {
						botHoldersPct: toNum(first.audit?.botHoldersPercentage),
						top10Pct: toNum(first.audit?.topHoldersPercentage),
						globalFeesSol: toNum(first.fees),
					};
				}),
				Effect.retry({ schedule: retryPolicy, while: transient }),
				Effect.scoped,
			),
	};
	return service;
});

export const JupiterLive = Layer.effect(Jupiter, make);
```

Note: the API returns an array at top level; if it ever returns a single object the decode fails → screening catchAll yields null (acceptable, fail-open). Do NOT add a single-object fallback unless a fixture proves it is needed.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run check && npm run typecheck && npm test`
Expected: `test/jupiter.test.ts` passes.

- [ ] **Step 6: Commit**

```bash
git add src/errors.ts src/services/Jupiter.ts test/jupiter.test.ts
git commit -m "feat(services): Jupiter ChainInsight audit service"
```

---

### Task 4: Wire enrichment into Screening + layers

**Files:**
- Modify: `src/services/Screening.ts` (dependencies + enrichment loop)
- Modify: `src/layers.ts` (add OkxLive, JupiterLive)
- Test: `test/screening-enrichment.test.ts`

**Interfaces:**
- Consumes: `Okx` (advancedInfo, riskFlags, priceInfo), `Jupiter` (search), existing `RugCheck`, `MeteoraApi`, `AppConfig`.
- Produces: `ScreeningService` now requires `Okx` and `Jupiter`; pools returned from `screen()` carry the new nullable risk fields (null when API fails/absent).

- [ ] **Step 1: Write failing test**

`test/screening-enrichment.test.ts` — one mocked `HttpClient` dispatches on URL host to serve all four services:

```ts
import {
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "@effect/platform";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { AppConfigTest } from "../src/services/Config.js";
import { MeteoraApi, MeteoraApiLayer } from "../src/services/MeteoraApi.js";
import { OkxLive } from "../src/services/Okx.js";
import { JupiterLive } from "../src/services/Jupiter.js";
import { RugCheck, RugCheckLayer } from "../src/services/RugCheck.js";
import { Screening } from "../src/services/Screening.js";

const jsonResponse = (url: string, body: unknown, status = 200) =>
	HttpClientResponse.fromWeb(
		HttpClientRequest.get(url),
		new Response(JSON.stringify(body), { status }),
	);

const poolFixture = {
	pool_address: "Pool111",
	name: "FOO-SOL",
	token_x: { address: "Mint111", symbol: "FOO", organic_score: 70, holders: 1000 },
	token_y: { address: "So11111111111111111111111111111111111111112", symbol: "SOL" },
	fee_active_tvl_ratio: 0.06,
	volume: 5000,
	tvl: 20000,
	active_tvl: 15000,
	dlmm_params: { bin_step: 100 },
	fee_pct: 0.003,
	active_positions: 10,
	open_positions: 20,
	pool_price: 1,
	max_price: 2,
};

const route = (url: string): { body: unknown; status?: number } => {
	if (url.includes("web3.okx.com")) {
		if (url.includes("advanced-info"))
			return { body: { code: "0", data: [{ bundleHoldingPercent: "20", top10HoldPercent: "50", tokenTags: [] }] } };
		if (url.includes("/risk/")) return { body: { code: "0", data: { allAnalysis: [] } } };
		return { body: { code: "0", data: [{ price: "0.8", maxPrice: "1" }] } };
	}
	if (url.includes("datapi.jup.ag"))
		return {
			body: [
				{
					id: "Mint111",
					fees: 40,
					audit: { topHoldersPercentage: 50, botHoldersPercentage: 15 },
				},
			],
		};
	if (url.includes("rugcheck"))
		return { body: { score: 1200, score_normalised: 0.8 } };
	if (url.includes("pool-discovery"))
		return { body: { data: [poolFixture], total: 1 } };
	return { body: { data: [] } };
};

const layerWith = () =>
	ScreeningLiveForTest.pipe(
		Layer.provide(
			Layer.succeed(
				HttpClient.HttpClient,
				HttpClient.make((req) => {
					const { body, status } = route(req.url);
					return Effect.succeed(jsonResponse(req.url, body, status ?? 200));
				}),
			),
		),
		Layer.provideMerge(AppConfigTest({})),
	);

describe("Screening enrichment", () => {
	it("attaches okx + jupiter risk fields to screened pools", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const s = yield* Screening;
				return yield* s.screen({ displayLimit: 1 });
			}).pipe(Effect.provide(layerWith())),
		);
		const pool = result.pools[0];
		expect(pool.bundlePct).toBe(20);
		expect(pool.top10Pct).toBe(50);
		expect(pool.botHoldersPct).toBe(15);
		expect(pool.globalFeesSol).toBe(40);
		expect(pool.isRugpull).toBe(false);
		expect(pool.isWash).toBe(false);
		expect(pool.priceVsAthPct).toBe(80);
		expect(pool.rugScore).toBe(1200);
	});
});
```

Where `ScreeningLiveForTest` is built in the implementation step (a `Layer.effect(Screening, make)` whose `make` depends on Okx/Jupiter/RugCheck/MeteoraApi/AppConfig, composed with the service live layers + the shared mocked HttpClient). Export `ScreeningLive` from `src/services/Screening.ts` unchanged; the test composes:

```ts
import { OkxLive } from "../src/services/Okx.js";
import { JupiterLive } from "../src/services/Jupiter.js";
import { RugCheckLive } from "../src/services/RugCheck.js";
import { MeteoraApiLive } from "../src/services/MeteoraApi.js";
import { ScreeningLive } from "../src/services/Screening.js";

const ScreeningLiveForTest = ScreeningLive.pipe(
	Layer.provideMerge(MeteoraApiLive),
	Layer.provideMerge(RugCheckLive),
	Layer.provideMerge(OkxLive),
	Layer.provideMerge(JupiterLive),
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: fails — new fields missing / Screening dependency not satisfied.

- [ ] **Step 3: Update Screening service**

`src/services/Screening.ts`:
- Import `Okx`, `Jupiter` and add to the `ScreeningService` requirement union in `screen`'s effect (they become `yield*` deps inside `make`).
- Inside `make`, after the existing RugCheck and OHLCV loops, add:

```ts
const okx = yield* Okx;
const jupiter = yield* Jupiter;

yield* Effect.forEach(
	result.pools,
	(pool) =>
		Effect.gen(function* () {
			const mint = pool.baseMint;
			if (!mint) return;
			const [adv, risk, price, audit] = yield* Effect.all(
				[
					okx.advancedInfo(mint).pipe(Effect.either),
					okx.riskFlags(mint).pipe(Effect.either),
					okx.priceInfo(mint).pipe(Effect.either),
					jupiter.search(mint).pipe(Effect.either),
				],
				{ concurrency: 4 },
			);
			const assign = <T>(e: Effect.Either.Either<unknown, T>): T | null =>
				(e._tag === "Left" ? null : e.right);
			const poolMut = pool as {
				bundlePct?: number | null;
				top10Pct?: number | null;
				botHoldersPct?: number | null;
				globalFeesSol?: number | null;
				isRugpull?: boolean | null;
				isWash?: boolean | null;
				devSoldAll?: boolean | null;
				dexScreenerPaid?: boolean | null;
				priceVsAthPct?: number | null;
			};
			const a = assign(adv);
			poolMut.bundlePct = a?.bundlePct ?? null;
			poolMut.top10Pct = a?.top10Pct ?? null;
			poolMut.devSoldAll = a?.devSoldAll ?? null;
			poolMut.dexScreenerPaid = a?.dexScreenerPaid ?? null;
			const r = assign(risk);
			poolMut.isRugpull = r?.isRugpull ?? null;
			poolMut.isWash = r?.isWash ?? null;
			const p = assign(price);
			poolMut.priceVsAthPct = p?.priceVsAthPct ?? null;
			const t = assign(audit);
			poolMut.botHoldersPct = t?.botHoldersPct ?? null;
			poolMut.top10Pct = t?.top10Pct ?? null;
			poolMut.globalFeesSol = t?.globalFeesSol ?? null;
		}),
	{ concurrency: 5, discard: true },
);
```

Note: `Effect.Either.Either` — import via `import { Effect } from "effect"` and use `Effect.Either` if needed; adjust to the exact exported namespace (e.g. `Effect.Either.Either` may not exist; use the plain discriminated union check `if (e._tag === "Left")` with `e as { _tag: "Left" } | { _tag: "Right"; right: T }` if `Effect.Either` is not exported).

- [ ] **Step 4: Add layers to composition**

`src/layers.ts` — add imports `OkxLive`, `JupiterLive` and add to `Layer.mergeAll`:

```ts
	OkxLive,
	JupiterLive,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run check && npm run typecheck && npm test`
Expected: `test/screening-enrichment.test.ts` passes; `npm run check` clean.

- [ ] **Step 6: Commit**

```bash
git add src/services/Screening.ts src/layers.ts test/screening-enrichment.test.ts
git commit -m "feat(screening): enrich pools with OKX + Jupiter risk data"
```

---

### Task 5: checkRisks guardrail

**Files:**
- Modify: `src/telegram/agent/guardrails.ts`
- Test: `test/agent-guardrails.test.ts`

**Interfaces:**
- Consumes: `ResolvedAgentRisks` from `src/services/Config.js`.
- Produces:
  ```ts
  export function checkRisks(input: {
  	pool: {
  		isRugpull?: boolean | null;
  		isWash?: boolean | null;
  		bundlePct?: number | null;
  		botHoldersPct?: number | null;
  		top10Pct?: number | null;
  		globalFeesSol?: number | null;
  		devSoldAll?: boolean | null;
  		dexScreenerPaid?: boolean | null;
  		priceVsAthPct?: number | null;
  		fromAthPct?: number | null;
  	};
  	risks: ResolvedAgentRisks;
  }): GuardOk
  ```
  Returns `{ ok: false, reason: "<metric> <value> exceeds/flagged limit" }` or `{ ok: true, reason: null }`. When `risks.enabled === false` → always pass.

- [ ] **Step 1: Write failing tests**

`test/agent-guardrails.test.ts` — append:

```ts
import { checkRisks } from "../src/telegram/agent/guardrails.js";

const riskCfg = {
	enabled: true,
	minTokenFeesSol: 30,
	maxBundlePct: 30,
	maxBotHoldersPct: 30,
	maxTop10Pct: 60,
	maxPriceVsAthPct: 80,
	blockWash: true,
	blockRugpull: true,
	blockDexScreenerPaid: true,
	blockDevSoldAll: true,
};

const clean = {
	isRugpull: false,
	isWash: false,
	bundlePct: 20,
	botHoldersPct: 10,
	top10Pct: 40,
	globalFeesSol: 50,
	devSoldAll: false,
	dexScreenerPaid: false,
	priceVsAthPct: 60,
	fromAthPct: null,
};

describe("checkRisks", () => {
	it("passes a clean pool", () => {
		expect(checkRisks({ pool: clean, risks: riskCfg }).ok).toBe(true);
	});
	it("blocks rugpull", () => {
		const r = checkRisks({ pool: { ...clean, isRugpull: true }, risks: riskCfg });
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("rugpull");
	});
	it("blocks wash trading", () => {
		const r = checkRisks({ pool: { ...clean, isWash: true }, risks: riskCfg });
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("wash");
	});
	it("blocks bundle, bot holders, top10 concentration", () => {
		expect(checkRisks({ pool: { ...clean, bundlePct: 31 }, risks: riskCfg }).ok).toBe(false);
		expect(checkRisks({ pool: { ...clean, botHoldersPct: 31 }, risks: riskCfg }).ok).toBe(false);
		expect(checkRisks({ pool: { ...clean, top10Pct: 61 }, risks: riskCfg }).ok).toBe(false);
	});
	it("blocks low global fees", () => {
		const r = checkRisks({ pool: { ...clean, globalFeesSol: 29.9 }, risks: riskCfg });
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("fees");
	});
	it("blocks dexScreenerPaid and devSoldAll", () => {
		expect(checkRisks({ pool: { ...clean, dexScreenerPaid: true }, risks: riskCfg }).ok).toBe(false);
		expect(checkRisks({ pool: { ...clean, devSoldAll: true }, risks: riskCfg }).ok).toBe(false);
	});
	it("blocks price too close to ATH", () => {
		const r = checkRisks({ pool: { ...clean, priceVsAthPct: 90 }, risks: riskCfg });
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("ATH");
	});
	it("falls back to fromAthPct when priceVsAthPct is null", () => {
		// fromAthPct = 0 means at ATH → priceVsAthPct equivalent 100 > 80 → block
		const r = checkRisks({ pool: { ...clean, priceVsAthPct: null, fromAthPct: 0.05 }, risks: riskCfg });
		expect(r.ok).toBe(false);
	});
	it("does not block on missing data (fail-open)", () => {
		const r = checkRisks({
			pool: { ...clean, bundlePct: null, botHoldersPct: null, top10Pct: null, globalFeesSol: null, priceVsAthPct: null, fromAthPct: null },
			risks: riskCfg,
		});
		expect(r.ok).toBe(true);
	});
	it("passes everything when disabled", () => {
		const r = checkRisks({ pool: { ...clean, isRugpull: true, bundlePct: 99 }, risks: { ...riskCfg, enabled: false } });
		expect(r.ok).toBe(true);
	});
	it("respects per-flag toggles", () => {
		const r = checkRisks({ pool: { ...clean, isWash: true }, risks: { ...riskCfg, blockWash: false } });
		expect(r.ok).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: fails — `checkRisks` not exported.

- [ ] **Step 3: Implement**

`src/telegram/agent/guardrails.ts` — import `ResolvedAgentRisks` type. Append:

```ts
export function checkRisks(input: {
	pool: {
		isRugpull?: boolean | null;
		isWash?: boolean | null;
		bundlePct?: number | null;
		botHoldersPct?: number | null;
		top10Pct?: number | null;
		globalFeesSol?: number | null;
		devSoldAll?: boolean | null;
		dexScreenerPaid?: boolean | null;
		priceVsAthPct?: number | null;
		fromAthPct?: number | null;
	};
	risks: ResolvedAgentRisks;
}): GuardOk {
	const { risks, pool } = input;
	if (!risks.enabled) return { ok: true, reason: null };
	if (risks.blockRugpull && pool.isRugpull === true) {
		return { ok: false, reason: "rugpull flagged" };
	}
	if (risks.blockWash && pool.isWash === true) {
		return { ok: false, reason: "wash trading flagged" };
	}
	if (pool.bundlePct != null && pool.bundlePct > risks.maxBundlePct) {
		return {
			ok: false,
			reason: `bundle ${pool.bundlePct}% > ${risks.maxBundlePct}%`,
		};
	}
	if (
		pool.botHoldersPct != null &&
		pool.botHoldersPct > risks.maxBotHoldersPct
	) {
		return {
			ok: false,
			reason: `bot holders ${pool.botHoldersPct}% > ${risks.maxBotHoldersPct}%`,
		};
	}
	if (pool.top10Pct != null && pool.top10Pct > risks.maxTop10Pct) {
		return {
			ok: false,
			reason: `top10 ${pool.top10Pct}% > ${risks.maxTop10Pct}%`,
		};
	}
	if (pool.globalFeesSol != null && pool.globalFeesSol < risks.minTokenFeesSol) {
		return {
			ok: false,
			reason: `global fees ${pool.globalFeesSol} SOL < ${risks.minTokenFeesSol} SOL`,
		};
	}
	if (risks.blockDexScreenerPaid && pool.dexScreenerPaid === true) {
		return { ok: false, reason: "dex screener paid boost flagged" };
	}
	if (risks.blockDevSoldAll && pool.devSoldAll === true) {
		return { ok: false, reason: "dev sold all holdings" };
	}
	const athPct =
		pool.priceVsAthPct ??
		(pool.fromAthPct != null ? (1 - pool.fromAthPct) * 100 : null);
	if (athPct != null && athPct > risks.maxPriceVsAthPct) {
		return {
			ok: false,
			reason: `price ${athPct}% of ATH > ${risks.maxPriceVsAthPct}%`,
		};
	}
	return { ok: true, reason: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run check && npm run typecheck && npm test`
Expected: all `checkRisks` cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/guardrails.ts test/agent-guardrails.test.ts
git commit -m "feat(agent): checkRisks hard-block guardrail"
```

---

### Task 6: heuristic safety weights + Darwinian modulation

**Files:**
- Modify: `src/telegram/agent/heuristic.ts`
- Test: `test/agent-heuristic.test.ts`

**Interfaces:**
- Consumes: `HeuristicWeights` (`Record<string, number>`, produced by Task 7).
- Produces:
  ```ts
  export function heuristicScore(pool: ScreenedPool, weights?: Record<string, number>): number
  export function rankPools(pools, opts: { minCandidate: number; maxCandidates: number; weights?: Record<string, number> }): ScreenedPool[]
  ```

- [ ] **Step 1: Write failing tests**

`test/agent-heuristic.test.ts` — append:

```ts
import { heuristicScore, rankPools } from "../src/telegram/agent/heuristic.js";

const basePool = {
	pool: "Pool111",
	name: "FOO-SOL",
	baseSymbol: "FOO",
	baseMint: "Mint111",
	quoteSymbol: "SOL",
	tvl: 10000,
	activeTvl: 8000,
	mcap: 500000,
	holders: 1000,
	organicScore: 70,
	quoteOrganic: 70,
	feeActiveTvlRatio: 0.05,
	volatility: 0.01,
	binStep: 100,
	baseFeePct: 0.003,
	volume: 50000,
	fee: 500,
	activePositions: 200,
	openPositions: 300,
	tokenAgeHours: 48,
	score: 0,
	price: 1,
	priceChangePct: 10,
	fromAthPct: null,
	volumeChangePct: 5,
	tokenXAddress: "Mint111",
};

describe("heuristicScore risk factors", () => {
	it("scores a pool at ATH lower than one deep below ATH", () => {
		const atAth = heuristicScore({ ...basePool, priceVsAthPct: 100 });
		const belowAth = heuristicScore({ ...basePool, priceVsAthPct: 40 });
		expect(belowAth).toBeGreaterThan(atAth);
	});
	it("prefers higher rugScore", () => {
		const low = heuristicScore({ ...basePool, rugScore: 100 });
		const high = heuristicScore({ ...basePool, rugScore: 3000 });
		expect(high).toBeGreaterThan(low);
	});
	it("prefers lower top10 and bundle concentration", () => {
		const low = heuristicScore({ ...basePool, top10Pct: 90, bundlePct: 90 });
		const high = heuristicScore({ ...basePool, top10Pct: 20, bundlePct: 10 });
		expect(high).toBeGreaterThan(low);
	});
	it("prefers more active positions (crowd)", () => {
		const few = heuristicScore({ ...basePool, activePositions: 10 });
		const many = heuristicScore({ ...basePool, activePositions: 2000 });
		expect(many).toBeGreaterThan(few);
	});
	it("modulates score by adaptive weights", () => {
		const w = { volume: 2.5, organicScore: 0.3 };
		const lowVol = { ...basePool, volume: 1000, organicScore: 95 };
		const highVol = { ...basePool, volume: 500000, organicScore: 40 };
		const weightedLowVol = heuristicScore(lowVol, w);
		const weightedHighVol = heuristicScore(highVol, w);
		// with volume boosted, high volume should win despite low organic
		expect(weightedHighVol).toBeGreaterThan(weightedLowVol);
	});
});

describe("rankPools with weights", () => {
	it("passes weights through to scoring", () => {
		const ranked = rankPools(
			[{ ...basePool, pool: "A", volume: 500000, organicScore: 40 }],
			{ minCandidate: 0, maxCandidates: 5, weights: { volume: 2.5 } },
		);
		expect(ranked.length).toBe(1);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: fails — new behavior not present (ATH/rug/bundle differences currently zero).

- [ ] **Step 3: Implement**

`src/telegram/agent/heuristic.ts`:

```ts
import type { ScreenedPool } from "../../domain/screened.js";

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

// [signalName, baseWeight]; weights sum to 1.
const COMPONENTS: ReadonlyArray<[string, number]> = [
	["feeActiveTvlRatio", 0.28],
	["organicScore", 0.2],
	["holders", 0.08],
	["volume", 0.08],
	["binStep", 0.16],
	["priceVsAthPct", 0.05],
	["rugScore", 0.05],
	["top10Pct", 0.03],
	["bundlePct", 0.02],
	["botHoldersPct", 0.02],
	["activePositions", 0.03],
];

/** Deterministic 0-100 quality score from discovery + risk metrics. */
export function heuristicScore(
	pool: ScreenedPool,
	weights?: Record<string, number>,
): number {
	const w = (name: string, fallback: number) => weights?.[name] ?? fallback;
	const feeTvl = clamp(pool.feeActiveTvlRatio / 0.05);
	const organic = clamp(pool.organicScore / 100);
	const holders = clamp(pool.holders / 1000);
	const volume = clamp(pool.volume / 100_000);
	const binStep = clamp(1 - pool.binStep / 125);
	const athSafe = clamp((100 - (pool.priceVsAthPct ?? 100)) / 100);
	const rug =
		pool.rugScore != null ? clamp(pool.rugScore / 2500) : 0.5;
	const top10 =
		pool.top10Pct != null ? clamp(1 - pool.top10Pct / 100) : 0.5;
	const bundle =
		pool.bundlePct != null ? clamp(1 - pool.bundlePct / 100) : 0.5;
	const bot =
		pool.botHoldersPct != null ? clamp(1 - pool.botHoldersPct / 100) : 0.5;
	const crowd = clamp(pool.activePositions / 500);

	const vals = [
		feeTvl,
		organic,
		holders,
		volume,
		binStep,
		athSafe,
		rug,
		top10,
		bundle,
		bot,
		crowd,
	];

	let weightedSum = 0;
	let totalWeight = 0;
	for (let i = 0; i < COMPONENTS.length; i++) {
		const [name, baseW] = COMPONENTS[i];
		const eff = w(name, baseW);
		weightedSum += vals[i] * baseW * eff;
		totalWeight += baseW * eff;
	}
	if (totalWeight <= 0) return 0;
	return Math.round(clamp((weightedSum / totalWeight) * 100, 0, 100));
}

export function rankPools(
	pools: readonly ScreenedPool[],
	opts: {
		minCandidate: number;
		maxCandidates: number;
		weights?: Record<string, number>;
	},
): ScreenedPool[] {
	return pools
		.map((p) => ({ p, h: heuristicScore(p, opts.weights) }))
		.sort((a, b) => b.h - a.h)
		.filter((r) => r.h >= opts.minCandidate)
		.slice(0, opts.maxCandidates)
		.map((r) => r.p);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run check && npm run typecheck && npm test`
Expected: heuristic tests pass, including new risk-direction tests.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/heuristic.ts test/agent-heuristic.test.ts
git commit -m "feat(agent): safety metrics + adaptive weights in heuristic"
```

---

### Task 7: signalWeights module (Darwinian)

**Files:**
- Create: `src/telegram/agent/signalWeights.ts`
- Test: `test/agent-signal-weights.test.ts`

**Interfaces:**
- Consumes: `ResolvedAgentDarwin` from `src/services/Config.js`, `ScreenedPool` for snapshots.
- Produces:
  ```ts
  export type SignalName =
  	| "organicScore" | "feeActiveTvlRatio" | "volume" | "holders" | "binStep"
  	| "priceVsAthPct" | "rugScore" | "top10Pct" | "bundlePct" | "botHoldersPct"
  	| "globalFeesSol" | "activePositions";
  export const SIGNAL_NAMES: readonly SignalName[];
  export const HIGHER_IS_BETTER: ReadonlySet<SignalName>;
  export interface PerfRecord {
  	closedAt: string;
  	pnlPct: number;
  	signals: Record<SignalName, number>;
  }
  export interface SignalWeightsFile {
  	weights: Record<SignalName, number>;
  	lastRecalc: string | null;
  	recalcCount: number;
  	closesSinceRecalc: number;
  	history: unknown[];
  	perf: PerfRecord[];
  }
  export function signalSnapshot(pool: ScreenedPool): Record<SignalName, number>;
  export function loadSignalWeights(file?: string): SignalWeightsFile;
  export function saveSignalWeights(data: SignalWeightsFile, file?: string): void;
  export function appendPerf(data: SignalWeightsFile, rec: PerfRecord): SignalWeightsFile;
  export function recalculateWeights(input: {
  	perf: readonly PerfRecord[];
  	weights: Record<SignalName, number>;
  	cfg: ResolvedAgentDarwin;
  }): { weights: Record<SignalName, number>; changes: Array<{ signal: SignalName; from: number; to: number; lift: number }> };
  export function weightsSummary(weights: Record<SignalName, number>): string;
  export const SIGNAL_WEIGHTS_FILE: string; // join(process.cwd(), ".vexis-agent-signals.json")
  ```

- [ ] **Step 1: Write failing tests**

`test/agent-signal-weights.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	HIGHER_IS_BETTER,
	recalculateWeights,
	signalSnapshot,
	weightsSummary,
} from "../src/telegram/agent/signalWeights.js";

const darwin = {
	enabled: true,
	windowDays: 60,
	recalcEvery: 5,
	boostFactor: 1.05,
	decayFactor: 0.95,
	weightFloor: 0.3,
	weightCeiling: 2.5,
	minSamples: 4,
};

const rec = (pnlPct: number, partial: Partial<Record<string, number>>) => ({
	closedAt: new Date().toISOString(),
	pnlPct,
	signals: {
		organicScore: 70,
		feeActiveTvlRatio: 0.05,
		volume: 50000,
		holders: 1000,
		binStep: 100,
		priceVsAthPct: 60,
		rugScore: 1500,
		top10Pct: 50,
		bundlePct: 20,
		botHoldersPct: 10,
		globalFeesSol: 40,
		activePositions: 200,
		...partial,
	},
});

describe("signalSnapshot", () => {
	it("extracts numeric signal values from a pool", () => {
		const snap = signalSnapshot({
			pool: "P", name: "n", baseSymbol: "b", baseMint: "m",
			quoteSymbol: "q", tvl: 0, activeTvl: 0, mcap: 0, holders: 100,
			organicScore: 60, quoteOrganic: 0, feeActiveTvlRatio: 0.02,
			volatility: 0, binStep: 110, baseFeePct: 0, volume: 500,
			fee: 0, activePositions: 50, openPositions: 60, tokenAgeHours: 1,
			score: 0, price: 1, priceChangePct: 0, fromAthPct: 0.5,
			volumeChangePct: 0, tokenXAddress: "m", rugScore: 800,
			priceVsAthPct: 70, top10Pct: 40, bundlePct: 10, botHoldersPct: 5,
			globalFeesSol: 35,
		} as never);
		expect(snap.priceVsAthPct).toBe(70);
		expect(snap.rugScore).toBe(800);
		expect(snap.activePositions).toBe(50);
	});
});

describe("recalculateWeights", () => {
	it("boosts signals that distinguish winners and decays weak ones", () => {
		// organicScore high in winners, low in losers → boosted.
		// volume high in losers, low in winners → decayed.
		const perf = [
			rec(10, { organicScore: 95, volume: 1000 }),
			rec(8, { organicScore: 90, volume: 2000 }),
			rec(5, { organicScore: 88, volume: 1500 }),
			rec(6, { organicScore: 92, volume: 1200 }),
			rec(-10, { organicScore: 30, volume: 500000 }),
			rec(-8, { organicScore: 40, volume: 400000 }),
			rec(-6, { organicScore: 45, volume: 450000 }),
			rec(-9, { organicScore: 35, volume: 480000 }),
		];
		const weights: Record<string, number> = Object.fromEntries(
			Object.keys(rec(0, {})!.signals).map((s) => [s, 1]),
		);
		const { weights: next, changes } = recalculateWeights({
			perf,
			weights: weights as never,
			cfg: darwin,
		});
		const change = (name: string) => changes.find((c) => c.signal === name);
		const organic = change("organicScore");
		const volume = change("volume");
		expect(organic && organic.to > organic.from).toBe(true);
		expect(volume && volume.to < volume.from).toBe(true);
		expect(next.organicScore).toBeGreaterThan(1);
		expect(next.volume).toBeLessThan(1);
	});

	it("respects weight floor and ceiling", () => {
		const perf = [
			rec(1, { organicScore: 99, volume: 1 }),
			rec(1, { organicScore: 99, volume: 1 }),
			rec(-1, { organicScore: 1, volume: 999999 }),
			rec(-1, { organicScore: 1, volume: 999999 }),
		];
		const weights: Record<string, number> = Object.fromEntries(
			Object.keys(rec(0, {})!.signals).map((s) => [s, 1]),
		);
		const first = recalculateWeights({ perf, weights: weights as never, cfg: darwin });
		const second = recalculateWeights({
			perf: perf.map((p) => ({ ...p, signals: { ...p.signals } })),
			weights: first.weights as never,
			cfg: { ...darwin, boostFactor: 2.5, decayFactor: 0.5 },
		});
		for (const [name, val] of Object.entries(second.weights)) {
			expect(val).toBeGreaterThanOrEqual(darwin.weightFloor - 1e-9);
			expect(val).toBeLessThanOrEqual(darwin.weightCeiling + 1e-9);
		}
	});

	it("skips recalc below minSamples or without both wins/losses", () => {
		const weights = { organicScore: 1 } as never;
		const r1 = recalculateWeights({ perf: [rec(1, {})], weights, cfg: darwin });
		expect(r1.changes.length).toBe(0);
		const r2 = recalculateWeights({
			perf: [rec(1, {}), rec(1, {}), rec(1, {}), rec(1, {})],
			weights,
			cfg: darwin,
		});
		expect(r2.changes.length).toBe(0);
	});
});

describe("weightsSummary", () => {
	it("renders a multi-line summary sorted by weight", () => {
		const s = weightsSummary({ volume: 1.5, organicScore: 0.5, holders: 1 } as never);
		expect(s).toContain("volume");
		expect(s).toContain("organicScore");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: fails — module not found.

- [ ] **Step 3: Implement**

`src/telegram/agent/signalWeights.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ScreenedPool } from "../../domain/screened.js";
import type { ResolvedAgentDarwin } from "../../services/Config.js";

export type SignalName =
	| "organicScore"
	| "feeActiveTvlRatio"
	| "volume"
	| "holders"
	| "binStep"
	| "priceVsAthPct"
	| "rugScore"
	| "top10Pct"
	| "bundlePct"
	| "botHoldersPct"
	| "globalFeesSol"
	| "activePositions";

export const SIGNAL_NAMES: readonly SignalName[] = [
	"organicScore",
	"feeActiveTvlRatio",
	"volume",
	"holders",
	"binStep",
	"priceVsAthPct",
	"rugScore",
	"top10Pct",
	"bundlePct",
	"botHoldersPct",
	"globalFeesSol",
	"activePositions",
];

export const HIGHER_IS_BETTER: ReadonlySet<SignalName> = new Set([
	"organicScore",
	"feeActiveTvlRatio",
	"volume",
	"holders",
	"binStep",
	"rugScore",
	"globalFeesSol",
	"activePositions",
]);

export interface PerfRecord {
	closedAt: string;
	pnlPct: number;
	signals: Record<SignalName, number>;
}

export interface SignalWeightsFile {
	weights: Record<SignalName, number>;
	lastRecalc: string | null;
	recalcCount: number;
	closesSinceRecalc: number;
	history: unknown[];
	perf: PerfRecord[];
}

export const SIGNAL_WEIGHTS_FILE = join(process.cwd(), ".vexis-agent-signals.json");

const emptyWeights = (): Record<SignalName, number> =>
	Object.fromEntries(SIGNAL_NAMES.map((s) => [s, 1])) as Record<
		SignalName,
		number
	>;

const EMPTY: SignalWeightsFile = {
	weights: emptyWeights(),
	lastRecalc: null,
	recalcCount: 0,
	closesSinceRecalc: 0,
	history: [],
	perf: [],
};

const num = (v: number | null | undefined): number | null =>
	typeof v === "number" && Number.isFinite(v) ? v : null;

export function signalSnapshot(pool: ScreenedPool): Record<SignalName, number> {
	return {
		organicScore: pool.organicScore,
		feeActiveTvlRatio: pool.feeActiveTvlRatio,
		volume: pool.volume,
		holders: pool.holders,
		binStep: pool.binStep,
		priceVsAthPct: num(pool.priceVsAthPct) ?? 100,
		rugScore: num(pool.rugScore) ?? 0,
		top10Pct: num(pool.top10Pct) ?? 100,
		bundlePct: num(pool.bundlePct) ?? 100,
		botHoldersPct: num(pool.botHoldersPct) ?? 100,
		globalFeesSol: num(pool.globalFeesSol) ?? 0,
		activePositions: pool.activePositions,
	};
}

export function loadSignalWeights(file = SIGNAL_WEIGHTS_FILE): SignalWeightsFile {
	if (!existsSync(file)) return { ...EMPTY, weights: emptyWeights() };
	try {
		const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<SignalWeightsFile>;
		return {
			...EMPTY,
			...raw,
			weights: { ...emptyWeights(), ...(raw.weights ?? {}) },
		};
	} catch {
		return { ...EMPTY, weights: emptyWeights() };
	}
}

export function saveSignalWeights(
	data: SignalWeightsFile,
	file = SIGNAL_WEIGHTS_FILE,
): void {
	try {
		writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
	} catch (e) {
		console.warn("[agent] signal-weights write failed:", e);
	}
}

export function appendPerf(
	data: SignalWeightsFile,
	rec: PerfRecord,
): SignalWeightsFile {
	return {
		...data,
		perf: [...data.perf, rec],
		closesSinceRecalc: data.closesSinceRecalc + 1,
	};
}

function normValue(name: SignalName, v: number, min: number, max: number): number {
	const span = max - min;
	if (span <= 0) return 0.5;
	const raw = (v - min) / span;
	return HIGHER_IS_BETTER.has(name) ? raw : 1 - raw;
}

export function computeLift(
	name: SignalName,
	wins: readonly PerfRecord[],
	losses: readonly PerfRecord[],
	minSamples: number,
): number | null {
	const vals = (list: readonly PerfRecord[]) =>
		list
			.map((p) => p.signals[name])
			.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
	const winVals = vals(wins);
	const lossVals = vals(losses);
	if (winVals.length + lossVals.length < minSamples) return null;
	if (winVals.length === 0 || lossVals.length === 0) return null;
	const all = [...winVals, ...lossVals];
	const min = Math.min(...all);
	const max = Math.max(...all);
	const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
	return (
		mean(winVals.map((v) => normValue(name, v, min, max))) -
		mean(lossVals.map((v) => normValue(name, v, min, max)))
	);
}

export function recalculateWeights(input: {
	perf: readonly PerfRecord[];
	weights: Record<SignalName, number>;
	cfg: ResolvedAgentDarwin;
}): {
	weights: Record<SignalName, number>;
	changes: Array<{ signal: SignalName; from: number; to: number; lift: number }>;
} {
	const {
		windowDays,
		minSamples,
		boostFactor,
		decayFactor,
		weightFloor,
		weightCeiling,
	} = input.cfg;
	const cutoff = Date.now() - windowDays * 86_400_000;
	const recent = input.perf.filter((p) => Date.parse(p.closedAt) >= cutoff);
	if (recent.length < minSamples) return { weights: input.weights, changes: [] };
	const wins = recent.filter((p) => p.pnlPct > 0);
	const losses = recent.filter((p) => p.pnlPct <= 0);
	if (wins.length === 0 || losses.length === 0) {
		return { weights: input.weights, changes: [] };
	}
	const lifts = new Map<SignalName, number>();
	for (const name of SIGNAL_NAMES) {
		const l = computeLift(name, wins, losses, minSamples);
		if (l != null) lifts.set(name, l);
	}
	const ranked = [...lifts.entries()].sort((a, b) => b[1] - a[1]);
	if (ranked.length === 0) return { weights: input.weights, changes: [] };
	const q1End = Math.ceil(ranked.length * 0.25);
	const q3Start = Math.floor(ranked.length * 0.75);
	const top = new Set(ranked.slice(0, q1End).map(([n]) => n));
	const bottom = new Set(ranked.slice(q3Start).map(([n]) => n));
	const next = { ...input.weights };
	const changes: Array<{
		signal: SignalName;
		from: number;
		to: number;
		lift: number;
	}> = [];
	for (const [name, lift] of ranked) {
		const prev = next[name] ?? 1;
		let v = prev;
		if (top.has(name)) v = Math.min(prev * boostFactor, weightCeiling);
		else if (bottom.has(name)) v = Math.max(prev * decayFactor, weightFloor);
		v = Math.round(v * 1000) / 1000;
		if (v !== prev) {
			next[name] = v;
			changes.push({
				signal: name,
				from: prev,
				to: v,
				lift: Math.round(lift * 1000) / 1000,
			});
		}
	}
	return { weights: next, changes };
}

export function weightsSummary(weights: Record<SignalName, number>): string {
	const sorted = [...SIGNAL_NAMES].sort((a, b) => (weights[b] ?? 1) - (weights[a] ?? 1));
	return [
		"Signal weights (Darwinian, learned from PnL):",
		...sorted.map(
			(name) =>
				`- ${name}: ${(weights[name] ?? 1).toFixed(2)} (${
					(weights[name] ?? 1) >= 1.2
						? "high"
						: (weights[name] ?? 1) <= 0.7
							? "low"
							: "neutral"
				})`,
		),
	].join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run check && npm run typecheck && npm test`
Expected: signal-weights tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/signalWeights.ts test/agent-signal-weights.test.ts
git commit -m "feat(agent): Darwinian signal weights from PnL"
```

---

### Task 8: Engine wiring + LLM risk context

**Files:**
- Modify: `src/telegram/agent/state.ts` (`AgentPlan.signals`)
- Modify: `src/telegram/agent/engine.ts` (risk guardrail, snapshot, perf, recalc, weights to rank/decide)
- Modify: `src/telegram/agent/llm.ts` (LlmCandidate risk fields + weights summary in prompt)
- Modify: `src/telegram/agent/decision.ts` (decideCandidates weights passthrough)
- Test: `test/agent-llm.test.ts` (prompt includes risk fields)

**Interfaces:**
- Consumes: `checkRisks` (Task 5), `signalSnapshot`, `loadSignalWeights`, `saveSignalWeights`, `appendPerf`, `recalculateWeights`, `weightsSummary` (Task 7), `rankPools`/`heuristicScore` with weights (Task 6).
- Produces: `AgentPlan` gains `signals?: Record<string, number>`.

- [ ] **Step 1: Write failing test**

`test/agent-llm.test.ts` — update existing `buildPrompt` describe; add:

```ts
it("includes risk fields and weights summary in prompt", () => {
	const prompt = buildPrompt(
		[
			{
				pool: "Pool111",
				pair: "FOO/SOL",
				heuristic: 80,
				feeActiveTvlRatio: 0.05,
				organicScore: 70,
				holders: 1000,
				volume: 50000,
				priceVsAthPct: 60,
				rugScore: 1500,
				top10Pct: 40,
				bundlePct: 10,
				botHoldersPct: 5,
				globalFeesSol: 45,
				activePositions: 200,
			},
		],
		"Signal weights (Darwinian, learned from PnL):\n- volume: 1.50",
	);
	expect(prompt).toContain("priceVsAthPct=60");
	expect(prompt).toContain("rugScore=1500");
	expect(prompt).toContain("Darwinian");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: fails — `LlmCandidate` has no risk fields / `buildPrompt` arity.

- [ ] **Step 3: Update state.ts**

`src/telegram/agent/state.ts` — `AgentPlan` add:
```ts
	signals?: Record<string, number>;
```

- [ ] **Step 4: Update llm.ts**

`LlmCandidate` — add:
```ts
	priceVsAthPct?: number | null;
	rugScore?: number | null;
	top10Pct?: number | null;
	bundlePct?: number | null;
	botHoldersPct?: number | null;
	globalFeesSol?: number | null;
	activePositions?: number | null;
```

`buildPrompt(candidates, weightsSummary?: string)` — in the candidate line append:
```ts
${c.priceVsAthPct != null ? ` priceVsAthPct=${c.priceVsAthPct}` : ""}${c.rugScore != null ? ` rugScore=${c.rugScore}` : ""}${c.top10Pct != null ? ` top10Pct=${c.top10Pct}` : ""}${c.bundlePct != null ? ` bundlePct=${c.bundlePct}` : ""}${c.botHoldersPct != null ? ` botHoldersPct=${c.botHoldersPct}` : ""}${c.globalFeesSol != null ? ` globalFeesSol=${c.globalFeesSol}` : ""}${c.activePositions != null ? ` activePositions=${c.activePositions}` : ""}
```

And after the table (before closing), if `weightsSummary` is set, append:
```ts
"",
weightsSummary,
```

`requestSignals` opts gains `weightsSummary?: string` and passes it to `buildPrompt`.

- [ ] **Step 5: Update decision.ts**

`decideCandidates` — add optional `weights?: Record<string, number>` to input; call `heuristicScore(pool, input.weights)`.

- [ ] **Step 6: Wire engine.ts**

`src/telegram/agent/engine.ts`:
- Imports: add `checkRisks` from `./guardrails.js`; `signalSnapshot`, `loadSignalWeights`, `saveSignalWeights`, `appendPerf`, `recalculateWeights`, `weightsSummary` from `./signalWeights.js` (do not import `SIGNAL_WEIGHTS_FILE` — the load/save helpers default to it).
- In `evaluatePlans`, before building candidates:
  ```ts
  const sw = loadSignalWeights();
  const weights = sw.weights;
  ```
  Pass `weights` to `rankPools` and `decideCandidates`.
- Build `llmCandidates` — add the risk fields from each ranked pool:
  ```ts
  priceVsAthPct: p.priceVsAthPct ?? null,
  rugScore: p.rugScore ?? null,
  top10Pct: p.top10Pct ?? null,
  bundlePct: p.bundlePct ?? null,
  botHoldersPct: p.botHoldersPct ?? null,
  globalFeesSol: p.globalFeesSol ?? null,
  activePositions: p.activePositions,
  ```
- `requestSignals` call — pass `weightsSummary: weightsSummary(weights)`.
- In the decision loop, after the `checkDuplicate` block, before `deriveOpenAmount`:
  ```ts
  const risk = checkRisks({ pool: d.pool, risks: cfg.risks });
  if (!risk.ok) {
  	journal.candidates.push({
  		...base,
  		guardrail: "blocked",
  		blockedReason: risk.reason,
  	});
  	console.log(
  		`[agent] decide: ${d.pool.name} score ${d.score} → blocked (${risk.reason})`,
  	);
  	continue;
  }
  ```
- On open success, when pushing the plan, add `signals: signalSnapshot(d.pool)`.
- In `evaluateTpSl`, inside the successful close branch (after computing `sig`), before removing the plan, capture the snapshot and record perf:
  ```ts
  const signals = plan.signals;
  ...
  if (signals && Number.isFinite(pct)) {
  	const swf = loadSignalWeights();
  	const updated = appendPerf(swf, {
  		closedAt: new Date().toISOString(),
  		pnlPct: pct,
  		signals,
  	});
  	let toSave = updated;
  	if (cfg.darwin.enabled && updated.closesSinceRecalc >= cfg.darwin.recalcEvery) {
  		const { weights, changes } = recalculateWeights({
  			perf: updated.perf,
  			weights: updated.weights,
  			cfg: cfg.darwin,
  		});
  		if (changes.length > 0) {
  			console.log(
  				`[agent] signal weights recalculated: ${changes
  					.map((c) => `${c.signal}: ${c.from}→${c.to}`)
  					.join(", ")}`,
  			);
  		}
  		toSave = {
  			...updated,
  			weights,
  			lastRecalc: new Date().toISOString(),
  			recalcCount: updated.recalcCount + 1,
  			closesSinceRecalc: 0,
  			history: [...updated.history, { at: new Date().toISOString(), changes }],
  		};
  	}
  	saveSignalWeights(toSave);
  }
  ```
  Note: place this code where `plan`, `pct`, and `sig` are in scope (the `try` block of the close), and reference `cfg` (already a parameter).

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run check && npm run typecheck && npm test`
Expected: llm prompt test passes; typecheck clean (no unused imports).

- [ ] **Step 8: Commit**

```bash
git add src/telegram/agent/state.ts src/telegram/agent/llm.ts src/telegram/agent/decision.ts src/telegram/agent/engine.ts test/agent-llm.test.ts
git commit -m "feat(agent): risk guardrail + Darwinian wiring in engine and LLM"
```

---

### Task 9: Config example + final verification

**Files:**
- Modify: `vexis.config.example.json`

- [ ] **Step 1: Update example config**

`vexis.config.example.json` — inside `"agent"`, after `"slPct"`, add:

```json
		"risks": {
			"enabled": true,
			"minTokenFeesSol": 30,
			"maxBundlePct": 30,
			"maxBotHoldersPct": 30,
			"maxTop10Pct": 60,
			"maxPriceVsAthPct": 80,
			"blockWash": true,
			"blockRugpull": true,
			"blockDexScreenerPaid": true,
			"blockDevSoldAll": true
		},
		"darwin": {
			"enabled": true,
			"windowDays": 60,
			"recalcEvery": 5,
			"boostFactor": 1.05,
			"decayFactor": 0.95,
			"weightFloor": 0.3,
			"weightCeiling": 2.5,
			"minSamples": 10
		},
```

- [ ] **Step 2: Full verification**

Run: `npm run check && npm run typecheck && npm test`
Expected: all pass (13+ test files).

- [ ] **Step 3: Update spec status**

Open `docs/superpowers/specs/2026-08-08-agent-risk-screening-design.md` and mark the design as implemented (append a line under the title: `> Status: implemented — see plan 2026-08-08-agent-risk-screening.md`).

- [ ] **Step 4: Commit**

```bash
git add vexis.config.example.json docs/superpowers/specs/2026-08-08-agent-risk-screening-design.md
git commit -m "chore: document agent risk screening config + spec status"
```
