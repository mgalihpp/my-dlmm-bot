# vexis-dlmm-bot

**Read-only portfolio viewer + On-chain liquidity manager** untuk Meteora DLMM.

**Read-only**: Lihat posisi terbuka/tertutup dan total PnL langsung dari [Meteora Data API](https://docs.meteora.ag/api-reference/dlmm/portfolio). Hanya butuh wallet address.

**On-chain operations**: Buat, close, dan manage posisi DLMM langsung dari CLI. Butuh private key + RPC endpoint.

## Install

```bash
npm install
npm run build
```

Atau jalankan tanpa build pakai `tsx`:

```bash
npm run dev -- open <wallet>
```

## Perintah

### Portfolio (Read-only)
```bash
vexis open <wallet>      # posisi terbuka, dikelompokkan per pool
vexis closed <wallet>    # pool yang berisi posisi tertutup (deposit/withdraw/fee/PnL)
vexis summary <wallet>   # total PnL portfolio (USD & SOL)
```

### Operasi On-Chain (Requires private key)
```bash
# Position management
vexis position create <poolAddress> --strategy spot|bidask|curve --x-amount <n> --y-amount <n> --min-bin <n> --max-bin <n>
vexis position close <poolAddress> <positionPubkey>

# Liquidity management
vexis liquidity add <poolAddress> <positionPubkey> --strategy spot|bidask|curve --x-amount <n> --y-amount <n>
vexis liquidity remove <poolAddress> <positionPubkey> --bps <1-10000> [--close]

# Claim earnings
vexis claim fee <poolAddress> <positionPubkey>
vexis claim reward <poolAddress> <positionPubkey>
```

### Pool Analytics (Read-only)
```bash
vexis pool list                                  # trending pools (30m fee/TVL, min 100k MC, 500+ holders)
vexis pool list --sort fee_tvl_ratio_24h:desc   # top 24h yield pools
vexis pool list --sort volume_30m:desc          # high volume last 30m
vexis pool list --sort tvl:desc -s 5            # top 5 pools by TVL
vexis pool list --min-mc 500000 --min-holders 1000  # custom filters (min market cap, min holders)
vexis pool list --query SOL                     # search by token name
vexis pool info <poolAddress>                   # detail satu pool (TVL, APR, volume, fees)
vexis pool list --json                          # raw JSON output
```

## Telegram Bot

Semua fitur (portfolio, pool analytics, on-chain operations, alerts) bisa diakses lewat Telegram.

### Setup

1. Buat bot baru via [@BotFather](https://t.me/BotFather), dapatkan token
2. Dapatkan chat ID kamu (kirim pesan ke [@userinfobot](https://t.me/userinfobot))
3. Set di config atau env var:

```json
{
  "telegramBotToken": "123456:ABC-token-dari-botfather",
  "telegramChatId": "123456789",
  "alertInterval": 0
}
```

Atau env var: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

4. Jalankan bot:

```bash
npm run bot           # via tsx (dev)
npm run build && npm run bot:start   # via compiled dist
```

### Perintah Bot

**Read-only:**
```
/portfolio          # total PnL summary (USD + SOL)
/open               # posisi terbuka (top 10)
/closed             # posisi tertutup
/pools              # top 10 pools by fee/TVL ratio
/pool <address>     # detail satu pool
/config             # config aktif (token & key di-mask)
```

**On-chain (butuh privateKey):** — setiap operasi tampil tombol konfirmasi `✅ Confirm` / `❌ Cancel`
```
/create <pool> <strategy> <xAmt> <yAmt> <minBin> <maxBin> [single]
/close <pool> <position>
/addliq <pool> <position> <strategy> <xAmt> <yAmt>
/removeliq <pool> <position> <bps>      # bps: 1-10000
/claimfee <pool> <position>
/claimreward <pool> <position>
```

Tambahkan `single` di akhir `/create` untuk single-sided deposit (hanya token X). Contoh: `/create <pool> spot 1000000 0 -100 100 single`.

**Alerts:**
```
/alerts                       # lihat alert aktif
/setalert portfolio <hours>   # summary portfolio periodik tiap N jam
/setalert pool <address>      # track pool (notify jika APR berubah >20%)
/stopalert portfolio
/stopalert pool <address>
```

Smart alerts otomatis: PnL turun >10%, APR pool berubah >20%. State alert disimpan di `.vexis-alerts.json` (survive restart).

### Keamanan Bot

- Bot **hanya merespons** chat dari `telegramChatId` yang dikonfigurasi (whitelist). Tanpa chat ID, bot terbuka untuk semua (tidak disarankan untuk on-chain ops).
- Private key tidak pernah dikirim lewat chat.
- Semua on-chain operation butuh konfirmasi eksplisit lewat tombol inline.

## Config

Buat `vexis.config.json` (lihat `vexis.config.example.json`) supaya tidak perlu mengetik wallet tiap kali:

```json
{
  "wallet": "DYAn4XpAkN5mhiXkRB7dGq4Jadnx6XYgu8L5b3WGhbrt",
  "privateKey": "base64-encoded-secret-key",
  "rpcUrl": "https://api.mainnet-beta.solana.com",
  "dev": false,
  "pageSize": 50
}
```

Field config:
- `wallet` — wallet display (digunakan untuk read-only commands)
- `privateKey` — base64-encoded secret key (hanya diperlukan untuk on-chain operations)
- `rpcUrl` — RPC endpoint (default: mainnet-beta, bisa override)
- `dev` — gunakan dev API server (default: false)
- `pageSize` — default page size (default: 50)
- `telegramBotToken` — token bot dari @BotFather (untuk `npm run bot`)
- `telegramChatId` — chat ID yang diizinkan (bot abaikan chat lain)
- `alertInterval` — interval portfolio alert dalam jam (0 = off)

Alternatif: set `VEXIS_PRIVATE_KEY` env var untuk private key (lebih aman dari config).

Lokasi config dicari berurutan: `$VEXIS_CONFIG` → `./vexis.config.json` → `~/.vexis/config.json`.

```bash
vexis open            # pakai wallet default dari config
vexis config          # tampilkan config aktif & lokasinya
```

CLI argument & flag selalu menimpa nilai dari config.

### Opsi Global

| Opsi | Berlaku di | Keterangan |
|------|-----------|------------|
| `--json` | semua | output JSON mentah |
| `--dev` | semua | pakai server API dev (`dlmm.dev.metdev.io`) |
| `-p, --page <n>` | pool list, open, closed | nomor halaman (default 1) |
| `-s, --page-size <n>` | pool list, open, closed | jumlah per halaman (default 20 untuk pool, 50 untuk portfolio) |

Set `NO_COLOR=1` untuk menonaktifkan warna.

### Pool List Sort Options

`vexis pool list --sort <field>:<asc|desc>`

Opsi sort yang valid:
- `tvl:desc` — TVL terbesar
- `volume_24h:desc` — Volume 24h terbesar
- `volume_30m:desc` — Volume 30m terbesar (cocok untuk detecting momentum)
- `fee_24h:desc` — Fee revenue terbesar
- `fee_tvl_ratio_24h:desc` — Fee/TVL ratio (default) — yield efisiensi terbaik
- `apr_24h:desc` — APR terbesar (jika farm aktif)

Contoh: `vexis pool list --sort volume_24h:desc` atau `vexis pool list --sort tvl:desc`

## Contoh

### Portfolio
```bash
vexis open DYAn4XpAkN5mhiXkRB7dGq4Jadnx6XYgu8L5b3WGhbrt
vexis summary <wallet> --json
```

### On-Chain Operations
```bash
# Preview sebelum execute
vexis position create <poolAddress> --strategy spot --x-amount 1000000 --y-amount 1000000 --min-bin -100 --max-bin 100 --dry-run

# Execute dengan confirmation
vexis position create <poolAddress> --strategy spot --x-amount 1000000 --y-amount 1000000 --min-bin -100 --max-bin 100 --yes

# Add liquidity
vexis liquidity add <poolAddress> <positionPubkey> --strategy spot --x-amount 500000 --y-amount 500000 --yes

# Remove 50% of liquidity
vexis liquidity remove <poolAddress> <positionPubkey> --bps 5000 --yes

# Close position
vexis position close <poolAddress> <positionPubkey> --yes

# Claim fees dan rewards
vexis claim fee <poolAddress> <positionPubkey> --yes
vexis claim reward <poolAddress> <positionPubkey> --yes
```

## Safety

- **`--dry-run`** — Preview transaction tanpa mengirim ke chain
- **`--yes`** — Skip confirmation prompt (gunakan dengan hati-hati!)
- **Private key** — Disimpan di config atau env var, jangan commit ke git
- **RPC** — Defaultnya mainnet-beta public node (rate-limited), pertimbangkan private RPC untuk production

## Endpoint yang dipakai

**Portfolio** (Meteora Data API):
- `GET /portfolio/open` — posisi terbuka per-pool
- `GET /portfolio` — pool dengan posisi tertutup
- `GET /portfolio/total` — total PnL agregat

**Pool Analytics** (Meteora Data API):
- `GET /pools` — daftar pool dengan sorting & filtering
- `GET /pools/{address}` — detail pool spesifik
- `GET /pools/{address}/historical-volume` — volume history untuk sparkline

**On-chain Operations** (Meteora DLMM SDK):
- Create/close positions
- Add/remove liquidity
- Claim fees & rewards
