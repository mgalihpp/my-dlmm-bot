# AI agent guide

The Vexis agent automates parts of Meteora DLMM position management on Solana. It screens pools, asks an OpenAI-compatible LLM to choose `open` or `hold`, validates the response, and applies deterministic guardrails before any new position is created.

The agent can also evaluate TP/SL rules, handle out-of-range positions, write a journal, and update signal weights from closed-position results. It performs real transactions, so use a dedicated wallet with limited funds.

## Requirements

- Node.js 20 or newer
- A Solana wallet and RPC endpoint
- A Telegram bot token and chat ID
- An API key for an OpenAI-compatible LLM

## Setup

```bash
npm install
npm run build
copy vexis.config.example.json vexis.config.json
npm run bot
```

Use `cp` instead of `copy` on macOS or Linux. Add the wallet, private key, RPC URL, Telegram settings, and `agent` settings to the local config. The private key is required because the agent can create and close positions.

Start it from Telegram:

```text
/agent start
/agent status
```

The agent is disabled by default. See [the configuration reference](config-reference.md) for every key.

## Decision flow

```text
Screen pools -> remove cooldowns and duplicates -> rank candidates
-> ask the LLM for open/hold -> validate pool IDs and actions
-> apply guardrails -> create the position
```

The heuristic ranks candidates. It does not approve an opening. The LLM makes the open/hold choice, while deterministic checks remain the final gate.

## Scheduled jobs

| Job | Schedule | Behavior |
|---|---|---|
| `cycle` | `max(txCooldownMs, 60s)` | Screens pools, asks for open/hold decisions, and may create positions. |
| `event` | Every 30 seconds | Checks TP/SL rules deterministically. |
| `oor` | `intervalMinutes` | Checks TP/SL and asks the LLM whether out-of-range positions should be held or closed. |
| `briefing` | Daily at 09:00 local time | Sends an LLM summary of portfolio and recent activity. |

The recurring jobs use wall-clock aligned schedules and run once on startup, except the daily briefing, which waits for the next 09:00.

## Guardrails

An opening can be blocked by:

- An existing position in the same pool or base token
- A pool or transaction cooldown
- Rug-pull, wash-trading, holder-concentration, paid-promotion, developer-sold-all, or token-fee checks
- The `maxSolPerPosition`, `maxTotalSol`, or `maxOpenPositions` limits
- No remaining budget

If the open-decision request fails, the whole cycle is skipped and no trade is made. If an out-of-range request fails, positions are held rather than closed.

## Telegram commands

| Command | Action |
|---|---|
| `/agent start` | Enable and start the agent. |
| `/agent stop` | Stop the agent. |
| `/agent status` | Show status and tracked positions. |
| `/agent portfolio` | Show portfolio PnL. |
| `/agent journal [n]` | Show the latest journal entries, up to 20. |
| `/briefing` | Request a read-only briefing. |

Agent notifications include live cycle progress, decisions, blocked reasons, execution results, and summaries. Notification delivery failures do not stop the agent.

## State and journal files

- `.vexis-agent.json` stores enabled state, plans, cooldowns, executions, and the latest LLM status.
- `.vexis-agent-journal.jsonl` stores one JSON object per cycle or action.
- `.vexis-agent-signals.json` stores Darwinian signal weights and performance samples.

These files are local runtime state. Stop the agent before deleting them. Deleting them removes tracked plans, cooldowns, journal history, and learned weights.

## Safety limits

- Transactions are real and cannot be undone by the bot.
- A failed LLM open request produces zero trades for that cycle.
- Budget and risk guardrails are hard blocks.
- The agent only runs while the server is running.
- Keep enough SOL in the signer wallet for transaction fees.

For implementation details, see [the internal agent notes](dev/ai-agent.md). For failures, see [Troubleshooting](troubleshooting.md).
