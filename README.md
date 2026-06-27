# DLMM Bot

A Telegram bot and CLI tool for managing liquidity positions on [Meteora DLMM](https://app.meteora.ag/dlmm) — Solana's dynamic liquidity market maker.

Vexis discovers and screens pools using the Meteora Pool Discovery API, filtering out low-quality tokens by market cap, holder count, organic score, fee/TVL ratio, bin step, and token age. Pools are scored and ranked so you can quickly find the best opportunities without manual research.

Built with TypeScript, [grammY](https://grammy.dev/) (Telegram), and [Commander.js](https://github.com/tj/commander.js) (CLI).

## Features

- **Pool Screening** — Automatic filtering via Meteora Pool Discovery API with configurable thresholds (market cap, holders, organic score, fee/TVL ratio, bin step, volatility, token age). Pools are scored and sorted by a composite metric.
- **Portfolio Tracking** — View open and closed positions with PnL in both USD and SOL, fee earnings, and out-of-range detection.
- **On-chain Operations** — Create positions, add/remove liquidity, claim fees and rewards — all from Telegram with inline confirmation.
- **Smart Alerts** — Cron-based detection for PnL changes, new/closed positions, balance changes, fee changes, and out-of-range events.
- **Watchlist** — Track LP positions across multiple wallets in one place.

## Install

```bash
npm install
npm run build
```

Copy and edit the config file:

```bash
cp vexis.config.example.json vexis.config.json
```

## Config

At minimum, set `wallet` for CLI usage, or `telegramBotToken` + `telegramChatId` for the bot.

Config search order: `$VEXIS_CONFIG` (explicit path) → `./vexis.config.json` → `~/.vexis/config.json`

```json
{
  "wallet": "YourSolanaWalletAddress",
  "privateKey": "base64-or-base58-encoded-private-key",
  "rpcUrl": "https://api.mainnet-beta.solana.com",
  "telegramBotToken": "123456:ABC-your-bot-token-from-BotFather",
  "telegramChatId": "your-numeric-chat-id",
  "pools": {
    "api": "discovery",
    "timeframe": "5m",
    "category": "trending",
    "pageSize": 50,
    "minMcap": 150000,
    "maxMcap": 10000000,
    "minHolders": 500,
    "minVolume": 500,
    "minTvl": 10000,
    "maxTvl": 150000,
    "minBinStep": 80,
    "maxBinStep": 125,
    "minFeeActiveTvlRatio": 0.05,
    "minOrganic": 60,
    "minQuoteOrganic": 60,
    "excludeHighSupplyConcentration": true,
    "displayLimit": 15
  }
}
```

## Telegram Bot

### Setup

1. Open [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`, follow the prompts, and copy the bot token.
2. Open [@userinfobot](https://t.me/userinfobot) to get your numeric chat ID.
3. Add both to your config file:

```json
{
  "telegramBotToken": "123456:ABC-your-bot-token-from-BotFather",
  "telegramChatId": "your-numeric-chat-id"
}
```

4. Start the bot:

```bash
npm run bot
```

5. Open your bot on Telegram and send `/start` to verify it's working.

## CLI

```bash
vexis open [wallet]        # Open positions
vexis closed [wallet]      # Closed positions
vexis summary [wallet]     # Total PnL (USD + SOL)
vexis pool list            # Trending pools
vexis pool info <address>  # Pool detail
```

## Deploy

### VPS / Server (pm2)

```bash
npm install && npm run build
pm2 start "npm run bot" --name vexis-bot
pm2 save
pm2 startup
```

### Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm run build
COPY . .
CMD ["npm", "run", "bot"]
```

```bash
docker build -t vexis-bot .
docker run -d --restart unless-stopped \
  -v $(pwd)/vexis.config.json:/app/vexis.config.json \
  --name vexis-bot \
  vexis-bot
```

### Railway / Render

Deploy directly from GitHub. Set these in your config file or via environment variables in the dashboard:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `VEXIS_PRIVATE_KEY`
- `RPC_URL`

Build command: `npm install && npm run build`

Start command: `npm run bot`
