# Vexis DLMM Bot

Vexis is a TypeScript CLI and Telegram bot for monitoring and managing Meteora DLMM positions on Solana. It can screen pools, track portfolio PnL, run alerts and TP/SL rules, and execute on-chain position operations when a signer is configured.

The repository also contains a React Router dashboard for portfolio, pool, and agent monitoring. Portfolio data is read-only, but authenticated users can close positions from the dashboard.

## Documentation

- [AI agent guide](docs/ai-agent.md)
- [Configuration reference](docs/config-reference.md)
- [API response reference](docs/api-responses.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Coding-agent setup prompt](docs/coding-agent-prompt.md)
- [Web dashboard README](src/web-react/README.md)

## Features

- Pool screening through Meteora's Pool Discovery API
- Open and closed portfolio views with USD and SOL PnL
- Telegram commands for balances, positions, pools, watchlists, alerts, and TP/SL
- On-chain create, close, add-liquidity, remove-liquidity, fee-claim, and reward-claim operations
- Configurable pool filters and interactive Telegram config editing
- Automated agent decisions with LLM output validation and deterministic guardrails
- Read-only React dashboard with portfolio, pools, settings, and agent history pages

## Architecture

```text
CLI (@effect/cli)       Telegram bot (grammY)       Web dashboard (React Router)
         \                       |                          /
          \_____________________|_________________________/
                                |
                         Effect services
                                |
       Meteora API | Pool screening | DLMM SDK | Jupiter | Solana RPC
```

The domain schemas decode external API responses before the application uses them. Runtime state is stored in git-ignored files such as `.vexis-alerts.json`, `.vexis-tpsl.json`, `.vexis-watchlist.json`, `.vexis-agent.json`, `.vexis-agent-journal.jsonl`, and `.vexis-agent-signals.json`.

## Requirements and installation

Use Node.js 20 or newer.

```bash
npm install
npm run build
copy vexis.config.example.json vexis.config.json
```

On macOS or Linux, use `cp` instead of `copy`.

At minimum, set `wallet` for portfolio queries. Set `telegramBotToken` and `telegramChatId` to run the bot. A valid `privateKey` is required for on-chain operations.

Configuration is loaded in this order:

1. The file named by `VEXIS_CONFIG`
2. `./vexis.config.json`
3. `~/.vexis/config.json`

