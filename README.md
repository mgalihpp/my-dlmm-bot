## Overview
An agent for Meteora DLMM liquidity on Solana. It screens pools, uses an LLM to pick which to open, and only trades after risk checks pass.

```text
Market Data
     ↓
Pool Screening
     ↓
AI Evaluation
     ↓
  OPEN / HOLD
     ↓
Risk Guardrails
     ↓
On-Chain Execution
```

---

## How the agent works

### 1. Pool screening

It collects pool and market signals, then applies deterministic filters to remove pools that don't meet the configured requirements.

### 2. AI evaluation

It hands candidate pools to an LLM along with the relevant market context. The agent returns an `OPEN` or `HOLD` decision with a rationale.

### 3. Risk validation

AI decisions don't directly trigger transactions.

Every `OPEN` decision must pass deterministic checks such as:

- position limits
- capital and budget limits
- risk thresholds
- duplicate detection
- cooldowns
- configured pool constraints

### 4. On-chain execution

Only decisions that pass all required checks can reach the execution layer and interact with Meteora DLMM on Solana.

---

## AI agent architecture

```text
                    ┌─────────────────┐
                    │   Market Data   │
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │ Pool Screening  │
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │  AI Evaluation  │
                    │      LLM        │
                    └────────┬────────┘
                             ↓
                       ┌───────────┐
                       │ OPEN/HOLD │
                       └─────┬─────┘
                             │
                          OPEN
                             ↓
                    ┌─────────────────┐
                    │ Risk Guardrails │
                    └────────┬────────┘
                             ↓
                    ┌─────────────────┐
                    │    Solana /     │
                    │ Meteora DLMM    │
                    └─────────────────┘
```

The agent is disabled by default. Configure `agent`, start the bot, then run `/agent start` and `/agent status` in Telegram. Read the [AI agent guide](docs/ai-agent.md) for setup, limits, state files, and failure behavior.

---

## Capabilities

### Pool intelligence

- Pool discovery
- Liquidity and volume analysis
- Market activity monitoring
- Configurable pool screening

### Portfolio management

- Open positions
- Closed positions
- PnL tracking
- Position monitoring
- Liquidity management

### Automation

- AI-based pool evaluation
- Automated `OPEN` / `HOLD` decisions
- TP/SL monitoring
- Alerts
- Agent activity history

### On-chain operations

- Create positions
- Add liquidity
- Remove liquidity
- Close positions
- Claim fees
- Claim rewards

---

## Safety model

### AI suggests. Rules decide.

It intentionally separates AI reasoning from execution authority.

If an AI request fails or returns an invalid or out-of-range decision, it falls back to `HOLD` instead of executing blindly. TP/SL and several execution constraints stay deterministic.

> The LLM can evaluate an opportunity.
> It cannot override the risk engine.

---

## Interfaces

It is controlled through three interfaces: a Telegram bot, a web dashboard, and a command-line interface.

### Telegram

Monitor and control it from Telegram. Create a bot with [@BotFather](https://t.me/BotFather), then add the token and chat ID to `vexis.config.json`:

```json
{
  "telegramBotToken": "123456:your-token",
  "telegramChatId": "123456789"
}
```

Start the bot with `npm run bot`. Useful command groups:

| Group | Commands |
|---|---|
| Portfolio | `/balance`, `/portfolio`, `/open`, `/closed` |
| Pools | `/pools`, `/pool <address>` |
| Positions | `/create`, `/manage`, `/close`, `/addliq`, `/removeliq`, `/claimfee`, `/claimreward` |
| Watchlist | `/watchadd`, `/watchremove`, `/watchlist`, `/watchpositions`, `/wallets <address...>` |
| Automation | `/alerts`, `/tpsl`, `/agent`, `/briefing` |

### Web dashboard

A read-only React dashboard for monitoring portfolio, pools, positions, agent activity, and configuration. It does not expose private keys; the authenticated portfolio page also supports closing a position. Configure it with:

```json
{
  "web": {
    "port": 8080,
    "password": "change-me"
  }
}
```

Run with `npm run dev` (development) or `npm start` (compiled server).

### Command-line interface

Run the CLI directly with `npm run cli -- <command>`, or use the compiled `vexis` binary after building.

```bash
npm run cli -- open [wallet]
npm run cli -- closed [wallet]
npm run cli -- summary [wallet]
npm run cli -- pool list
npm run cli -- pool info <address>
npm run cli -- position create <poolAddress> --strategy bidask --x-amount 1 --y-amount 1 --min-pct -10 --max-pct 10 --dry-run
```

The CLI also provides `config`, `position close`, `liquidity add`, `liquidity remove`, `claim fee`, `claim reward`, `watch`, and `wallets` commands. Use `--help` for exact options.

---

## Built with

```text
TypeScript
Effect
grammY
React Router
Meteora DLMM SDK
Jupiter
Solana RPC
Vercel AI SDK
```

---

## Getting started

Requires Node.js 20 or newer.

```bash
git clone https://github.com/mgalihpp/my-dlmm-bot.git
cd my-dlmm-bot

npm install
npm run build
```

Then create your local config:

```bash
cp vexis.config.example.json vexis.config.json
```

On Windows, use `copy` instead of `cp`.

At minimum, set `wallet` for portfolio queries. Set `telegramBotToken` and `telegramChatId` to run the bot. A valid `privateKey` is required for on-chain operations. See the [developer setup guide](docs/coding-agent-prompt.md) for automated environment configuration.

---

## Configuration

Configuration is loaded in this order:

1. The file named by `VEXIS_CONFIG`
2. `./vexis.config.json`
3. `~/.vexis/config.json`

`rpcUrl` is read from the config file only. There is no `RPC_URL` environment variable.

Runtime state is stored in git-ignored files such as `.vexis-alerts.json`, `.vexis-tpsl.json`, `.vexis-watchlist.json`, `.vexis-agent.json`, `.vexis-agent-journal.jsonl`, and `.vexis-agent-signals.json`.

See [the configuration reference](docs/config-reference.md) for every supported key.

---

## Deployment

See the [deployment guide](docs/deployment.md) for VPS, PM2, and Docker setup.

---

## Documentation

- [AI agent guide](docs/ai-agent.md)
- [Configuration reference](docs/config-reference.md)
- [API response reference](docs/api-responses.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Coding-agent setup prompt](docs/coding-agent-prompt.md)
- [Web dashboard README](src/web-react/README.md)
- [Deployment guide](docs/deployment.md)

---

## Development

```bash
npm run check
npm run typecheck
npm test
```

`npm run build` builds both the root TypeScript application and the web dashboard. Tests focus on pure logic, response decoding, formatting, state storage, and agent behavior. They do not require live RPC, Telegram, or Meteora services.

---

## Security

- Keep `vexis.config.json` private. It may contain a private key, bot token, and LLM API key.
- Use a dedicated hot wallet with limited funds.
- Use `--dry-run` before on-chain CLI operations.
- Never paste secrets into issues, logs, or Telegram messages.
