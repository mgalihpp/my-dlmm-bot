# Agent Risk Screening — Design

Date: 2026-08-08

## Problem

The agent's `heuristicScore` only weights fee/active-TVL, organic score, holders, volume, and bin step. It can open a position at ATH, on a rug/bundled token, or on a token with heavy bot/top-holder concentration. Data for `rugScore` and `fromAthPct` already exists in `ScreenedPool` but is not used in scoring, and bundler/bot-holder/wash data is not fetched at all. The LLM candidate payload is equally blind.

## Approach (approved)

Layered, modeled on meridian2: **hard-block severe risks before LLM, weighted soft risks in the heuristic, all thresholds configurable.**

### Data sources (all public, no API key)

- **OKX DEX API** (`https://web3.okx.com`, header `Ok-Access-Client-type: agent-cli`), chain `501`:
  - `GET /api/v6/dex/market/token/advanced-info?chainIndex=501&tokenContractAddress=<mint>` → `bundleHoldingPercent`, `top10HoldPercent`, `devHoldingStatusSellAll`, `dexScreenerPaid`, `devRugPullTokenCount`, `creatorAddress`, `tokenTags`
  - `GET /priapi/v1/dx/market/v2/risk/new/check?chainId=501&tokenContractAddress=<mint>&t=<ts>` → `isLiquidityRemoval` (rugpull), `isWash` (from allAnalysis/swapAnalysis/contractAnalysis/extraAnalysis, `newRiskLabel === "yes"`)
  - `POST /api/v6/dex/market/price-info` `[{chainIndex, tokenContractAddress}]` → `price`, `maxPrice`, `price_vs_ath_pct`
- **Jupiter ChainInsight** (`https://datapi.jup.ag/v1/assets/search?query=<mint>`) → `audit.botHoldersPercentage`, `audit.topHoldersPercentage`, `fees` (global priority+jito SOL)

### Components

1. **`src/services/Okx.ts`** — Effect layer (pattern of `RugCheck.ts`): `Schema`-decoded responses, exponential retry on transient errors, per-request `catchAll` → null at the call site.

2. **`src/services/Jupiter.ts`** — Effect layer, same pattern, one endpoint.

3. **`src/domain/screened.ts`** — add optional fields to `ScreenedPool`:
   `bundlePct`, `top10Pct`, `botHoldersPct`, `globalFeesSol`, `isRugpull`, `isWash`, `devSoldAll`, `dexScreenerPaid`, `priceVsAthPct` (all nullable).

4. **`src/services/Screening.ts`** — after `finalizeScreen`, enrich each pool (concurrency 5): RugCheck score (existing) + OKX advanced-info + risk-check + price-info + Jupiter audit. Each call `catchAll` → leave field null (fail-open).

5. **`src/telegram/agent/guardrails.ts`** — new `checkRisks(pool, cfg)` run in `evaluatePlans` before `checkOpenGuardrail`. Hard-block when:
   - `isRugpull === true` or `isWash === true`
   - `bundlePct > maxBundlePct` (default 30)
   - `botHoldersPct > maxBotHoldersPct` (default 30)
   - `top10Pct > maxTop10Pct` (default 60)
   - `globalFeesSol < minTokenFeesSol` (default 30 SOL)
   - `dexScreenerPaid === true` or `devSoldAll === true`
   - `priceVsAthPct > maxPriceVsAthPct` (default 80, i.e. only open ≤80% of ATH)

6. **`src/telegram/agent/heuristic.ts`** — `heuristicScore(pool, weights?)` keeps the 5 existing metrics and adds safety metrics, all multiplied by optional Darwinian weights, then normalized to 0–100: lower price-vs-ATH bonus, higher rugScore bonus, lower top10/bundle/bot bonus, higher `activePositions` bonus.