`VEXIS_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `OPENAI_API_KEY`, and `VEXIS_WEB_PASSWORD` override their corresponding settings. `rpcUrl` is read from the config file only. There is no `RPC_URL` environment variable.

See [the configuration reference](docs/config-reference.md) for every supported key.

## Zero-setup with an AI coding agent

You can let an AI coding agent install and configure Vexis from an empty folder. Use a trusted agent because setup may involve a private key, Telegram token, and LLM API key.

Open Claude Code, Codex, or another coding agent in the target folder and paste:

```text
Clone this repository into the current folder, read README.md and all linked documentation, then set up and deploy Vexis from start to finish. Install the required dependencies, ask me only for the configuration values and secrets you need, create the local git-ignored vexis.config.json, run the documented checks, and explain how to start the deployment. Never expose or commit secrets, and do not send on-chain transactions without my explicit confirmation.
```

The full setup and troubleshooting prompts are in [the coding-agent prompt guide](docs/coding-agent-prompt.md). After setup, start the service with `npm start`, then use `/agent start` in Telegram if automated position management is enabled.

## Telegram bot

Create a bot with [@BotFather](https://t.me/BotFather), obtain the numeric chat ID for the target chat, and add both values to `vexis.config.json`:

```json
{
  "telegramBotToken": "123456:your-token",
  "telegramChatId": "123456789"
}
```

Start the bot with:

```bash
npm run bot
```

Useful command groups include:

| Group | Commands |
|---|---|
| Portfolio | `/balance`, `/portfolio`, `/open`, `/closed` |
| Pools | `/pools`, `/pool <address>` |
| Positions | `/create`, `/manage`, `/close`, `/addliq`, `/removeliq`, `/claimfee`, `/claimreward` |
| Watchlist | `/watchadd`, `/watchremove`, `/watchlist`, `/watchpositions`, `/wallets <address...>` |
| Automation | `/alerts`, `/tpsl`, `/agent`, `/briefing` |

## AI agent

The agent screens pools, asks the configured LLM for `open` or `hold` decisions, validates the response, and applies deterministic duplicate, cooldown, risk, and budget checks before creating a position. TP/SL checks are deterministic. Out-of-range decisions use the LLM and fail safe to `hold` if the request fails.

The agent is disabled by default. Configure `agent`, start the bot, then run:

```text
/agent start
/agent status
```

Read [the AI agent guide](docs/ai-agent.md) for setup, limits, state files, and failure behavior.

## Web dashboard

The dashboard is served by the root application. It does not expose private keys. Portfolio, pool, and agent data are read-only; the authenticated portfolio page also supports closing a position and zapping the result to SOL. Configure it with:

```json
{
  "web": {
    "port": 8080,
    "password": "change-me"
  }
}
```

### Multi-wallet

Configure multiple wallets in `vexis.config.json`:

```json
"wallets": [
  { "label": "main", "wallet": "DYAn...", "privateKey": "base58-or-base64", "enabled": true },
  { "label": "scalping", "wallet": "9W3k...", "privateKey": "...", "enabled": true }
]
```

Legacy single-wallet `wallet`/`privateKey` still works and auto-migrates to `wallets[0]`. Each wallet has isolated budgets (`maxSolPerPosition`, `maxTotalSol`, `maxOpenPositions`) and isolated state (plans, cooldowns, OOR timers). The agent loops wallets sequentially.

Web: use `?wallet=ADDRESS` or the `WalletSwitcher` dropdown. Telegram: `/agent status <label>` or `/portfolio <label>` for per-wallet views; without an argument, status shows an aggregated summary across all enabled wallets.

Run the development server or the compiled server with:

```bash
npm run dev
npm start
```

## CLI

Run the TypeScript CLI directly with `npm run cli -- <command>`, or use the compiled `vexis` binary after building.

```bash
npm run cli -- open [wallet]
npm run cli -- closed [wallet]
npm run cli -- summary [wallet]
npm run cli -- pool list
npm run cli -- pool info <address>
npm run cli -- position create <poolAddress> --strategy bidask --x-amount 1 --y-amount 1 --min-pct -10 --max-pct 10 --dry-run
```

The CLI also provides `config`, `position close`, `liquidity add`, `liquidity remove`, `claim fee`, `claim reward`, `watch`, and `wallets` commands. Use `--help` for the exact options.

## Development and verification

```bash
npm run check
npm run typecheck
npm test
```

`npm run build` builds both the root TypeScript application and the web dashboard. The tests focus on pure logic, response decoding, formatting, state storage, and agent behavior. They do not require live RPC, Telegram, or Meteora services.

## Deployment

### VPS with pm2

Install Node.js 20 or newer and pm2 on the server. Copy `vexis.config.json` to the server through a secure channel, then run:

```bash
npm ci
npm run build
pm2 start npm --name vexis -- start
pm2 save
pm2 startup
```

The `start` script runs the compiled React dashboard and the shared bot runtime. Set the dashboard port in `web.port`, or provide the port expected by the hosting environment. After a release, run:

```bash
npm ci
npm run build
pm2 restart vexis
```

### Docker

Create a `Dockerfile` in the repository root:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
COPY src/web-react/package*.json ./src/web-react/
RUN npm ci && npm ci --prefix src/web-react
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

Build and run it with the local config mounted read-only:

```bash
docker run -d --restart unless-stopped \
  --name vexis \
  -p 8080:8080 \
  -v "$(pwd)/vexis.config.json:/app/vexis.config.json:ro" \
  vexis
```

Use a secret manager for private keys, Telegram tokens, and LLM API keys where the hosting platform provides one. Do not bake `vexis.config.json` into the image.

## Security

- Keep `vexis.config.json` private. It may contain a private key, bot token, and LLM API key.
- Use a dedicated hot wallet with limited funds.
- Use `--dry-run` before on-chain CLI operations.
- Never paste secrets into issues, logs, or Telegram messages.
