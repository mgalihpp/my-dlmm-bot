# AI agent implementation notes

The agent code is under `src/telegram/agent/`. The Telegram bot starts it through `createAgent()` in `engine.ts`.

## Runtime flow

```text
screen pools -> remove cooldowns and duplicates -> rank candidates
-> request LLM open/hold decisions -> validate decisions
-> apply deterministic guardrails -> createPosition
```

The LLM chooses between `open` and `hold`. The guardrails are independent of the LLM and can block an opening.

## Files

| File | Responsibility |
|---|---|
| `engine.ts` | Agent lifecycle, scheduled jobs, cycle execution, TP/SL, and out-of-range handling. |
| `llm.ts` | Prompt construction, response parsing, and LLM requests. |
| `decision.ts` | Open-decision validation and TP/SL action selection. |
| `heuristic.ts` | Deterministic scoring and candidate ranking. |
| `guardrails.ts` | Duplicate, cooldown, risk, and budget checks. |
| `state.ts` | `.vexis-agent.json` persistence. |
| `journal.ts` | `.vexis-agent-journal.jsonl` persistence. |
| `signalWeights.ts` | Closed-position performance and adaptive weights. |
| `format.ts` | Telegram status, summary, journal, and portfolio output. |
| `commands.ts` | Telegram commands and callback actions. |
| `schedule.ts` | Wall-clock aligned scheduling. |
| `notify.ts` | Agent notifications and action keyboards. |

## Main cycle

1. Stop if the open-position limit is already reached.
2. Screen pools through `Screening`.
3. Remove pools in cooldown or with duplicate open positions.
4. Rank the remaining pools and keep `maxCandidates`.
5. Ask the LLM for JSON decisions containing a pool ID, `open` or `hold`, and a rationale.
6. Skip the entire cycle if the open-decision request fails or cannot be parsed.
7. Drop unknown and duplicate pool IDs from the response.
8. For each `open`, run duplicate, pool-cooldown, risk, budget, and transaction-cooldown checks.
9. Call `dlmm.createPosition` for decisions that pass.
10. Append the journal entry, update state, and send the summary.

The `llmStatus` values are `ok`, `skipped`, and `failed`. `skipped` means screening produced no candidates. `failed` means no trade was attempted because the LLM request failed.

## Scheduled jobs

| Job | Interval | Decision source |
|---|---|---|
| `cycle` | `max(txCooldownMs, 60s)` | Full LLM open/hold flow. |
| `event` | 30 seconds | Deterministic TP/SL. |
| `oor` | `intervalMinutes` | LLM hold/close decisions for out-of-range positions. |
| `briefing` | Daily at 09:00 local time | LLM narrative with a raw-data fallback. |

The first three jobs run once at startup. The briefing waits for the next scheduled 09:00.

## Guardrails

`checkDuplicate` and `filterDuplicates` compare pool and base-token IDs. `checkCooldown` enforces the global transaction cooldown, while `checkPoolCooldown` handles per-pool cooldowns. `checkRisks` evaluates risk data and the configured caps. `checkOpenGuardrail` enforces per-position, total-budget, and position-count limits. `deriveOpenAmount` returns the amount that fits the remaining budget.

The default risk values are enabled, 30 SOL minimum token fees, 30% bundle and bot-holder caps, 60% top-10-holder cap, 30% minimum distance below ATH, and enabled wash, rug-pull, paid-promotion, and developer-sold-all blocks. `maxRugScore` defaults to `1`.

## Heuristic and adaptive weights

The heuristic combines fee-to-active-TVL ratio, organic score, bin step, holders, volume, price distance from ATH, RugCheck score, holder concentration, and active positions. `rankPools` uses the score for ordering and keeps `maxCandidates`; `minCandidate` is retained only for config compatibility and no longer gates LLM decisions.

When Darwinian learning is enabled, closed-position samples are stored in `.vexis-agent-signals.json`. After enough samples, signal lift is calculated from winning and losing positions. Stronger signals are multiplied by `boostFactor`, weaker signals by `decayFactor`, and weights stay between `weightFloor` and `weightCeiling`.

## LLM parsing

Open decisions accept a JSON array, a fenced JSON array, or an object containing `decisions`. Invalid output returns `failed`, which skips the cycle. Actions other than `open` become `hold`; empty arrays are valid. OOR decisions use `hold` and `close`; a failed OOR request enters degraded mode and holds positions.

## State and journal

`.vexis-agent.json` contains enabled state, cycle metadata, plans, executions, and cooldowns. `.vexis-agent-journal.jsonl` records cycle and action results, including LLM status, decisions, guardrail results, blocked reasons, execution status, and transaction signatures.

## Verification

```bash
npm run check
npm run typecheck
npm test
```

Agent tests are under `test/agent-*.test.ts`.
