# LLM Prompt Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed every already-fetched risk/age field plus guardrail thresholds to the 4 LLM call sites so the agent analyzes rugpull/OOR risk and portfolio health more intelligently.

**Architecture:** Per-call-site enrichment, no architecture change. Extend `ScreenedPool`/`LlmCandidate`/`OorPosition`/briefing data interfaces with fields that already exist upstream, build a `buildGuardrailSection` helper in llm.ts, wire new fields through engine.ts/briefing.ts/agent-narrative.ts.

**Tech Stack:** TypeScript strict, Effect, Vitest, Biome. ESM-only, `.js` import extensions.

## Global Constraints

- Follow spec: `docs/superpowers/specs/2026-08-14-llm-prompt-enrichment-design.md`.
- Commits: SKIP unless the user explicitly asks (project AGENTS.md rule — never commit on your own).
- All new `ScreenedPool` fields optional (`?:` or `| null`) — `condensePool` must never crash on missing upstream data.
- Use `numeric()`/`round()`/`fix()` helpers from `src/lib/screening.ts` for sanitizing upstream values.
- No new dependencies. No network in tests.
- Run `npm run check && npm run typecheck && npm test` after every task before moving on.
- Response-parsing functions (`parseOpenDecisionResponse` etc.) are unchanged — the LLM response contract is untouched.

---

### Task 1: ScreenedPool — age, activity, trend, LP lock fields

**Files:**
- Modify: `src/domain/screened.ts`
- Modify: `src/lib/screening.ts:130-166` (condensePool)
- Modify: `src/services/Screening.ts:100-131` (poolMut + lpLockedPct)
- Test: `test/screening.test.ts:107-118`, `test/screening-enrichment.test.ts:131-143`

**Interfaces:**
- Consumes: `DiscoveryPool.pool_created_at` (already in schema), `DiscoveryPool.swap_count`, `DiscoveryPool.unique_traders`, `DiscoveryPool.price_trend` (all optional in schema), `RugCheckSummary.lpLockedPct` (already in RugCheck.ts:49).
- Produces: `ScreenedPool` gains `poolAgeHours: number | null`, `swapCount: number`, `uniqueTraders: number`, `priceTrend: string | null`, `lpLockedPct?: number | null`.

- [ ] **Step 1: Write the failing tests**

In `test/screening.test.ts`, fixture `pool()` at line 11 — add `pool_created_at: Date.now() - 24 * 3_600_000,` to the object (after `pool_type: "dlmm"`), then extend the `condensePool` test:

```ts
describe("condensePool", () => {
	it("rounds, fixes and falls back", () => {
		const c = condensePool(pool());
		expect(c.pool).toBe("PoolAddr");
		expect(c.tvl).toBe(10001);
		expect(c.mcap).toBe(1000000);
		expect(c.volatility).toBe(0.1235);
		expect(c.binStep).toBe(20);
		expect(c.priceChangePct).toBeNull();
		expect(c.tokenAgeHours).toBe(5);
	});
	it("condenses pool age and activity fields", () => {
		const c = condensePool(
			pool({
				swap_count: 1234,
				unique_traders: 567,
				price_trend: "up",
			}),
		);
		expect(c.poolAgeHours).toBe(24);
		expect(c.swapCount).toBe(1234);
		expect(c.uniqueTraders).toBe(567);
		expect(c.priceTrend).toBe("up");
	});
	it("tolerates missing pool_created_at", () => {
		const c = condensePool(pool({ pool_created_at: undefined }));
		expect(c.poolAgeHours).toBeNull();
	});
});
```

In `test/screening-enrichment.test.ts` "attaches jupiter + rugcheck risk fields to screened pools" test (line 132), add assertions (the RugCheck mock at line 81-91 already returns `lpLockedPct: 0`, and the poolFixture already has `pool_created_at`):

```ts
expect(pool.rugScore).toBe(1200);
expect(pool.lpLockedPct).toBe(0);
expect(pool.poolAgeHours).toBe(24);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/screening.test.ts test/screening-enrichment.test.ts`
Expected: FAIL — `poolAgeHours`/`lpLockedPct`/`swapCount` undefined; and the pool fixture without `pool_created_at` may make the required-schema decode fail (that is expected — see Step 3).

- [ ] **Step 3: Implement the minimal code**

