# Full-LLM Decision Engine (Phase 1)

Date: 2026-08-09

## Summary

Replace the hybrid decision step (deterministic heuristic 80% + LLM advisory 20%) in the DLMM trading agent with **LLM-decided actions**: the LLM directly decides `open`/`hold` per candidate pool. Screening stays deterministic. Risk guardrails remain a hard blocking layer. Position size stays deterministic (`deriveOpenAmount`). Heuristic scoring is kept only as context in the prompt and as candidate selection (top-N) to bound LLM context. On LLM failure (down/timeout/parse-fail), the cycle is **skipped entirely — no trades**.

This is Phase 1 of a two-phase effort. Phase 2 (separate spec) adds observability: strategy performance time-series, signal attribution, risk alerts, queryable journal, live position tracking.

## Goals

- LLM decides `open`/`hold` per candidate pool; no deterministic gate on the decision.
- Screening, risk pre-filter, guardrails, and position sizing remain deterministic and unchanged.
- Anti-hallucination validation: LLM may only reference pools that passed screening.
- LLM failure → skip cycle, no trade, notified via Telegram.
- Journal reflects LLM rationale and validation results.
- Backward-compatible config: no new required fields, `minCandidate` deprecated but still valid.

## Architecture

Single decision-step replacement. `engine.ts` orchestration skeleton (fibers, scheduling, TP/SL, OOR, journaling, live messages, executor) is untouched. No new engine file.

### Per-cycle data flow (new)

```
1. screening (unchanged)
2. risk pre-filter: checkRisks + filterCooldown + filterDuplicates (unchanged)
3. rankPools (heuristic) → top-N maxCandidates  ← candidate SELECTION, not decision
4. LLM decide: [{"pool","action":"open|hold","rationale"}] for each candidate
5. validation layer (validateOpenDecisions) — anti-hallucination
6. guardrails hard-cap (blocking layer, unchanged)
7. execute open, size = deriveOpenAmount (deterministic)
8. journal + live messages
```

### LLM decision prompt (replaces `buildPrompt` in `src/telegram/agent/llm.ts`)

```
You are a portfolio manager for a DLMM liquidity bot. Candidate pools below passed
deterministic screening. Decide for EACH whether to OPEN a new position now or HOLD.
- OPEN = strong fee potential, acceptable risk, fits portfolio context
- HOLD = wait or avoid
Use the heuristic score as context, not the only factor. Weigh risk fields.
Reply with a JSON array only, never markdown:
[{"pool":"<exact pool id>","action":"open|hold","rationale":"..."}]

Candidates:
- pool=<id> heuristic=3.41 feeTvlRatio=0.0234 organic=78 holders=1240 volume=452000 rugScore=1500 top10Pct=8.5 bundlePct=2.1 priceVsAthPct=60 globalFeesSol=120.5 activePositions=4

Signal weights (Darwinian, learned from PnL):
- feeActiveTvlRatio: 1.45 (high)
- ...

Portfolio context: 3/5 open positions, deployed 4.5/10 SOL cap
```

- Heuristic score is context, not a gate.
- Portfolio context line (open count / cap, deployed SOL / cap) so the LLM knows available capacity. No private keys, no token amounts held — only aggregate public numbers.
- `temperature: 0`, `maxRetries: 1`, timeout from `cfg.llm.timeoutMs` (unchanged).

### LLM output

```json
[{"pool":"<exact pool id>","action":"open","rationale":"..."}]
```

`pool` must be an exact candidate pool id; `action` is `"open" | "hold"`; `rationale` one line.

## Validation layer

New pure function in rewritten `src/telegram/agent/decision.ts`:

`validateOpenDecisions(candidates, decisions) → { decisions, dropped }`

- pool must **exact-match** a candidate pool id; unknown id → ignore + log warning, count in `dropped`.
- action not `"open"`/`"hold"` → default `hold`.
- duplicate pool → keep first occurrence.
- candidate without a decision → `hold`.
- response body that fails JSON parse (after code-fence strip) → **skip cycle** (treat as LLM failure).
- Returns `{ decisions, dropped }`; `dropped` is journaled.

## Guardrails & failure mode

- Guardrails unchanged and still run **after** validation as a blocking layer: `checkOpenGuardrail` (per-position cap, total SOL cap, max open positions), `checkDuplicate`, `checkCooldown`, `checkRisks`. Blocked opens journal `guardrail: "blocked"` + `blockedReason`, notified.
- LLM down / timeout / parse-fail → **skip cycle, no trades**. Journal `llmStatus: "failed"`, Telegram notification.
- No `apiKey` configured → skip cycle (no heuristic fallback anymore).
- `llmStatus` values become: `"ok" | "failed" | "skipped"`. `"degraded"` removed.

## Journal / config / state changes

- `JournalCandidate.favorability` removed (advisory layer removed). `rationale` = LLM rationale.
- `JournalCandidate.action` stays: `open | hold | tp | sl | close`.
- Config: `minCandidate` (previously min-score-to-open) is no longer read by the decision path. Field stays in schema for backward compatibility, marked deprecated in a comment. No new config fields.
- `heuristic.ts` `rankPools` keeps its `minCandidate` parameter (candidate selection only, called with `0` as today).
- OOR position decisions (`requestPositionDecisions`, `buildPositionPrompt`) are unchanged — already LLM-decided hold/close.

## Files touched

| File | Action |
|---|---|
| `src/telegram/agent/decision.ts` | Rewrite — remove `combineScore` / `decideCandidates`, add `validateOpenDecisions` |
| `src/telegram/agent/llm.ts` | Replace `buildPrompt`/`parseLlmResponse`/`requestSignals` with decision prompt/parser/`requestOpenDecisions`; keep `buildPositionPrompt`/`requestPositionDecisions` unchanged |
| `src/telegram/agent/engine.ts` | Edit decision step (~lines 670-720): call `requestOpenDecisions` + `validateOpenDecisions`; pass portfolio context; update failure handling to skip cycle |
| `src/telegram/agent/journal.ts` | Remove `favorability` field |
| `src/domain/config.ts` | Comment `minCandidate` as deprecated |
| `src/telegram/agent/format.ts` | Update live "LLM thinking" line if wording references favorability |
| `test/agent-decision.test.ts`, `test/agent-llm.test.ts` | Rewrite for new prompt/parser/validation |

## Error handling

- LLM timeout/network/parse → skip cycle, journal `llmStatus: "failed"`, notify Telegram. Never crash process (existing `Effect.catchAll` pattern).
- RPC / API fetch failure → idle cycle, retry next cycle (unchanged).
- Transaction failure → journal failure, state consistency preserved (unchanged).
- Loop overlap → `state.running` guard skips (unchanged).

## Testing

- `validateOpenDecisions`: valid decisions, unknown pool, bad action, duplicates, missing candidates, malformed JSON → skip/`hold`/`dropped` counts.
- Decision prompt builder: contains candidates, heuristic scores, signal weights, portfolio context, exact JSON instruction.
- Decision parser: fenced code blocks, plain array, invalid entries dropped.
- Engine integration: LLM says open → guardrail blocks (journaled); LLM request fails → cycle skipped, `llmStatus: "failed"`, no execution.
- No new test deps. Tests stay pure/unit with inline fixtures.

## Open scope notes

- Phase 2 (observability) is a separate spec, not part of this work.
- No LLM tool-calling / ReAct loop. `temperature: 0` keeps decisions deterministic and cheap.
- LLM never receives private keys and never controls position size or execution — only the open/hold decision. Execution stays on deterministic code paths.