7. **`src/services/Config.ts`** — new `agent.risks` config section (read once at startup): `enabled`, `minTokenFeesSol`, `maxBundlePct`, `maxBotHoldersPct`, `maxTop10Pct`, `minFromAthPct`-equivalent (`maxPriceVsAthPct`), `blockWash`, `blockRugpull`, `blockDexScreenerPaid`, `blockDevSoldAll`. `enabled: false` skips the whole risk stage.

8. **`src/telegram/agent/engine.ts`** — call `checkRisks` in the decision loop (before existing guardrail), journal `blockedReason`; send the new risk fields to the LLM candidate payload (`src/telegram/agent/llm.ts` types); store signal snapshot on open, append perf record on close, trigger Darwinian recalc.

9. **`src/telegram/agent/signalWeights.ts`** — load/recalc/persist adaptive weights + perf log (`.vexis-agent-signals.json`); `heuristicScore(pool, weights)` re-weighting; weights summary formatter for the LLM prompt.

10. **`src/telegram/agent/state.ts`** — `AgentPlan.signals` snapshot field; perf log location (`signalWeights.ts` owns it).

### Fallback semantics

- API error / 404 / missing field → `null` → not blocked (fail-open), except explicit flags that the API returned as true.
- RugCheck/OKX/Jupiter runs in parallel with `Promise.allSettled`-style Effect equivalents; per-pool total enrichment time bounded.

### Tests

- `test/agent-guardrails.test.ts` — `checkRisks` cases: rugpull/wash block, bundle/bot/top10 threshold block, fees below threshold block, ATH block, pass when clean, fail-open on missing data.
- `test/okx.test.ts`, `test/jupiter.test.ts` — schema decoding with inline fixtures.
- `test/agent-heuristic.test.ts` — updated weights still monotone in the expected directions.

## Darwinian adaptive signal weights

Learns which screening signals actually predict profitable positions and re-weights the heuristic over time (modeled on meridian2 `signal-weights.js`).

- **Signals tracked** (values we already compute): `organicScore`, `feeActiveTvlRatio`, `volume`, `holders`, `binStep`, `priceVsAthPct`, `rugScore`, `top10Pct`, `bundlePct`, `botHoldersPct`, `globalFeesSol`, `activePositions`. Lower-is-better: `priceVsAthPct`, `top10Pct`, `bundlePct`, `botHoldersPct`; higher-is-better: the rest.
- **Snapshot**: on open, store the candidate's signal values on the plan (`AgentPlan.signals`).
- **Perf record**: on TP/SL close (and external close detection), append `{ closedAt, pnlPct, signals }` to a persisted log.
- **Recalc**: after `cfg.darwin.recalcEvery` (default 5) closes since last recalculation. Compute numeric lift per signal (normalized mean in winners − losers, sign-aware), split into quartiles, boost top quartile ×`boostFactor` (1.05), decay bottom quartile ×`decayFactor` (0.95), clamp to `[weightFloor 0.3, weightCeiling 2.5]`. Require ≥`minSamples` (10) records in `windowDays` (60) window and both wins and losses.
- **Persistence**: `.vexis-agent-signals.json` — weights, last recalc, history, perf log.
- **Application**: `heuristicScore(pool, weights)` — each component's contribution is multiplied by its adaptive weight, then the score is re-normalized 0–100. Fixed base weights (0.35/0.25/0.10/0.10/0.20 + safety share) are kept; Darwinian weights modulate them.
- **LLM prompt**: weights summary injected into `requestSignals` prompt so the LLM also weights learned-proven signals.
- Config: `agent.darwin` — `enabled`, `windowDays` 60, `recalcEvery` 5, `boostFactor` 1.05, `decayFactor` 0.95, `weightFloor` 0.3, `weightCeiling` 2.5, `minSamples` 10.

### Tests (Darwinian)

- `test/agent-signal-weights.test.ts` — lift computation sign-direction, quartile boost/decay, clamping, min-sample gating, persistence round-trip.

## Non-goals

- No dev/deployer blocklist file yet (creator address is surfaced, wiring the blocklist is follow-up).
- No narrative/smart-wallet/KOL cluster scoring (OKX cluster endpoint out of scope for now).
