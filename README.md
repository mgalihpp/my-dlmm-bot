# DLMM Bot

A Telegram bot and CLI tool for managing liquidity positions on [Meteora DLMM](https://app.meteora.ag/dlmm) — Solana's dynamic liquidity market maker.

Vexis discovers and screens pools using the Meteora Pool Discovery API, with all filters configurable via config or Telegram `/config` command. No client-side rejection — all filtering happens at the API level.

Built with TypeScript, [grammY](https://grammy.dev/) (Telegram), and [Commander.js](https://github.com/tj/commander.js) (CLI).

## Features

- **Pool Screening** — Full control over Discovery API filters (market cap, TVL, volume, fee, bin step, organic score, holders, volatility, pool price, swap count, traders, price trend, SOL pair only). Set `null` to skip any filter.
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
    "timeframe": "30m",
    "category": "top",
    "pageSize": 50,
    "displayLimit": 15,
    "minMcap": 250000,
    "minVolume": 1000,
    "minTvl": 5000,
    "maxTvl": 200000,
    "minFee": 50,
    "minBinStep": 20,
    "minOrganic": 60,
    "minQuoteOrganic": 60,
    "solPairOnly": true
  }
}
```

Set any filter to `null` to skip it. All filters:

| Filter | Config Key | Description |
|---|---|---|
| Base token warnings | `baseTokenHasHighSupplyConcentration` | Boolean — exclude high supply concentration |
| Base token ownership | `baseTokenHasHighSingleOwnership` | Boolean — exclude high single ownership |
| Market cap | `minMcap` / `maxMcap` | Min/max base token market cap |
| Holders | `minHolders` / `maxHolders` | Min/max base token holders |
| Organic score | `minOrganic` / `maxOrganic` | Min/max base token organic score |
| Quote organic | `minQuoteOrganic` / `maxQuoteOrganic` | Min/max quote token organic score |
| Token age | `minTokenAgeHours` / `maxTokenAgeHours` | Min/max age in hours |
| Launchpad block | `blockedLaunchpads` | Array of blocked launchpad names |
| TVL | `minTvl` / `maxTvl` | Min/max total value locked |
| Active TVL | `minActiveTvl` / `maxActiveTvl` | Min/max active TVL |
| Volume | `minVolume` / `maxVolume` | Min/max trading volume |
| Fee | `minFee` / `maxFee` | Min/max fee amount ($) |
| Fee/TVL ratio | `minFeeActiveTvlRatio` / `maxFeeActiveTvlRatio` | Min/max fee-to-TVL ratio |
| Bin step | `minBinStep` / `maxBinStep` | Min/max DLMM bin step |
| Volatility | `minVolatility` / `maxVolatility` | Min/max pool volatility |
| Pool price | `minPoolPrice` / `maxPoolPrice` | Min/max pool price |
| Active positions | `minActivePositions` / `maxActivePositions` | Min/max active positions |
| Open positions | `minOpenPositions` / `maxOpenPositions` | Min/max open positions |
| Swap count | `minSwapCount` / `maxSwapCount` | Min/max swap count |
| Unique traders | `minUniqueTraders` / `maxUniqueTraders` | Min/max unique traders |
| Price change % | `minPriceChangePct` / `maxPriceChangePct` | Min/max price change percentage |
| Volume change % | `minVolumeChangePct` / `maxVolumeChangePct` | Min/max volume change percentage |
| Price trend | `priceTrend` | Filter by price trend direction |
| SOL pair only | `solPairOnly` | Boolean — only show SOL-paired pools |

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
