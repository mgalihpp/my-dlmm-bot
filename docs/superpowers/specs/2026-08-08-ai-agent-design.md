# AI Agent — Full Autonomous Trading (Hybrid Heuristic + LLM Advisory)

Date: 2026-08-08

## Summary

Add an autonomous trading agent to the Vexis DLMM bot. The agent runs a periodic loop (+ event-driven triggers) inside the existing Telegram bot process. Each cycle it screens candidate pools with the existing screening filters, scores them with a deterministic heuristic, asks an OpenAI-compatible LLM for a market-context advisory signal, then decides among open/close/TP/SL/hold. Execution is bounded by explicit risk guardrails configured in the config file. Every decision is written to a decision journal for auditability. The agent can run full-auto without confirmation but has an emergency `/agent stop` command.

## Goals

- Agent runs autonomously: decide and execute create/close/add/remove/TP/SL within configured risk limits.
- Hybrid decision engine: deterministic heuristic (80%) + LLM advisory (20%).
- Guardrails: capital caps, max open positions, TP/SL rules, transaction rate-limit, screening-filter pool whitelist.
- Event-driven + loop: periodic evaluation plus immediate reaction to out-of-range / guardrail breach.
- Degrade gracefully to heuristic-only when the LLM API is down/timeout/rate-limited.
- Decision journal for audit + Telegram notifications per cycle (verbose).
- Runs inside the existing bot process, reusing existing Effect services (MeteoraApi, Dlmm, Zap, Screening, Solana, TokenMeta).
- Uses the main configured wallet + privateKey (same single wallet for manual and agent actions).

## Architecture

Located under `src/telegram/agent/` following the existing `alerts.ts`/`tpsl.ts` pattern:

```
src/telegram/agent/
├── engine.ts        # loop + event-driven trigger, concurrency lock, timer wiring
├── decision.ts      # pipeline: heuristic score → LLM advisory → combine → choose action
├── heuristic.ts     # pure deterministic pool scorer (0-100)
├── llm.ts           # OpenAI-compatible client, prompt builder, JSON response parser
├── journal.ts       # append-only decision journal (.vexis-agent-journal.json)
├── commands.ts      # Telegram commands: /agent start|stop|status|journal
└── format.ts        # notification formatting (verbose)
```

Dependency wiring is added to `src/layers.ts` (agent services depend on existing MeteoraApi / Screening / Dlmm / Zap / Solana services).

### Per-cycle data flow

1. **Status check** — if `enabled == false` or `state.running == true`, skip.
2. **Collect context** — pool list via Screening filters (`pools.*` config), open positions, balances, deployed capital & cap utilization.
3. **Heuristic scoring** — score every candidate pool 0–100 from fee, volume, bin step, organic score, market cap, price trend, PnL context, volatility (deterministic, pure function).
4. **Top-N candidate selection** — keep pools above a heuristic threshold (config `agent.minCandidate`, capped at `agent.maxCandidates`) to limit LLM calls.
5. **LLM advisory** — send latest candidate context (top-N pools, portfolio summary) to the OpenAI-compatible endpoint; expect JSON: `{ "candidate": poolAddress, "favorability": -1..1, "rationale": "..." }`.
6. **Combine & decide** — final score = 0.8 * heuristic + 0.2 * favorability. Action set: `{open, add, close, tp, sl, hold}`. Decide per candidate (open/add) + per open position (close/tp/sl). Position-level actions `/agent stop` semantics: `tp` = take profit at `agent.tpPct`, `sl` = stop loss at `agent.slPct`, `close` = manual/extra close.
7. **Guardrail check** — verify each planned action against caps; block and journal as `blocked` if breached.
8. **Execute** — via existing services (Dlmm create/add/remove/close/zap, claim).
9. **Journal** — append cycle: inputs, scores, LLM signal, decision, execution result.
10. **Notify** — verbose Telegram summary (action, pool, amount, reason, guardrail blocks).

### Heuristic scorer (pure, testable)

- Inputs: pool screening fields (`minFee`, `feeActiveTvlRatio`, `binStep`, `organicScore`, `mcap`, `volume`, `priceChangePct`, `priceTrend`, open/active positions), plus portfolio/PnL context per open position.
- Weighted normalized 0–100. Action thresholds from config (a score above `agent.minCandidate` opens, sliding ranges for add/hold/close).
- Reuses `pools.*` screening config values from config file as baselines.

### LLM layer

