# Vexis DLMM Bot

Portfolio viewer & liquidity manager untuk [Meteora DLMM](https://app.meteora.ag/dlmm) — CLI + Telegram bot.

## Features

- **Portfolio tracking** — Open/closed positions, PnL (USD & SOL), fees, out-of-range alerts
- **Pool analytics** — Trending pools, TVL, APR, volume, market cap, holders
- **On-chain operations** — Create/close positions, add/remove liquidity, claim fees & rewards
- **Telegram bot** — Full access to all features with inline confirmation for on-chain ops
- **Smart alerts** — Auto-detect PnL changes, position changes, out-of-range, balance changes
- **Watchlist** — Track LP positions dari banyak wallet sekaligus (CLI + Telegram)

## Install

```bash
npm install && npm run build
```

Run without build: `npm run dev -- open <wallet>`

## CLI Usage

### Portfolio

```bash
vexis open [wallet]       # Open positions (default: wallet from config)
vexis closed [wallet]     # Closed positions
vexis summary [wallet]    # Total PnL (USD + SOL)
```

### Watchlist

Track LP positions dari wallet lain (tanpa perlu private key mereka).

```bash
vexis watch add <wallet> [--label "Whale 1"]   # Add wallet ke watchlist
vexis watch remove <wallet>                     # Remove wallet
vexis watch list                                # List watched wallets
vexis watch positions                           # Show positions semua watched wallet
vexis wallets <addr1> [addr2] ...              # Query wallet mana aja on-the-fly
```

Data watchlist persist ke `.vexis-watchlist.json`.

### Pool Analytics

```bash
vexis pool list                                # Trending pools (30m fee/TVL, min 100k MC)
vexis pool list --sort volume_24h:desc         # By 24h volume
vexis pool list --sort tvl:desc -s 5           # Top 5 by TVL
vexis pool list --min-mc 500000 --query SOL    # Custom filters
vexis pool info <address>                      # Pool detail (TVL, MC, APR, Volume, Fees)
```

### On-chain Operations

Requires `privateKey` in config. Use `--dry-run` to preview, `--yes` to skip confirmation.

```bash
vexis position create <pool> --strategy spot|bidask|curve --x-amount <n> --y-amount <n> --min-bin <n> --max-bin <n>
vexis position close <pool> <position>
vexis liquidity add <pool> <position> --strategy spot --x-amount <n> --y-amount <n>
vexis liquidity remove <pool> <position> --bps <1-10000> [--close]
vexis claim fee <pool> <position>
vexis claim reward <pool> <position>
```

## Telegram Bot

### Setup

1. Create bot via [@BotFather](https://t.me/BotFather), get the token
2. Get your chat ID via [@userinfobot](https://t.me/userinfobot)
3. Add to config:

```json
{
  "telegramBotToken": "123456:ABC-token",
  "telegramChatId": "123456789"
}
```

Or use env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

4. Run: `npm run bot`

### Commands

**Read-only:**
```
/portfolio          Total PnL summary (USD + SOL)
/open               Open positions (top 10)
/closed             Closed positions
/pools              Top 15 pools by fee/TVL
/pool <address>     Pool detail
```

**On-chain (with inline confirmation):**
```
/create <pool> <strategy> <xAmt> <yAmt> <minBin> <maxBin> [single]
/close <pool> <position>
/addliq <pool> <position> <strategy> <xAmt> <yAmt>
/removeliq <pool> <position> <bps>
/claimfee <pool> <position>
/claimreward <pool> <position>
```

**Watchlist:**
```
/watchadd <wallet> [label]     Add wallet ke watchlist
/watchremove <wallet>          Remove wallet
/watchlist                     List all watched wallets
/watchpositions                Positions semua watched wallet
/wallets <w1> [w2] ...         Query wallet mana aja
```

**Alerts:**
```
/alerts                       Show active alerts
/setalert portfolio <hours>   Portfolio summary every N hours
/setalert position            Track all open positions (every 15m)
/stopalert portfolio
/stopalert position
```

### Alert Detection

Position alerts check every 15 minutes and detect:

| Trigger | Threshold |
|---------|-----------|
| PnL change | ≥ 0.5% per pool |
| New position | Immediate |
| Position closed | Immediate |
| Balance change | Immediate |
| Fee change | Immediate |
| Out of range | Immediate |

Each alert includes full pool detail (TVL, MC, APR, Volume, Fees). State persists to `.vexis-alerts.json`.

## Config

Create `vexis.config.json` (see `vexis.config.example.json`):

```json
{
  "wallet": "YourWalletAddress",
  "privateKey": "base64-encoded-secret-key",
  "rpcUrl": "https://api.mainnet-beta.solana.com",
  "dev": false,
  "pageSize": 50,
  "telegramBotToken": "token-from-botfather",
  "telegramChatId": "your-chat-id"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `wallet` | Read-only | Default wallet address |
| `privateKey` | On-chain | Base64-encoded secret key |
| `rpcUrl` | No | RPC endpoint (default: public mainnet) |
| `dev` | No | Use dev API server |
| `pageSize` | No | Default page size (50) |
| `telegramBotToken` | Bot | Telegram bot token |
| `telegramChatId` | Bot | Whitelist chat ID |

Config search order: `$VEXIS_CONFIG` → `./vexis.config.json` → `~/.vexis/config.json`

Private key can also be set via `VEXIS_PRIVATE_KEY` env var.

### Global Options

| Option | Description |
|--------|-------------|
| `--json` | Raw JSON output |
| `--dev` | Use dev API server |
| `-p, --page <n>` | Page number |
| `-s, --page-size <n>` | Page size |

Set `NO_COLOR=1` to disable colors.

## Security

- Bot only responds to configured `telegramChatId` (whitelist)
- Private key never sent through chat
- On-chain operations require explicit inline confirmation
- Use `--dry-run` to preview transactions before executing

## API

**Meteora Data API** (`dlmm.datapi.meteora.ag`):
- `GET /portfolio/open` — Open positions per pool (accepts any wallet as `user`)
- `GET /portfolio` — Closed positions
- `GET /portfolio/total` — Aggregate PnL
- `GET /positions/{pool_address}/pnl` — Position PnL per pool per user
- `GET /pools` — Pool list with sorting/filtering
- `GET /pools/{address}` — Pool detail
- `GET /pools/{address}/historical-volume` — Volume history

**On-chain** (via `@meteora-ag/dlmm` SDK):
- Position management, liquidity operations, fee/reward claims
