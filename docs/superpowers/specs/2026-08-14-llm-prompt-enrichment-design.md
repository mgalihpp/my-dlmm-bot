# LLM Prompt Enrichment — Risk & Age Awareness

Date: 2026-08-14

## Summary

Enrich all 4 LLM call sites with data that already exists in the system but is
currently dropped before the prompt is built. Goal: the AI agent analyzes risk
(rugpull, wash trading, concentration) and position health (OOR cost, position
age, pool age) more intelligently, so it makes fewer doomed recommendations and
better open/hold/close decisions. No new external data sources; no architecture
change; per-call-site prompt enrichment only.

## Goals

- LLM sees every risk/quality field the bot already fetches (no silent dropping).
- LLM sees guardrail thresholds + active cooldowns so it stops recommending
  opens that are guaranteed to be vetoed.
- OOR decisions weigh position age, fee opportunity cost, and open-signal
  snapshot, not just pnlPct + price range.
- Briefing/narrative carry concrete risk numbers (OOR duration, missed fees).
- Risk appetite: AGGRESSIVE — LLM may override heuristic toward OPEN when fee
  potential clearly exceeds risk, provided no hard-veto (guardrail) violation.
- All tests stay offline; fixtures updated with new fields.

## Scope

All 4 call sites in this one change:

1. `buildOpenDecisionPrompt` (src/telegram/agent/llm.ts:64)
2. `buildPositionPrompt` (src/telegram/agent/llm.ts:187)
3. `collectBriefingData` + briefing prompt (src/telegram/agent/briefing.ts)
4. Web narrative prompt (src/web/agent-narrative.ts)

## 1. Data model changes

### `LlmCandidate` (llm.ts:6-21) — add fields already on `ScreenedPool`

- `tvl, activeTvl, mcap, volatility, binStep, baseFeePct, fee, openPositions,
  tokenAgeHours, price, priceChangePct, volumeChangePct, fromAthPct,
  isRugpull, isWash, devSoldAll, dexScreenerPaid`
- `poolAgeHours: number | null` — NEW: from `pool_created_at` via
  `condensePool` (src/lib/screening.ts:130) → `ScreenedPool`
- `swapCount, uniqueTraders, priceTrend` — from `DiscoveryPool` (discovery.ts),
  currently not condensed
- `lpLockedPct: number | null` — already fetched by RugCheck (RugCheck.ts:49),
  currently dropped at Screening.ts:118

Explicitly NOT included: RugCheck risk-name list (`RugCheckRisk[]`) — minimal
path; `rugScore + lpLockedPct + isRugpull/isWash/devSoldAll` carry enough signal
without touching RugCheck/Screening decode boundaries.

### `OorPosition` (llm.ts:25-32) — add

- `positionAgeHours: number | null` — from `PositionPnLData.createdAt`
- `feePerTvl24h: number | null` — from `PositionPnLData.feePerTvl24h`
- `pnlUsd: number | null`, `unrealizedPnl: number | null`
- `amountSol: number | null` — from `AgentPlan.amountSol`
- `openSignals: string | null` — compact 12-signal snapshot from
  `AgentPlan.signals` (state.ts:14), serialized as `name=weight` pairs

### `GuardrailContext` (new small builder, in llm.ts)

Built from `cfg.agent.risks.*` + `maxTotalSol`/`maxOpenPositions`/
`maxSolPerPosition` + active cooldown list. Used by the open prompt only.

## 2. Open prompt structure (buildOpenDecisionPrompt)

```
[role] — existing + appetite note: aggressive, may override heuristic
         when fee potential clearly exceeds risk; never when a
         hard-veto threshold is breached
[Guardrails] —
  hard-veto: bundle>X% botHolders>X% top10>X% priceFromAth>X%
             globalFees<X SOL  (values from cfg.agent.risks.*)
  capacity: x/y positions, z/W SOL deployed, size cap S SOL/position
  cooldown: poolA (until …), poolB …
[Field notes] — interpretation for: isRugpull, isWash, devSoldAll,
  dexScreenerPaid, volatility, tokenAgeHours, poolAgeHours, priceTrend,
  swapCount, uniqueTraders, lpLockedPct, priceChangePct, volumeChangePct
[Candidates] — one line per pool, all LlmCandidate fields
[Signal weights] — unchanged
[Portfolio context] — unchanged
```

## 3. OOR prompt structure (buildPositionPrompt)

```
[role] — existing + weigh position age and fee opportunity cost:
         young position + near-range → hold; old position + OOR +
         losing + low feePerTvl → close
[Positions] — one line per position:
  pool pair pnlPct pnlUsd unrealizedPnl amountSol minPrice maxPrice
  poolActivePrice positionAgeHours feePerTvl24h openSignals
```

No guardrail section here (close decisions have no threshold vetoes).

## 4. Briefing & narrative enrichment

### Briefing (briefing.ts:43-85)

- Market lines (top-5): add `rugScore, holders, organicScore, tvl, volatility,
  tokenAgeHours, poolAgeHours`
- Portfolio lines: add position age hours + `feePerTvl24h` so the briefing can
  state concrete OOR cost (e.g. "posisi X OOR 3 hari, rugi 5%, fee dilewat
  0.8 SOL")

### Web narrative (agent-narrative.ts:39-93)

- Add 2 context lines from existing journal/stats data:
  `Deployed: X/Y SOL, posisi OOR: n, stats: winRate/avg/total PnL`
- Rationale truncation stays at 80 chars

## 5. Testing

- Update fixtures: agent-llm.test.ts, screening-enrichment.test.ts,
  agent-briefing.test.ts, web-agent-page.test.ts (narrative)
- New assertions:
  - open prompt contains a `Guardrail` section with actual config values
  - open prompt contains `poolAgeHours=` / `volatility=` / `tokenAgeHours=`
  - OOR prompt contains `positionAgeHours=` and `feePerTvl24h=`
  - briefing market line contains `poolAgeHours`
  - narrative contains deployed/OOR/stats lines
- All offline; LLM responses stay mocked.

## Out of scope

- New data sources (on-chain creation time for pools is unavailable; API
  `created_at`/`pool_created_at` used instead).
- Refactoring prompt code into a unified context builder (approach C).
- Changing guardrail veto logic or thresholds.
- Position "started OOR at" tracking (not tracked today).