- Config: `agent.llm.baseUrl` (OpenAI-compatible), `agent.llm.apiKey` (or env `OPENAI_API_KEY`), `agent.llm.model`.
- Request: structured JSON prompt with bounded context (max N candidates, numeric fields only). Uses Node `fetch` built-in via Effect.Http from `@effect/platform` if available (consistent with services like TokenMeta).
- Response parse: strict JSON parse; on failure → fallback heuristic-only for that cycle, degraded status.
- Timeout (e.g. 30s) + retry policy (1 retry) → degrade on failure.
- Input tokens bounded (cap candidate context length, cache portfolio summary).
- **No position/private-key data sent to LLM.** Only public pool metrics + masked/aggregate portfolio numbers.

### Decision journal

Append-only JSON-lines file `.vexis-agent-journal.json` (git-ignored). Each entry:

```json
{
  "ts": "2026-08-08T00:00:00.000Z",
  "cycle": 123,
  "llmStatus": "ok" | "degraded" | "skipped",
  "candidates": [
    {
      "pool": "addr",
      "heuristicScore": 82,
      "favorability": 0.4,
      "rationale": "…",
      "action": "open" | "hold" | …,
      "guardrail": "pass" | "blocked",
      "blockedReason": "…",
      "execution": "ok" | "failed" | null,
      "txSignature": "…"
    }
  ]
}
```

### State file `.vexis-agent.json`

```json
{
  "enabled": false,
  "running": false,
  "lastCycleAt": "",
  "llmStatus": "ok",
  "plans": [],              // positions currently planned/managed by the agent
  "executions": []          // recent executions window for rate-limit
}
```

## Guardrails

All executed before each action; violated action is skipped, journaled, and notified.

| Guardrail | Config key | Behavior on breach |
|---|---|---|
| Cap per position | `agent.maxSolPerPosition` | skip open/add |
| Total deployment cap | `agent.maxTotalSol` | skip open/add when total deployed would exceed |
| Max open positions (agent-managed) | `agent.maxOpenPositions` | skip open when count reached |
| Tx rate-limit | `agent.txCooldownMs` | skip if within cooldown of last execution |
| Agent TP/SL | `agent.tpPct` / `agent.slPct` | triggers sell/close/tp/sl |
| Pool whitelist | reuses `pools.*` screening filters | only screened pools may be opened |

Hard safety: `agent.enabled` must be explicitly true and `/agent start` called. `/agent stop` sets `enabled=false` immediately and blocks the next cycle loop.

## Configuration

New config section (see `vexis.config.example.json`):

```json
{
  "agent": {
    "enabled": false,
    "intervalMinutes": 15,
    "maxCandidates": 5,
    "minCandidate": 70,
    "maxSolPerPosition": 0.5,
    "maxTotalSol": 3,
    "maxOpenPositions": 4,
    "txCooldownMs": 300000,
    "tpPct": 25,
    "slPct": -10,
    "llm": {
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "",     // falls back to env OPENAI_API_KEY
      "model": "gpt-4o-mini"
    }
  }
}
```

Config Schema type added to `src/domain/` (Effect.Schema), following existing config validation.

## Telegram commands

- `/agent start` — enable + run a cycle now
- `/agent stop` — emergency stop, disable loop
- `/agent status` — enabled state, deployed vs cap, open-agent positions
- `/agent journal [n]` — show last n journal summaries

Requires `privateKey` (needs on-chain access) + valid chat ID.

## Error Handling

- LLM timeout / network / parse failure → heuristic-only that cycle, llmStatus degraded, retry (1 retry, 30s timeout).
- RPC / API fetch failure → idle cycle, skip execution, retry next cycle.
- Transaction failure: journal failure; ensure state consistency (agent-managed plan recorded if on-chain succeeded based on recent signature); never crash the process (all wrapped in `Effect.catchAll`).
- Loop overlap: `state.running` guard → skip cycle if previous still running.
- /agent stop during running cycle: current tx completes; no new actions start; enabled=false persisted.
- All Effect errors handled via existing `errorMessage`.

## Testing

- Unit (vitest, pure): heuristic scorer cases (good vs bad pool); combination/favorability → expected action; guardrail rules with fake context; LLM response parser (valid + malformed JSON); forced fallback to heuristic; journal & state I/O round-trip.
- Integration: pipeline decision → guardrail → action with mocked services (no network).
- No new test deps required.

## Open Scope Notes

- Runs inside bot process: restarting the bot restarts the agent loop.
- No multi-agent; single main wallet.
- LLM never receives private keys or executes swaps directly; it only produces advisory signals.
- Bounded LLM context to avoid token blowup.