`src/domain/screened.ts` — add to the interface (keep existing fields):

```ts
	poolAgeHours: number | null;
	swapCount: number;
	uniqueTraders: number;
	priceTrend: string | null;
	lpLockedPct?: number | null;
```

`src/lib/screening.ts` `condensePool` — add before `return`:

```ts
	const poolCreatedAt = numeric(pool.pool_created_at);
```

and inside the returned object (after `tokenXAddress`):

```ts
		poolAgeHours:
			poolCreatedAt != null
				? Math.floor((Date.now() - poolCreatedAt) / 3_600_000)
				: null,
		swapCount: Math.round(pool.swap_count ?? 0),
		uniqueTraders: Math.round(pool.unique_traders ?? 0),
		priceTrend:
			typeof pool.price_trend === "string" ? pool.price_trend : null,
```

`src/services/Screening.ts` — add to the `poolMut` type (line 100-110):

```ts
								lpLockedPct?: number | null;
```

and after `poolMut.rugScore = s?.score ?? null;` (line 118):

```ts
							poolMut.lpLockedPct = s?.lpLockedPct ?? null;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/screening.test.ts test/screening-enrichment.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full checks**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green. (The `pool_created_at` schema is already required from the earlier pool-age change, so no other fixture needs it.)

---

### Task 2: Open-decision prompt — full candidate fields + guardrail section

**Files:**
- Modify: `src/telegram/agent/llm.ts` (LlmCandidate interface, new GuardrailContext/buildGuardrailSection, buildOpenDecisionPrompt, requestOpenDecisions)
- Modify: `src/telegram/agent/engine.ts:996-1024` (candidate mapping + guardrail section + pass-through)
- Test: `test/agent-llm.test.ts`

**Interfaces:**
- Consumes: `ScreenedPool` (Task 1 fields), `ResolvedAgentConfig.risks` + `maxTotalSol`/`maxOpenPositions`/`maxSolPerPosition`, `AgentState.cooldowns`, `deployedSol`/`openPositions` (already in scope at engine.ts:1014).
- Produces:
  - `GuardrailContext` interface + `buildGuardrailSection(g: GuardrailContext): string`
  - `buildOpenDecisionPrompt(candidates, weightsSummary?, portfolioContext?, guardrailsSection?)` — 4th optional param
  - `requestOpenDecisions(opts)` — new `opts.guardrails?: string`

- [ ] **Step 1: Write the failing tests**

In `test/agent-llm.test.ts`, add imports:

```ts
import {
	buildGuardrailSection,
	...
} from "../src/telegram/agent/llm.js";
```

Add a new describe block:

```ts
describe("buildGuardrailSection", () => {
	const ctx = {
		maxBundlePct: 30,
		maxBotHoldersPct: 30,
		maxTop10Pct: 60,
		maxPriceVsAthPct: 80,
		minTokenFeesSol: 30,
		maxTotalSol: 3,
		maxOpenPositions: 4,
		maxSolPerPosition: 0.5,
		deployedSol: 1.2,
		openPositions: 2,
		cooldowns: [
			{
				pool: "PoolC",
				poolName: "CCC/SOL",
				until: "2026-08-15T00:00:00.000Z",
				reason: "rug check",
			},
		],
	};
	it("renders thresholds, capacity and cooldowns", () => {
		const s = buildGuardrailSection(ctx);
		expect(s).toContain("maxBundlePct=30%");
		expect(s).toContain("maxPriceVsAthPct=80%");
		expect(s).toContain("minTokenFeesSol=30 SOL");
		expect(s).toContain("2/4 open positions");
		expect(s).toContain("CCC/SOL");
		expect(s).toContain("rug check");
	});
	it("skips unset thresholds and empty cooldowns", () => {
		const s = buildGuardrailSection({
			...ctx,
			maxBundlePct: null,
			maxBotHoldersPct: null,
			maxTop10Pct: null,
			maxPriceVsAthPct: null,
			minTokenFeesSol: null,
			cooldowns: [],
		});
		expect(s).not.toContain("maxBundlePct");
		expect(s).toContain("cooldown: none");
	});
});
```

Extend the "includes optional risk fields when present" test (line 93) with a full-field candidate and guardrail section:

```ts
it("includes age, activity, trend and hard-flag fields when present", () => {
	const prompt = buildOpenDecisionPrompt(
		[
			{
				pool: "Pool111",
				pair: "FOO/SOL",
				heuristic: 80,
				feeActiveTvlRatio: 0.05,
				organicScore: 70,
				holders: 1000,
				volume: 50000,
				tvl: 20000,
				activeTvl: 15000,
				mcap: 1_000_000,
				volatility: 0.12,
				binStep: 100,
				baseFeePct: 0.003,
				fee: 100,
				openPositions: 20,
				tokenAgeHours: 48,
				price: 1,
				priceChangePct: 5.2,
				volumeChangePct: -10.1,
				fromAthPct: 0.6,
				poolAgeHours: 24,
				swapCount: 1234,
				uniqueTraders: 567,
				priceTrend: "up",
				lpLockedPct: 80,
				isRugpull: false,
				isWash: false,
				devSoldAll: true,
				dexScreenerPaid: false,
			},
		],
		undefined,
		undefined,
		buildGuardrailSection({
			maxBundlePct: 30,
			maxBotHoldersPct: 30,
			maxTop10Pct: 60,
			maxPriceVsAthPct: 80,
			minTokenFeesSol: 30,
			maxTotalSol: 3,
			maxOpenPositions: 4,
			maxSolPerPosition: 0.5,
			deployedSol: 1.2,
			openPositions: 2,
			cooldowns: [],
		}),
	);
	expect(prompt).toContain("poolAgeHours=24");
	expect(prompt).toContain("tokenAgeHours=48");
	expect(prompt).toContain("volatility=0.1200");
	expect(prompt).toContain("priceTrend=up");
	expect(prompt).toContain("devSoldAll=true");
	expect(prompt).toContain("Guardrail thresholds");
	expect(prompt).toContain("maxBundlePct=30%");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-llm.test.ts`
Expected: FAIL — `buildGuardrailSection` not exported; `poolAgeHours=` missing.

- [ ] **Step 3: Implement the minimal code**

`src/telegram/agent/llm.ts`:

1. Extend `LlmCandidate` (after `activePositions?: number | null;`):

```ts
	tvl?: number | null;
	activeTvl?: number | null;
	mcap?: number | null;
	volatility?: number | null;
	binStep?: number | null;
	baseFeePct?: number | null;
	fee?: number | null;
	openPositions?: number | null;
	tokenAgeHours?: number | null;
	price?: number | null;
	priceChangePct?: number | null;
	volumeChangePct?: number | null;
	fromAthPct?: number | null;
	poolAgeHours?: number | null;
	swapCount?: number | null;
	uniqueTraders?: number | null;
	priceTrend?: string | null;
	lpLockedPct?: number | null;
	isRugpull?: boolean | null;
	isWash?: boolean | null;
	devSoldAll?: boolean | null;
	dexScreenerPaid?: boolean | null;
```

2. Add after the `LlmCandidate` interface:

```ts
export interface CooldownEntry {
	pool: string;
	poolName: string;
	until: string;
	reason: string;
}

export interface GuardrailContext {
	maxBundlePct: number | null;
	maxBotHoldersPct: number | null;
	maxTop10Pct: number | null;
	maxPriceVsAthPct: number | null;
	minTokenFeesSol: number | null;
	maxTotalSol: number;
	maxOpenPositions: number;
	maxSolPerPosition: number;
	deployedSol: number;
	openPositions: number;
	cooldowns: readonly CooldownEntry[];
}

export function buildGuardrailSection(g: GuardrailContext): string {
	const lines = [
		"Guardrail thresholds (hard veto — opens breaching any of these are rejected by the bot):",
	];
	if (g.maxBundlePct != null) lines.push(`- maxBundlePct=${g.maxBundlePct}%`);
	if (g.maxBotHoldersPct != null)
		lines.push(`- maxBotHoldersPct=${g.maxBotHoldersPct}%`);
	if (g.maxTop10Pct != null) lines.push(`- maxTop10Pct=${g.maxTop10Pct}%`);
	if (g.maxPriceVsAthPct != null)
		lines.push(
			`- maxPriceVsAthPct=${g.maxPriceVsAthPct}% (price as % of 24h high)`,
		);
	if (g.minTokenFeesSol != null)
		lines.push(`- minTokenFeesSol=${g.minTokenFeesSol} SOL`);
	lines.push(
		`- capacity: ${g.openPositions}/${g.maxOpenPositions} open positions, deployed ${g.deployedSol.toFixed(2)}/${g.maxTotalSol} SOL cap, max ${g.maxSolPerPosition} SOL per position`,
	);
	if (g.cooldowns.length > 0) {
		lines.push("- cooldown (do not open):");
		for (const c of g.cooldowns) {
			lines.push(`  - ${c.poolName || c.pool} until ${c.until} (${c.reason})`);
		}
	} else {
		lines.push("- cooldown: none");
	}
	return lines.join("\n");
}
```

3. Rewrite the candidate line builder in `buildOpenDecisionPrompt` (replace the current `.map(...)` body) — join array of parts instead of one giant template:

```ts
	const table = candidates
		.map((c) => {
			const parts = [
				`pool=${c.pool}`,
				`pair=${c.pair}`,
				`heuristic=${c.heuristic}`,
				`feeTvlRatio=${c.feeActiveTvlRatio.toFixed(4)}`,
				`organic=${c.organicScore}`,
				`holders=${c.holders}`,
				`volume=${c.volume}`,
			];
			return parts
				.concat(
					...(c.tvl != null ? [`tvl=${c.tvl}`] : []),
					...(c.activeTvl != null ? [`activeTvl=${c.activeTvl}`] : []),
					...(c.mcap != null ? [`mcap=${c.mcap}`] : []),
					...(c.fee != null ? [`fee=${c.fee}`] : []),
					...(c.volatility != null
						? [`volatility=${c.volatility.toFixed(4)}`]
						: []),
					...(c.binStep != null ? [`binStep=${c.binStep}`] : []),
					...(c.baseFeePct != null ? [`baseFeePct=${c.baseFeePct}`] : []),
					...(c.price != null ? [`price=${c.price}`] : []),
					...(c.priceChangePct != null
						? [`priceChangePct=${c.priceChangePct}`]
						: []),
					...(c.volumeChangePct != null
						? [`volumeChangePct=${c.volumeChangePct}`]
						: []),
					...(c.fromAthPct != null ? [`fromAthPct=${c.fromAthPct}`] : []),
					...(c.tokenAgeHours != null
						? [`tokenAgeHours=${c.tokenAgeHours}`]
						: []),
					...(c.poolAgeHours != null
						? [`poolAgeHours=${c.poolAgeHours}`]
						: []),
					...(c.swapCount != null ? [`swapCount=${c.swapCount}`] : []),
					...(c.uniqueTraders != null
						? [`uniqueTraders=${c.uniqueTraders}`]
						: []),
					...(c.priceTrend != null ? [`priceTrend=${c.priceTrend}`] : []),
					...(c.lpLockedPct != null ? [`lpLockedPct=${c.lpLockedPct}`] : []),
					...(c.isRugpull != null ? [`isRugpull=${c.isRugpull}`] : []),
					...(c.isWash != null ? [`isWash=${c.isWash}`] : []),
					...(c.devSoldAll != null ? [`devSoldAll=${c.devSoldAll}`] : []),
					...(c.dexScreenerPaid != null
						? [`dexScreenerPaid=${c.dexScreenerPaid}`]
						: []),
					...(c.priceVsAthPct != null
						? [`priceVsAthPct=${c.priceVsAthPct}`]
						: []),
					...(c.rugScore != null ? [`rugScore=${c.rugScore}`] : []),
					...(c.top10Pct != null ? [`top10Pct=${c.top10Pct}`] : []),
					...(c.bundlePct != null ? [`bundlePct=${c.bundlePct}`] : []),
					...(c.botHoldersPct != null
						? [`botHoldersPct=${c.botHoldersPct}`]
						: []),
					...(c.globalFeesSol != null
						? [`globalFeesSol=${c.globalFeesSol}`]
						: []),
					...(c.activePositions != null
						? [`activePositions=${c.activePositions}`]
						: []),
				)
				.join(" ");
		})
		.join("\n");
```

4. Update `buildOpenDecisionPrompt` signature and body:

```ts
export function buildOpenDecisionPrompt(
	candidates: readonly LlmCandidate[],
	weightsSummary?: string,
	portfolioContext?: string,
	guardrailsSection?: string,
): string {
	// table builder from step 3.3 stays
	return [
		"You are a portfolio manager for a DLMM liquidity bot. Candidate pools below passed deterministic screening.",
		"Decide for EACH whether to OPEN a new position now or HOLD.",
		"- OPEN = strong fee potential, acceptable risk, fits portfolio context",
		"- HOLD = wait or avoid",
		"You may override the heuristic toward OPEN when fee potential clearly exceeds risk, but never toward a candidate breaching the guardrail thresholds below.",
		"Use the heuristic score as context, not the only factor. Weigh risk fields.",
		"Risk field notes: rugScore is RugCheck's 0-2500 score, lower = lower rug-pull risk, but no score (not even 1) means zero risk — meme tokens can still go to zero. priceVsAthPct is % of ATH. top10Pct/bundlePct/botHoldersPct are percentages, lower is better. isRugpull/isWash/devSoldAll/dexScreenerPaid are hard-flag booleans — treat any true as a strong reason to HOLD. volatility is 24h price volatility. tokenAgeHours/poolAgeHours are ages in hours. priceTrend is the 24h trend direction. swapCount/uniqueTraders measure real activity. lpLockedPct is RugCheck's LP lock %.",
		'Reply with a JSON array only, never markdown: [{"pool":"<exact pool id>","action":"open|hold","rationale":"..."}]',
		...(guardrailsSection ? ["", guardrailsSection] : []),
		"",
		"Candidates:",
		table,
		...(weightsSummary ? ["", weightsSummary] : []),
		...(portfolioContext ? ["", portfolioContext] : []),
	].join("\n");
}
```

5. `requestOpenDecisions` — add `guardrails?: string;` to opts and pass it:

```ts
	const prompt = buildOpenDecisionPrompt(
		opts.candidates,
		opts.weightsSummary,
		opts.portfolioContext,
		opts.guardrails,
	);
```

`src/telegram/agent/engine.ts` — in the candidate mapping (line 996), extend the object with the new fields (all from `p`, the `ScreenedPool`):

```ts
		tvl: p.tvl,
		activeTvl: p.activeTvl,
		mcap: p.mcap,
		volatility: p.volatility,
		binStep: p.binStep,
		baseFeePct: p.baseFeePct,
		fee: p.fee,
		openPositions: p.openPositions,
		tokenAgeHours: p.tokenAgeHours ?? null,
		price: p.price,
		priceChangePct: p.priceChangePct ?? null,
		volumeChangePct: p.volumeChangePct ?? null,
		fromAthPct: p.fromAthPct ?? null,
		poolAgeHours: p.poolAgeHours ?? null,
		swapCount: p.swapCount,
		uniqueTraders: p.uniqueTraders,
		priceTrend: p.priceTrend ?? null,
		lpLockedPct: p.lpLockedPct ?? null,
		isRugpull: p.isRugpull ?? null,
		isWash: p.isWash ?? null,
		devSoldAll: p.devSoldAll ?? null,
		dexScreenerPaid: p.dexScreenerPaid ?? null,
```

Then build the guardrail section before the `requestOpenDecisions` call (after `portfolioContext`, line 1014):

```ts
	const guardrailsSection = cfg.risks.enabled
		? buildGuardrailSection({
				maxBundlePct: cfg.risks.maxBundlePct,
				maxBotHoldersPct: cfg.risks.maxBotHoldersPct,
				maxTop10Pct: cfg.risks.maxTop10Pct,
				maxPriceVsAthPct: cfg.risks.maxPriceVsAthPct,
				minTokenFeesSol: cfg.risks.minTokenFeesSol,
				maxTotalSol: cfg.maxTotalSol,
				maxOpenPositions: cfg.maxOpenPositions,
				maxSolPerPosition: cfg.maxSolPerPosition,
				deployedSol,
				openPositions,
				cooldowns: rt.state.cooldowns.filter(
					(c) => Date.parse(c.until) > Date.now(),
				),
			})
		: undefined;
```

and pass it:

```ts
	const {
		decisions: rawDecisions,
		failed,
		errorMessage,
	} = await requestOpenDecisions({
		cfg,
		candidates: llmCandidates,
		weightsSummary: weightsSummary(weights),
		portfolioContext,
		guardrails: guardrailsSection,
	});
```

Add `buildGuardrailSection` to the llm.ts import in engine.ts.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/agent-llm.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full checks**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

---

### Task 3: OOR-decision prompt — position age, fees, open signals

**Files:**
- Modify: `src/telegram/agent/llm.ts` (OorPosition interface + buildPositionPrompt)
- Modify: `src/telegram/agent/engine.ts:592-623` (oorPositions.push mapping)
- Test: `test/agent-llm.test.ts`

**Interfaces:**
- Consumes: `PositionPnLData` (`createdAt`, `feePerTvl24h`, `pnlUsd` — strings; `unrealizedPnl.balancesSol`), `AgentPlan` (`amountSol`, `signals: Record<string, number>`).
- Produces: `OorPosition` gains `positionAgeHours?: number | null`, `feePerTvl24h?: string | null`, `pnlUsd?: string | null`, `unrealizedPnlSol?: string | null`, `amountSol?: number | null`, `openSignals?: string | null`.

- [ ] **Step 1: Write the failing tests**

In `test/agent-llm.test.ts`, add to the `buildPositionPrompt` describe:

```ts
	it("renders position age, fees, pnl and open signals when present", () => {
		const prompt = buildPositionPrompt([
			{
				pool: "PoolA",
				poolName: "AAA/SOL",
				pnlPct: -2.5,
				minPrice: "1",
				maxPrice: "2",
				poolActivePrice: "3",
				positionAgeHours: 48,
				feePerTvl24h: "0.0012",
				pnlUsd: "-12.5",
				unrealizedPnlSol: "0.05",
				amountSol: 0.5,
				openSignals: "feeActiveTvlRatio:1.45,volume:1.1",
			},
		]);
		expect(prompt).toContain("positionAgeHours=48");
		expect(prompt).toContain("feePerTvl24h=0.0012");
		expect(prompt).toContain("pnlUsd=-12.5");
		expect(prompt).toContain("amountSol=0.5");
		expect(prompt).toContain("openSignals=feeActiveTvlRatio:1.45,volume:1.1");
		expect(prompt).toContain("position age");
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-llm.test.ts`
Expected: FAIL — `positionAgeHours=48` missing, role text without "position age".

- [ ] **Step 3: Implement the minimal code**

`src/telegram/agent/llm.ts` — extend `OorPosition`:

```ts
	positionAgeHours?: number | null;
	feePerTvl24h?: string | null;
	pnlUsd?: string | null;
	unrealizedPnlSol?: string | null;
	amountSol?: number | null;
	openSignals?: string | null;
```

Rewrite `buildPositionPrompt` table row (append optionals):

```ts
	const table = positions
		.map(
			(p) =>
				`- pool=${p.pool} pair=${p.poolName} pnlPct=${p.pnlPct.toFixed(2)}% minPrice=${p.minPrice} maxPrice=${p.maxPrice}${p.poolActivePrice != null ? ` poolActivePrice=${p.poolActivePrice}` : ""}${p.positionAgeHours != null ? ` positionAgeHours=${p.positionAgeHours}` : ""}${p.feePerTvl24h != null ? ` feePerTvl24h=${p.feePerTvl24h}` : ""}${p.pnlUsd != null ? ` pnlUsd=${p.pnlUsd}` : ""}${p.unrealizedPnlSol != null ? ` unrealizedPnlSol=${p.unrealizedPnlSol}` : ""}${p.amountSol != null ? ` amountSol=${p.amountSol}` : ""}${p.openSignals != null ? ` openSignals=${p.openSignals}` : ""}`,
		)
		.join("\n");
```

Update the role text (replace the second line):

```ts
		"Decide for each position: `hold` (keep, price may re-enter range) or `close` (zap out to WSOL). Weigh pnlPct, how far the active price sits from the range, position age, and fee opportunity cost: a young position near range is worth holding; an old position many hours out of range that is losing and earning low fees is worth closing. openSignals is the signal snapshot from when the position was opened.",
```

`src/telegram/agent/engine.ts` — extend the `oorPositions.push` (line 615):

```ts
			oorPositions.push({
				pool: plan.pool,
				poolName: plan.poolName,
				pnlPct: pct ?? 0,
				minPrice: pos.minPrice,
				maxPrice: pos.maxPrice,
				poolActivePrice: pos.poolActivePrice,
				positionAgeHours:
					pos.createdAt != null && pos.createdAt > 0
						? Math.floor((Date.now() - pos.createdAt) / 3_600_000)
						: null,
				feePerTvl24h: pos.feePerTvl24h,
				pnlUsd: pos.pnlUsd,
				unrealizedPnlSol: pos.unrealizedPnl?.balancesSol ?? null,
				amountSol: plan.amountSol,
				openSignals: plan.signals
					? Object.entries(plan.signals)
							.sort((a, b) => b[1] - a[1])
							.map(([name, w]) => `${name}:${w}`)
							.join(",")
					: null,
			});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/agent-llm.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full checks**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

---

### Task 4: Briefing — richer market + portfolio lines

**Files:**
- Modify: `src/telegram/agent/briefing.ts` (BriefingPoolLine, BriefingMarketLine, buildBriefingPrompt, collectBriefingData)
- Test: `test/agent-briefing.test.ts`

**Interfaces:**
- Consumes: `ScreenedPool` (Task 1 fields), `PositionPnLData.feePerTvl24h`, `AgentPlan.openedAt`.
- Produces: `BriefingPoolLine` gains `ageHours: number | null`, `feePerTvl24h: string | null`; `BriefingMarketLine` gains `rugScore: number | null`, `holders: number`, `organicScore: number`, `tvl: number`, `volatility: number`, `tokenAgeHours: number | null`, `poolAgeHours: number | null`.

- [ ] **Step 1: Write the failing tests**

In `test/agent-briefing.test.ts`, update `DATA`:

```ts
const DATA: BriefingData = {
	portfolio: [
		{
			poolName: "WIF/SOL",
			amountSol: 0.5,
			pnlPct: 12.3,
			ageHours: 72,
			feePerTvl24h: "0.0042",
		},
	],
	// ... existing fields unchanged ...
	market: [
		{
			name: "BONK/SOL",
			heuristic: 87,
			feeActiveTvlRatio: 0.012,
			volume: 500_000,
			priceVsAthPct: 45,
			rugScore: 900,
			holders: 10_000,
			organicScore: 80,
			tvl: 150_000,
			volatility: 0.25,
			tokenAgeHours: 96,
			poolAgeHours: 48,
		},
	],
};
```

Add assertions to the first test:

```ts
		expect(prompt).toContain("ageHours=72");
		expect(prompt).toContain("feePerTvl24h=0.0042");
		expect(prompt).toContain("rugScore=900");
		expect(prompt).toContain("poolAgeHours=48");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-briefing.test.ts`
Expected: FAIL — `ageHours=72` missing. (Type error on DATA first — expected.)

- [ ] **Step 3: Implement the minimal code**

`src/telegram/agent/briefing.ts`:

1. Interfaces:

```ts
export interface BriefingPoolLine {
	poolName: string;
	amountSol: number;
	pnlPct: number | null;
	ageHours: number | null;
	feePerTvl24h: string | null;
}

export interface BriefingMarketLine {
	name: string;
	heuristic: number;
	feeActiveTvlRatio: number;
	volume: number;
	priceVsAthPct: number | null;
	rugScore: number | null;
	holders: number;
	organicScore: number;
	tvl: number;
	volatility: number;
	tokenAgeHours: number | null;
	poolAgeHours: number | null;
}
```

2. `buildBriefingPrompt` portfolio line:

```ts
					.map(
						(p) =>
							`- ${p.poolName} ${p.amountSol} SOL pnl=${p.pnlPct == null ? "n/a" : `${p.pnlPct.toFixed(2)}%`}${p.ageHours != null ? ` ageHours=${p.ageHours}` : ""}${p.feePerTvl24h != null ? ` feePerTvl24h=${p.feePerTvl24h}` : ""}`,
					)
```

3. Market line:

```ts
					.map(
						(m) =>
							`- ${m.name} heuristic=${m.heuristic} feeTvlRatio=${m.feeActiveTvlRatio.toFixed(4)} volume=${m.volume} rugScore=${m.rugScore ?? "n/a"} holders=${m.holders} organic=${m.organicScore} tvl=${m.tvl} volatility=${m.volatility.toFixed(4)}${m.priceVsAthPct != null ? ` priceVsAthPct=${m.priceVsAthPct}` : ""}${m.tokenAgeHours != null ? ` tokenAgeHours=${m.tokenAgeHours}` : ""}${m.poolAgeHours != null ? ` poolAgeHours=${m.poolAgeHours}` : ""}`,
					)
```

4. Role text — add one line before the "Reply" instruction area (after the "Language: Indonesian..." line):

```ts
		"For portfolio lines, flag position age and feePerTvl24h when they indicate risk (old out-of-range position, low earned fees).",
```

5. `collectBriefingData` portfolio push (line 158):

```ts
			portfolio.push({
				poolName: plan.poolName,
				amountSol: plan.amountSol,
				pnlPct: pnlPctValue(pos),
				ageHours:
					plan.openedAt != null
						? Math.floor(
								(Date.now() - Date.parse(plan.openedAt)) / 3_600_000,
							)
						: null,
				feePerTvl24h: pos.feePerTvl24h,
			});
```

6. Market push (line 180):

```ts
			market.push({
				name: p.name,
				heuristic: heuristicScore(p, sw.weights),
				feeActiveTvlRatio: p.feeActiveTvlRatio,
				volume: p.volume,
				priceVsAthPct: p.priceVsAthPct ?? null,
				rugScore: p.rugScore ?? null,
				holders: p.holders,
				organicScore: p.organicScore,
				tvl: p.tvl,
				volatility: p.volatility,
				tokenAgeHours: p.tokenAgeHours ?? null,
				poolAgeHours: p.poolAgeHours ?? null,
			});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/agent-briefing.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full checks**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

---

### Task 5: Web narrative — deployed/active/stats context

**Files:**
- Modify: `src/web/agent-narrative.ts` (buildNarrativePrompt)
- Test: `test/agent-narrative.test.ts`

**Interfaces:**
- Consumes: `AgentState.plans` (`amountSol`, `positionAddress`), `tradeStats` + `loadSignalWeights` from `../telegram/agent/stats.js` / `signalWeights.js`.
- Produces: `buildNarrativePrompt` output gains two context lines. NOTE: design deviation — "posisi OOR: n" is not computable from state/journal (OOR status is not persisted); replaced with active position count.

- [ ] **Step 1: Write the failing tests**

In `test/agent-narrative.test.ts` "handles empty journal and empty state sections" (line 211), add:

```ts
		expect(prompt).toContain("Deployed:");
		expect(prompt).toContain("posisi aktif:");
```

And in the first test (line 188), after the existing assertions:

```ts
		expect(prompt).toContain("Stats:");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-narrative.test.ts`
Expected: FAIL — "Deployed:" missing.

- [ ] **Step 3: Implement the minimal code**

`src/web/agent-narrative.ts`:

1. Imports (add to existing):

```ts
import { loadSignalWeights } from "../telegram/agent/signalWeights.js";
import { tradeStats } from "../telegram/agent/stats.js";
```

2. In `buildNarrativePrompt`, before the `return [`:

```ts
	const deployedSol = state.plans.reduce(
		(sum, p) => sum + (p.amountSol ?? 0),
		0,
	);
	const activePositions = state.plans.filter(
		(p) => p.positionAddress != null,
	).length;
	const stats = tradeStats(loadSignalWeights().perf);
	const statsLine =
		stats.closes > 0
			? `closes=${stats.closes} winRate=${Math.round(stats.winRate ?? 0)}% avg=${(stats.avgPnlPct ?? 0).toFixed(2)}% total=${(stats.totalPnlPct ?? 0).toFixed(2)}%`
			: "no closed trades yet";
```

3. In the returned array, after `\`Total cycle sejauh ini: ${state.cycle}.\``, add:

```ts
		"",
		`Deployed: ${deployedSol.toFixed(2)} SOL, posisi aktif: ${activePositions}.`,
		`Stats: ${statsLine}`,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/agent-narrative.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full checks**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

---

### Task 6: Final verification

**Files:** none.

- [ ] **Step 1: Full check**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green, 44 test files passing.

- [ ] **Step 2: Grep sanity — new fields reach the prompt builders**

Run:
```
rg -n "poolAgeHours|positionAgeHours|feePerTvl24h|openSignals|Guardrail thresholds" src/telegram/agent src/web src/services
```
Expected: occurrences in llm.ts, engine.ts, briefing.ts, agent-narrative.ts, screening.ts, Screening.ts, and the domain/lib files — no orphan references.

- [ ] **Step 3: Report**

Summarize the change, note the narrative "posisi OOR" → "posisi aktif" deviation, and ask the user whether they want a commit.
