# Dokumentasi API Responses — Vexis DLMM Bot

Dokumentasi ini mendaftarkan **semua bentuk response** dari setiap API yang dikonsumsi repo ini,
dengan **seluruh properti** (tidak ada yang dilewatkan), berdasarkan:

1. **Schema Effect** di repo (yang benar-benar didecode bot) — referensi file & baris.
2. **Pengujian live** terhadap API (2026-08-08) — bentuk JSON asli saat ini.
3. **OpenAPI spec Meteora** dari https://docs.meteora.ag/agents/llms-txt → `api-reference/dlmm/openapi.json`.

Konvensi pada tabel properti:

| Kolom | Arti |
|---|---|
| **Decode** | ✅ = properti dibaca schema repo (file:line). ❌ = properti ada di respons live tapi **tidak** didecode repo. |
| **Nullable** | bisa `null` menurut schema/API. |
| **Opsional** | properti tidak wajib ada. |

> **Catatan penting:** Schema Effect (`Schema.Struct`) di repo secara default **mengabaikan properti ekstra**, jadi bot tetap berjalan meski API mengembalikan lebih banyak field daripada schema. Field ekstra (❌) terdokumentasi di sini agar tidak ada yang terlewat.

---

## Ringkasan API

| # | API | Base URL | File service | Endpoint dipakai |
|---|---|---|---|---|
| 1 | Meteora DLMM Data | `https://dlmm.datapi.meteora.ag` (prod), `https://dlmm.dev.metdev.io` (dev) | `src/services/MeteoraApi.ts` | `/portfolio/total`, `/portfolio/open`, `/portfolio`, `/pools`, `/pools/{addr}`, `/positions/{poolAddress}/pnl`, `/pools/{addr}/historical-volume` |
| 2 | Meteora Pool Discovery | `https://pool-discovery-api.datapi.meteora.ag` | `src/services/MeteoraApi.ts` | `/pools` |
| 3 | RugCheck | `https://api.rugcheck.xyz` | `src/services/RugCheck.ts` | `/v1/tokens/{mint}/report/summary` |
| 4 | Jupiter Swap | `https://api.jup.ag` | `src/services/Zap.ts` | `/swap/v2/order`, `/swap/v2/execute` |
| 5 | Jupiter Token List | `https://token.jup.ag` | `src/services/TokenMeta.ts` | `/strict` |
| 6 | Solana RPC | `config.rpcUrl` | `src/services/Solana.ts`, `src/services/Dlmm.ts` | getLatestBlockhash, getBalance, getTokenAccountBalance, confirmTransaction, sendAndConfirm |

Semua request HTTP pakai header `accept: application/json`. Meteora & RugCheck me-restrict 2x retry (eksponensial 400ms) untuk status 429/5xx/network error; Jupiter retry 3x spaced 800ms.

---

## 1. Meteora DLMM Data API

`base = https://dlmm.datapi.meteora.ag` (live) / `https://dlmm.dev.metdev.io` (dev, saat `dev: true`).

Error respons (status non-2xx / tak terdecode) dibungkus `MeteoraApiError { path, status?, message }` atau `DecodeError { source, message }` (lihat `src/errors.ts:3`, `src/errors.ts:21`).

### 1.1 `GET /portfolio/total`

- Query: `user` (wajib)
- Schema repo: `PortfolioTotal` — `src/domain/portfolio.ts:3`
- Retry: ya

Contoh respons live:

```json
{
  "totalPnlUsd": "56.883934672274336",
  "totalPnlSol": "0.862382624797533",
  "totalPnlPctChange": "0.12769689432584067",
  "totalPnlSolPctChange": "0.14436594380666398",
  "totalClosedPositions": 1235
}
```

| Properti | Tipe | Decode | Keterangan |
|---|---|---|---|
| `totalPnlUsd` | string | ✅ `portfolio.ts:4` | Total PnL dalam USD |
| `totalPnlSol` | string | ✅ `portfolio.ts:5` | Total PnL dalam SOL |
| `totalPnlPctChange` | string | ✅ `portfolio.ts:6` | PnL % |
| `totalPnlSolPctChange` | string | ✅ `portfolio.ts:7` | PnL SOL % |
| `totalClosedPositions` | number | ❌ | Jumlah posisi closed (field baru, tidak ada di schema repo) |

### 1.2 `GET /portfolio/open`

- Query: `user` (wajib), `page` (default 1), `page_size` (default 50, maks 50)
- Schema decode: `OpenPortfolioResponse` — `src/domain/portfolio.ts:72`
- Sukses teruji live: ya

**Respons live (top-level):**

```json
{
  "page": 1,
  "pageSize": 5,
  "hasNext": false,
  "totalCount": 1,
  "totalPositions": 1,
  "total": {
    "totalPositions": 1,
    "balances": "22.452885847116526",
    "balancesSol": "0.2998360277227702",
    "unclaimedFees": "0.013074445498132756",
    "unclaimedFeesSol": "0.00017459626642342738",
    "pnl": "0.028993506802908797",
    "pnlSol": "0.000012078989193586853",
    "pnlPctChange": "0.12922204271052867",
    "pnlSolPctChange": "0.004026349258989524"
  },
  "solPrice": "74.88387790850506",
  "pools": [ "… lihat tabel OpenPool di bawah" ]
}
```

| Properti (top-level) | Tipe | Decode | Catatan |
|---|---|---|---|
| `page` | number | ✅ `portfolio.ts:73` | |
| `pageSize` | number | ✅ `portfolio.ts:74` | |
| `hasNext` | boolean | ✅ `portfolio.ts:73` | |
| `totalCount` | number | ✅ `portfolio.ts:76` | |
| `totalPositions` | number | ✅ `portfolio.ts:77` | |
| `solPrice` | string \| null | ✅ opsional `portfolio.ts:78` | Harga SOL untuk rate |
| `total` | object \| null | ✅ opsional `portfolio.ts:79` | Agregat (lihat `OpenPortfolioTotals`) |
| `pools` | `OpenPool[]` | ✅ `portfolio.ts:80` | |

**`total` — `OpenPortfolioTotals` (`portfolio.ts:13`):**

| Properti | Tipe | Decode |
|---|---|---|
| `totalPositions` | number | ✅ `portfolio.ts:13` |
| `balances` | string | ✅ `portfolio.ts:14` |
| `balancesSol` | string \| null | ✅ `portfolio.ts:15` |
| `unclaimedFees` | string | ✅ `portfolio.ts:16` |
| `unclaimedFeesSol` | string \| null | ✅ `portfolio.ts:17` |
| `pnl` | string | ✅ `portfolio.ts:18` |
| `pnlPctChange` | string | ✅ `portfolio.ts:19` |
| `pnlSol` | string \| null | ✅ `portfolio.ts:20` |
| `pnlSolPctChange` | string \| null | ✅ `portfolio.ts:21` |

**Contoh item `pools[]` live (1 item, sebagian nilai disingkat):**

```json
{
  "poolAddress": "CDqaSkKYgRGexyFbS8Bght5pVfadMZjbaQcJ7P4xX2Kj",
  "binStep": 200,
  "baseFee": 2.0,
  "collectFeeMode": 0,
  "tokenXMint": "AENK1YJ9978xp19xQLKat6eNmndf7Jg2FxFfKiwvpump",
  "tokenYMint": "So11111111111111111111111111111111111111112",
  "tokenXIcon": "https://axiomtrading-v2.axiom-cdn.io/…/logo.webp",
  "tokenYIcon": "https://raw…/SOL/logo.png",
  "tokenX": "LOUIE",
  "tokenY": "SOL",
  "rewardX": "",
  "rewardY": "",
  "balances": "22.452885847116526",
  "balancesSol": "0.2998360277227702",
  "unclaimedFees": "0.013074445498132756",
  "unclaimedFeesSol": "0.00017459626642342738",
  "feePerTvl24h": "7.854433135752053",
  "pnl": "0.028993506802908797",
  "pnlSol": "0.000012078989193586853",
  "pnlPctChange": "0.12922204271052867",
  "pnlSolPctChange": "0.004026349258989524",
  "totalDeposit": "22.43696678581175",
  "totalDepositSol": "0.299998545",
  "openPositionCount": 1,
  "listPositions": ["J9zxzaX2aNp5j5q6nUwQpzYLYJxSKBPxoUWbbUBww3"],
  "updatedAt": 17861017052,
  "outOfRange": false,
  "positionsOutOfRange": [],
  "poolPrice": 1.3150505878818823e-6,
  "poolStateUpdatedAtSlot": 437966640,
  "poolStateUpdatedAtBlockTime": 1786101050
}
```

**`OpenPool` (`portfolio.ts:44`) — semua properti:**

| Properti | Tipe | Decode | Catatan |
|---|---|---|---|
| `poolAddress` | string | ✅ `portfolio.ts:45` | |
| `binStep` | number | ✅ `portfolio.ts:46` | |
| `baseFee` | number | ✅ `portfolio.ts:47` | |
| `collectFeeMode` | number | ❌ | Mode collect fee (0 = base)/inline |
| `tokenXMint` | string | ✅ `portfolio.ts:51` | |
| `tokenYMint` | string | ✅ `portfolio.ts:52` | |
| `tokenXIcon` | string | ❌ | URL icon token X |
| `tokenYIcon` | string | ❌ | URL icon token Y |
| `tokenX` | string | ✅ `portfolio.ts:49` | Simbol token X |
| `tokenY` | string | ✅ `portfolio.ts:50` | Simbol token Y |
| `rewardX` | string | ❌ | Mint reward X |
| `rewardY` | string | ❌ | Mint reward Y |
| `balances` | string | ✅ `portfolio.ts:53` | Balance USD |
| `balancesSol` | string | ❌ | Balance SOL |
| `unclaimedFees` | string | ✅ `portfolio.ts:54` | Fee belum diklaim USD |
| `unclaimedFeesSol` | string | ❌ | Fee belum diklaim SOL |
| `feePerTvl24h` | string | ✅ `portfolio.ts:55` | |
| `pnl` | string | ✅ `portfolio.ts:55` | PnL live |
| `pnlSol` | string \| null | ✅ `portfolio.ts:57` | |
| `pnlPctChange` | string | ✅ `portfolio.ts:56` | |
| `pnlSolPctChange` | string \| null | ✅ `portfolio.ts:58` | |
| `totalDeposit` | string | ✅ `portfolio.ts:61` | Total deposit USD |
| `totalDepositSol` | string | ❌ | Total deposit SOL |
| `openPositionCount` | number | ✅ `portfolio.ts:62` | |
| `listPositions` | string[] | ✅ `portfolio.ts:63` | Address posisi |
| `updatedAt` | number | ❌ | Timestamp update |
| `outOfRange` | boolean \| null | ✅ `portfolio.ts:68` | |
| `positionsOutOfRange` | string[] | ✅ `portfolio.ts:66` | Address posisi di luar range |
| `positionsPnl` | `PositionPnlEntry[]` | ✅ (opsional `portfolio.ts:64`) | Diisi bot via `enrichOpenPortfolioPnl` |
| `positionsLive` | `PositionLiveEntry[]` | ✅ (opsional `portfolio.ts:65`) | Diisi bot via `attachLivePositions` |
| `poolPrice` | number | ✅ `portfolio.ts:69` | |
| `poolStateUpdatedAtSlot` | number \| null | ✅ (opsional `portfolio.ts:69`) | |
| `poolStateUpdatedAtBlockTime` | number \| null | ✅ (opsional `portfolio.ts:68`) | |

**`PositionPnlEntry` (`portfolio.ts:35-42`):**

| Properti | Tipe | Decode |
|---|---|---|
| `address` | string | ✅ |
| `pnlUsd` | string | ✅ |
| `pnlPctChange` | string | ✅ |
| `pnlSol` | string \| null | ✅ |
| `pnlSolPctChange` | string \| null | ✅ |

**`PositionLiveEntry` (`portfolio.ts:26-33`):**

| Properti | Tipe | Decode |
|---|---|---|
| `address` | string | ✅ |
| `amountX` | string | ✅ |
| `amountY` | string | ✅ |
| `feeX` | string | ✅ |
| `feeY` | string | ✅ |

### 1.3. Closed portfolio

- `GET /portfolio` — schema: `ClosedPortfolioResponse` — `src/domain/portfolio.ts:105`
- Query: `user` (wajib), `page` (default 1), `page_size` (default 50)
- Respons live dengan wallet uji mengembalikan empty pools (`{"page":1,"pageSize":2,"hasNext":false,"totalCount":0,"totalPositions":0,"pools":[]}`), jadi bentuk item di bawah diambil dari schema repo + OpenAPI spec (**belum terverifikasi live** dengan data).

| Properti (top-level) | Tipe | Decode (`portfolio.ts:106-112`) |
|---|---|---|
| `hasNext` | boolean | ✅ |
| `page` | number | ✅ |
| `pageSize` | number | ✅ |
| `totalCount` | number | ✅ |
| `totalPositions` | number | ✅ |
| `pools` | `ClosedPool[]` | ✅ |

**Item `pools[]` — `ClosedPool` (`portfolio.ts:87-104`):**

| Properti | Tipe | Decode (opsional/required) |
|---|---|---|
| `poolAddress` | string | ✅ |
| `binStep` | string \| number | ✅ union |
| `baseFee` | string \| number | ✅ union |
| `lastClosedAt` | number \| null | ✅ |
| `tokenX` | string | ✅ |
| `tokenY` | string | ✅ |
| `tokenXMint` | string | ✅ |
| `tokenYMint` | string | ✅ |
| `totalDeposit` | string | ✅ |
| `totalWithdrawal` | string | ✅ |
| `totalFee` | string | ✅ |
| `pnlUsd` | string | ✅ |
| `pnlSol` | string | ✅ |
| `pnlSolPctChange` | string | ✅ |
| `pnlPctChange` | string | ✅ |

> Per OpenAPI spec, item sebenarnya juga memiliki `tokenXIcon`, `tokenYIcon`, dan breakdown per-token (`totalDepositTokenX/Usd`, `totalWithdrawalTokenX/Usd`, `totalFeeTokenX/Usd`, dst untuk token Y) — **tidak** didecode schema repo.

### 1.4 `GET /pools/{address}`

- Schema decode: `DlmmPool` — `src/domain/pool.ts:16`
- Sukses teruji live: ya

**Respons live (pool "LOUIE-SOL"):**

```json
{
  "address": "CDqaSkbKYgRG2x…",
  "name": "LOUIE-SOL",
  "token_x": {
    "address": "…pump", "name": "The Miracle Duck", "symbol": "LOUIE", "decimals": 6,
    "is_verified": false, "holders": 1022,
    "freeze_authority_disabled": true, "total_supply": 892407081.380896,
    "price": 0.0001026783973741, "market_cap": 91630.92892148477
  },
  "token_y": { "…": "SOL", "decimals": 9, "price": 74.88, "market_cap": 43584623671.80 },
  "reserve_x": "4bG5Q…", "reserve_y": "Ghkv…",
  "token_x_amount": 6490059.119905, "token_y_amount": 24.249161016,
  "created_at": 1786170657000,
  "reward_mint_x": "111…", "reward_mint_y": "111…",
  "pool_config": { "bin_step": 200, "base_fee_pct": 2.0, "max_fee_pct": 0.0, "protocol_fee_pct": 10.0, "collect_fee_mode": 0 },
  "dynamic_fee_pct": 2.851875,
  "tvl": 2455.038144, "current_price": 1.315e-6,
  "apr": 33.69, "apy": 1.844e19, "has_farm": false, "farm_apr": 0.0, "farm_apy": 0.0,
  "volume": {"30m":…,"1h":…,"2h":…,"4h":…,"12h":…,"24h":…},
  "fees": {"30m":…,"1h":…,"24h":…},
  "protocol_fees": {"30m":…,"24h":…},
  "fee_tvl_ratio": {"30m":…,"24h":…},
  "cumulative_metrics": {"volume": 17880.65, "fees": 827.14},
  "is_blacklisted": false,
  "launchpad": "pump.fun",
  "tags": []
}
```

**`DlmmPool` — semua properti:**

| Properti | Tipe | Decode | Catatan |
|---|---|---|---|
| `address` | string | ✅ `pool.ts:17` | |
| `name` | string | ✅ `pool.ts:18` | |
| `token_x` | `TokenInfo` | ✅ `pool.ts:19` | |
| `token_y` | `TokenInfo` | ✅ `pool.ts:20` | |
| `tvl` | number | ✅ `pool.ts:21` | |
| `current_price` | number | ✅ `pool.ts:22` | |
| `apr` | number | ✅ `pool.ts:23` | APR 24 jam |
| `apy` | number | ✅ `pool.ts:24` | APY 24 jam |
| `farm_apr` | number | ✅ `pool.ts:25` | |
| `has_farm` | boolean | ✅ `pool.ts:26` | |
| `dynamic_fee_pct` | number | ✅ `pool.ts:27` | |
| `pool_config` | object | ✅ `pool.ts:28-33` | lihat bawah |
| `volume` | `TimeWindowData` | ✅ `pool.ts:34` | |
| `fees` | `TimeWindowData` | ✅ `pool.ts:35` | |
| `protocol_fees` | `TimeWindowData` | ✅ `pool.ts:36` | |
| `fee_tvl_ratio` | `TimeWindowData` | ✅ `pool.ts:37` | |
| `cumulative_metrics` | object | ✅ `pool.ts:38-41` | 〈`volume`, `fees`〉 |
| `reserve_x` | string | ❌ | ATA (Associated Token Account) token X |
| `reserve_y` | string | ❌ | |
| `token_x_amount` | number | ❌ | |
| `token_y_amount` | number | ❌ | |
| `created_at` | number | ❌ | |
| `reward_mint_x` | string | ❌ | |
| `reward_mint_y` | string | ❌ | |
| `farm_apy` | number | ❌ | ≠ yang di-decode |
| `is_blacklisted` | boolean | ❌ | |
| `launchpad` | string \| null | ❌ | |
| `tags` | string[] | ❌ | |

**`pool_config` (`pool.ts:28-33`) dan field ekstra live:**

| Properti | Tipe | Decode |
|---|---|---|
| `bin_step` | number | ✅ |
| `base_fee_pct` | number | ✅ |
| `max_fee_pct` | number | ✅ |
| `protocol_fee_pct` | number | ✅ |
| `collect_fee_mode` | number | ❌ |

**`TokenInfo` (`pool.ts:15-16`) — field live yang di-decode & ekstra:**

| Properti | Tipe | Decode |
|---|---|---|
| `address` | string | ✅ |
| `name` | string | ✅ |
| `symbol` | string | ✅ |
| `decimals` | number | ✅ |
| `price` | number | ✅ |
| `is_verified` | boolean | ✅ |
| `holders` | number | ✅ |
| `market_cap` | number | ✅ |
| `freeze_authority_disabled` | boolean | ❌ (ekstra) |
| `total_supply` | number | ❌ (ekstra) |

> OpenAPI spec: `CumulativeMetrics` saat ini `{ volume, trade_fee, protocol_fee }` — live mengembalikan `{volume, fees}`. schema repo membaca `{volume, fees}`. Perbedaan ini tidak error karena field ekstra diabaikan.

**`TimeWindowData` (`common.ts:23-31`) — angka `double` untuk kunci `30m`, `1h`, `2h`, `4h`, `12h`, `24h`** (semua ✅).

### 1.4b `GET /pools`

- Query: `page` (1-based), `page_size` (maks 1000), `query`, `sort_by` (format `metric_window:dir`, default `fee_tvl_ratio_24h:desc`), `filter_by` (ekspresi `field op value` dipisah `&&`)
- Schema decode: `DlmmPoolsResponse` — `src/domain/pool.ts:45`

```json
{
  "total": 121037,
  "pages": 121037,
  "current_page": 1,
  "page_size": 1,
  "data": [ "← setiap elemen = item DlmmPool (1.4)" ]
}
```

| Properti | Tipe | Decode (`pool.ts:46-50`) |
|---|---|---|
| `total` | number | ✅ |
| `pages` | number | ✅ |
| `current_page` | number | ✅ |
| `page_size` | number | ✅ |
| `data` | `DlmmPool[]` | ✅ |

### 1.5 `GET /positions/{poolAddress}/pnl`

- Query: `user` (wajib), `status` (`open`/`closed`/`all`, default `all`), `page`, `page_size` (maks 100)
- Schema decode: `PositionPnLResponse` — `src/domain/position.ts:40`

**Respons live:**

```json
{
  "tokenX": "0x0…pump",
  "tokenY": "So111…12",
  "totalCount": 2,
  "page": 1,
  "pageSize": 10,
  "hasNext": false,
  "positions": [ { "…lihat bawah…" } ],
  "tokenXPrice": "0.000102889937929",
  "tokenYPrice": "74.5672578691045",
  "rewardTokenX": "1111…",
  "rewardTokenY": "1111…",
  "rewardTokenXPrice": "0",
  "rewardTokenYPrice": "0",
  "solPrice": "74.5672578691045"
}
```

| Properti (top-level) | Tipe | Decode (`position.ts:40-55`) |
|---|---|---|
| `totalCount` | number | ✅ |
| `page` | number | ✅ |
| `pageSize` | number | ✅ |
| `hasNext` | boolean | ✅ |
| `positions` | `PositionPnLData[]` | ✅ |
| `tokenX` | string \| null | ✅ |
| `tokenXPrice` | string | ✅ |
| `tokenY` | string \| null | ✅ |
| `tokenYPrice` | string | ✅ |
| `rewardTokenX` | string \| null | ✅ |
| `rewardTokenXPrice` | string | ✅ |
| `rewardTokenY` | string \| null | ✅ |
| `rewardTokenYPrice` | string | ✅ |
| `solPrice` | string \| null | ✅ |

Semua top-level response cocok 100% dengan schema repo.

**Item `positions[]` — `PositionPnLData` (`position.ts:16-37`):**

Respons live (disederhanakan):

```json
{
  "positionAddress": "J9pxW…",
  "minPrice": "0.00000039294519", "maxPrice": "0.00000154079135",
  "lowerBinId": -396, "upperBinId": -327,
  "poolActiveBinId": -335, "isOutOfRange": false, "poolActivePrice": "0.00000131505059",
  "feePerTvl24h": "7.643887147203904", "isClosed": false,
  "createdAt": 1786100414, "closedAt": null, "updatedAt": 1786101087,
  "pnlUsd": "0.039551776358", "pnlPctChange": "0.176279515", "pnlSol": "0.0001636279",
  "pnlSolPctChange": "0.054542914",
  "allTimeDeposits": { "tokenX": {"amount":"0","usd":"0","amountSol":"0"},
                       "tokenY": {"amount":"0.299998545","usd":"22.437","amountSol":"0.299998545"},
                       "total": {"usd":"22.437","sol":"0.299998545"} },
  "allTimeWithdrawals": { "tokenX": {…}, "tokenY": {…}, "total": {…} },
  "allTimeFees": { "tokenX": {…}, "tokenY": {…}, "total": {"usd":"0.12","sol":"0.00162"} },
  "unrealizedPnl": { "balances":22.463, "balancesSol":"0.2999",
                     "balanceTokenX":{"amount":"3248.45","usd":"0.3335","amountSol":"0.0044"},
                     "balanceTokenY":{…}, "unclaimedFeeTokenX":{…}, "unclaimedFeeTokenY":{…},
                     "unclaimedRewardTokenX":{…}, "unclaimedRewardTokenY":{…} }
}
```

| Properti | Tipe | Decode | Catatan |
|---|---|---|---|
| `positionAddress` | string | ✅ `position.ts:17` | |
| `minPrice` | string | ✅ `position.ts:18` | |
| `maxPrice` | string | ✅ `position.ts:19` | |
| `lowerBinId` | number | ✅ `position.ts:20` | |
| `upperBinId` | number | ✅ `position.ts:21` | |
| `feePerTvl24h` | string | ✅ `position.ts:22` | |
| `isClosed` | boolean | ✅ `position.ts:23` | |
| `pnlUsd` | string | ✅ `position.ts:24` | |
| `pnlPctChange` | string | ✅ `position.ts:25` | |
| `pnlSol` | string \| number | ✅ nullable `position.ts:26` | |
| `pnlSolPctChange` | string \| number | ✅ nullable `position.ts:27` | |
| `allTimeDeposits` | `TokenPairTotal` | ✅ `position.ts:28` | |
| `allTimeWithdrawals` | `TokenPairTotal` | ✅ `position.ts:29` | |
| `allTimeFees` | `TokenPairTotal` | ✅ `position.ts:30` | |
| `unrealizedPnl` | `UnrealizedPnl` \| null | ✅ (opsional, `position.ts:31`) | |
| `closedAt` | number \| null | ✅ `position.ts:32` | |
| `createdAt` | number \| null | ✅ `position.ts:33` | |
| `isOutOfRange` | boolean \| null | ✅ `position.ts:34` | |
| `poolActiveBinId` | number \| null | ✅ `position.ts:35` | |
| `poolActivePrice` | string \| null | ✅ `position.ts:36` | |
| `updatedAt` | number | ❌ (ekstra) | |

**`TokenPairTotal`/`TokenAmount`/`TotalUsd` (`common.ts`):**

`TokenPairTotal` (`common.ts:16-21`):
| Properti | Tipe | Decode |
|---|---|---|
| `tokenX` | `TokenAmount` | ✅ |
| `tokenY` | `TokenAmount` | ✅ |
| `total` | `TotalUsd` | ✅ |

`TokenAmount` (`common.ts:3-8`): `amount` string ✅, `amountSol` string\|null ✅, `usd` string ✅.
`TotalUsd` (`common.ts:10-14`): `usd` string ✅, `sol` string\|null ✅.

**`UnrealizedPnl` (`position.ts:4-14`):**

| Properti | Tipe | Decode |
|---|---|---|
| `balances` | number | ✅ |
| `balancesSol` | string \| null | ✅ |
| `balanceTokenX` | `TokenAmount` | ✅ |
| `balanceTokenY` | `TokenAmount` | ✅ |
| `unclaimedFeeTokenX` | `TokenAmount` | ✅ |
| `unclaimedFeeTokenY` | `TokenAmount` | ✅ |
| `unclaimedRewardTokenX` | `TokenAmount` | ✅ |
| `unclaimedRewardTokenY` | `TokenAmount` | ✅ |

### 1.6 `GET /pools/{address}/historical-volume` — ⚠️ **GAGAL (404)**

- Dipanggil repo: `MeteoraApi.ts:263` — path `/pools/{address}/historical-volume`, schema `PoolHistoricalVolumeArray` = array langsung `{timestamp, volume}` (`pool.ts:54-64`).
- Hasil live: **404 Not Found** — endpoint dihapus dari server Meteora.

**Pengganti resmi** (per OpenAPI spec): `GET /pools/{address}/volume/history?timeframe={5m|1h|…|24h}&start_time=&end_time=`

Respons penggantinya live:

```json
{
  "start_time": 1785369600,
  "end_time": 1786147200,
  "timeframe": "24h",
  "data": [
    { "timestamp": 1785369600, "timestamp_str": "2026-07-30T00:00:00+00:00",
      "volume": 0.0, "fees": 0.0, "protocol_fees": 0.0 }
    /* … */
  ]
}
```

| Properti | Tipe | Decode repo |
|---|---|---|
| `start_time`, `end_time`, `timeframe` | number/number/string | ❌ (tidak di schema) |
| `data[].timestamp` | number | ✅ |
| `data[].timestamp_str` | string | ❌ |
| `data[].volume` | number | ✅ |
| `data[].fees` | number | ❌ |
| `data[].protocol_fees` | number | ❌ |

> **Perhatian:** bahkan dengan endpoint baru sekalipun, schema repo tidak akan cocok: repo mengharapkan body **array langsung** `[{timestamp,volume}]` sedangkan endpoint baru mengembalikan **objek envelope** `{…,data:[…]}`. Metode `poolHistoricalVolume` saat ini selalu error `MeteoraApiError(404)`.

---

## 2. Meteora Pool Discovery API

Base: `https://pool-discovery-api.datapi.meteora.ag`

### `GET /pools`

- Query: `page_size` (default 50, maks 50), `filter_by` (ekspresi dari `buildDiscoveryFilter` — `src/lib/screening.ts:12`), `timeframe` (`5m`/`30m`/…/`24h`), `category` (`trending`/`top`/dll).
- Schema decode: `DiscoveryPoolsResponse` — `src/domain/discovery.ts:63`

**Respons live (top-level):**

| Properti | Tipe | Decode | Catatan |
|---|---|---|---|
| `total` | number | ✅ `discovery.ts:63` | |
| `page_size` | number | ✅ (opsional) `discovery.ts:68` | |
| `data` | `DiscoveryPool[]` | ✅ `discovery.ts:67` | |
| `pages` | number | ✅ opsional `discovery.ts:64` | tidak muncul di respons live tanpa param page |
| `current_page` | number | ✅ opsional `discovery.ts:65` | idem |
| `after_key` | string | ❌ (ekstra) | cursor pagination (base64) |
| `has_more` | boolean | ❌ (ekstra) | |

**Item pool — `DiscoveryPool` (live penuh, dari respons asli):** field dengan ❌ adalah ekstra yang tidak dibaca schema repo.

Skalar yang di-decode: `pool_address` ✅, `name` ✅, `pool_type` ✅, `tvl` ✅, `active_tvl` ✅, `pool_price` ✅, `volatility` ✅, `volume` ✅, `fee` ✅, `fee_active_tvl_ratio` ✅, `active_positions` ✅, `active_positions_pct` ✅, `open_positions` ✅, `fee_pct` ✅ (opsional), `pool_price_change_pct` ✅ (opsional), `volume_change_pct` ✅ (opsional), `fee_change_pct` ✅ (opsional), `swap_count` ✅ (opsional), `unique_traders` ✅ (opsional), `min_price` ✅ (opsional), `max_price` ✅ (opsional), `price_trend` ✅ (opsional, `Schema.Unknown`), dan kolom ekstra di bawah.

Semua field respons live (urutan per objek JSON asli):

| Properti | Tipe | Decode |
|---|---|---|
| `pool_address` | string | ✅ `discovery.ts:20` |
| `name` | string | ✅ `discovery.ts:21` |
| `pool_type` | string | ✅ `discovery.ts:22` |
| `fee_pct` | number | ✅ opsional `discovery.ts:59` |
| `pool_created_at` | number | ❌ |
| `is_blacklisted` | boolean | ❌ |
| `dlmm_params.bin_step` | number | ✅ opsional `discovery.ts:43` |
| `dlmm_params.collect_fee_mode` | string | ✅ opsional `discovery.ts:44` |
| `damm_v2_params` | any \| null | ❌ |
| `base_token_holders` | number | ❌ |
| `base_token_holders_change_pct` | number | ❌ |
| `base_token_market_cap_change_pct` | number | ❌ |
| `base_token_fdv_change_pct` | number | ❌ |
| `tvl` | number | ✅ |
| `tvl_change_pct` | number | ❌ |
| `active_tvl` | number | ✅ |
| `active_tvl_change_pct` | number | ❌ |
| `fee_active_tvl_ratio` | number | ✅ |
| `fee_active_tvl_ratio_change_pct` | number | ❌ |
| `volume_active_tvl_ratio` | number | ❌ |
| `volume_active_tvl_ratio_change_pct` | number | ❌ |
| `volume_tvl_ratio` | number | ❌ |
| `volume_tvl_ratio_change_pct` | number | ❌ |
| `volume` | number | ✅ |
| `volume_change_pct` | number | ✅ opsional |
| `avg_volume` | number | ❌ |
| `fee` | number | ✅ |
| `fee_change_pct` | number | ✅ opsional |
| `avg_fee` | number | ❌ |
| `fee_tvl_ratio` | number | ❌ (mirip `fee_active_tvl_ratio`) |
| `fee_tvl_ratio_change_pct` | number | ❌ |
| `swap_count` | number | ✅ opsional |
| `swap_count_change_pct` | number | ❌ |
| `avg_swap_count` | number | ❌ |
| `unique_lps` | number | ❌ |
| `unique_lps_change_pct` | number | ❌ |
| `unique_traders` | number | ✅ opsional |
| `unique_traders_change_pct` | number | ❌ |
| `net_deposits` | number | ❌ |
| `net_deposits_change_pct` | number | ❌ |
| `total_deposits` | number | ❌ |
| `total_withdraws` | number | ❌ |
| `open_positions` | number | ✅ |
| `active_positions` | number | ✅ |
| `active_positions_pct` | number | ✅ |
| `positions_created` | number | ❌ |
| `positions_created_change_pct` | number | ❌ |
| `permanent_lock_liquidity_pct` | number | ❌ |
| `has_farm` | boolean | ❌ |
| `dynamic_fee_pct` | number | ❌ |
| `pool_price` | number | ✅ |
| `pool_price_change_pct` | number | ✅ opsional |
| `max_price` | number | ✅ opsional |
| `min_price` | number | ✅ opsional |
| `volatility` | number | ✅ |
| `correlation` | number | ❌ |
| `price_trend` | array | ✅ opsional (`Schema.Unknown`) |
| `token_x` | `DiscoveryTokenInfo` | ✅ |
| `token_y` | `DiscoveryTokenInfo` | ✅ |

> Catatan: tidak ada `pool_config` di respons live (opsional di schema; jika ada bentuknya `{bin_step, base_fee_pct}`). `pool_config`/`dlmm_params` di schema optional.

**`DiscoveryTokenInfo` (`discovery.ts:3-17`) — field live:**

| Properti | Tipe | Decode |
|---|---|---|
| `address` | string | ✅ |
| `symbol` | string | ✅ |
| `name` | string | ✅ |
| `decimals` | number | ✅ |
| `price` | number | ✅ |
| `market_cap` | number | ✅ |
| `holders` | number | ✅ |
| `organic_score` | number | ✅ |
| `created_at` | number | ✅ |
| `dev` | string | ✅ opsional (tidak ada di live) |
| `launchpad` | string \| null | ✅ opsional (tidak ada di live) |
| `warnings[]` | `{type, message, severity}` | ✅ opsional (`Schema.Unknown` array) |
| `icon` | string | ❌ |
| `is_verified` | boolean | ❌ |
| `has_freeze_authority` | boolean | ❌ |
| `has_mint_authority` | boolean | ❌ |
| `total_supply` | number | ❌ |
| `fdv` | number | ❌ |
| `tags` | string[] | ❌ |
| `organic_score_label` | string | ❌ |
| `token_program` | string | ❌ |
| `top_holders_pct` | number | ❌ |
| `dev_balance_pct` | number | ❌ |

`warnings[]` (dari live): `{ "type": "NOT_VERIFIED", "message": "…", "severity": "info" }`.

Catatan: `screen()` (`Screening.ts:43`) memakai `DiscoveryPool` dan menghitung `ScreenedPool` — lihat bagian hasil internal.

---

## 3. RugCheck API

Base: `https://api.rugcheck.xyz`
- Endpoint: `GET /v1/tokens/{mint}/report/summary?key={API_KEY}` (API key hardcode di `src/services/RugCheck.ts:19` — ⚠️ sebaiknya dipindahkan ke config).
- Schema decode: `TokenSummary` — `src/services/RugCheck.ts:21`
- Status 2xx sukses hingga `Effect.retry` untuk 429/5xx.

**Respons live:**

```json
{
  "tokenProgram": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "tokenType": "",
  "risks": [],
  "score": 1,
  "score_normalised": 1,
  "lpLockedPct": 0
}
```

| Properti | Tipe | Decode (`RugCheck.ts:29-41`) |
|---|---|---|
| `tokenProgram` | string | ✅ |
| `tokenType` | string | ✅ |
| `risks` | array \| null | ✅ opsional; bila ada `[]` |
| `risks[].name` | string | ✅ |
| `risks[].level` | string | ✅ |
| `risks[].score` | number | ✅ |
| `risks[].description` | string | ✅ |
| `score` | number | ✅ |
| `score_normalised` | number | ✅ |
| `lpLockedPct` | number | ✅ |
| `mint` | string | ✅ opsional (tidak muncul di live, hanya skema) |

Service `getScore()` mengembalikan `score`, dan 404 diterjemahkan sebagai `null` (`RugCheck.ts:117-123`).

---

## 4. Jupiter Swap API

Base: `https://api.jup.ag`, header `x-api-key: jup_…` (hardcode `Zap.ts:26`).

### 4.1 `GET /swap/v2/order`

Query: `inputMint`, `outputMint`, `amount`, `taker`, `slippageBps` (datetime opsional).
Schema decode: `JupiterOrderResponse` — `src/services/Zap.ts:115`

**Respons live (penuh — banyak field ekstra):**

```json
{
  "swapType":"aggregator","inAmount":"1000000","outAmount":"74896",
  "otherAmountThreshold":"74147","swapMode":"ExactIn","slippageBps":100,
  "priceImpactPct":"-0.000190148381556", "routePlan":[{"percent":100,"bps":10000,
    "usdValue":0.0748740541,"swapInfo":{"ammKey":"8Fn…","label":"BisonF","ammKey":"…",
    "inputMint":"So…","outputMint":"EPjF…","inAmount":"1000000","outAmount":"74910"}}],
  "feeMint":"So…","feeBps":2,"platformFee":{"feeBps":2,"feeMint":"So…"},
  "taker":"81g…","gasless":false,"jitOptimized":false,
  "signatureFeeLamports":5000,"signatureFeePayer":"81g…",
  "prioritizationFeeLamports":409068,"prioritizationFeePayer":"81g…",
  "rentFeeLamports":4078560,"rentFeePayer":"81g…",
  "transaction":"<base64 versioned tx>","lastValidBlockHeight":"416020992",
  "inputMint":"So…","outputMint":"EPj…","router":"metis","guaranteedPrice":false,
  "requestId":"019fe0b1-94d5-703c-a966-6b2ff6a2730a",
  "inUsdValue":0.074888,"outUsdValue":0.074874,"swapUsdValue":0.074874,
  "priceImpact":-0.019,"mode":"manual","totalTime":232
}
```

| Properti | Tipe | Decode (`Zap.ts:116-119`) |
|---|---|---|
| `transaction` | string \| null | ✅ |
| `requestId` | string | ✅ |
| `errorMessage` | string | ✅ opsional |
| `swapType` | string | ❌ |
| `inAmount` | string | ❌ |
| `outAmount` | string | ❌ |
| `otherAmountThreshold` | string | ❌ |
| `swapMode` | `"ExactIn"` / … | ❌ |
| `slippageBps` | number | ❌ |
| `priceImpactPct` | string | ❌ |
| `routePlan[]` | array (lihat bawah) | ❌ |
| `feeMint` | string | ❌ |
| `feeBps` | number | ❌ |
| `platformFee` | `{feeBps, feeMint}` | ❌ |
| `taker` | string | ❌ |
| `gasless` | boolean | ❌ |
| `jitOptimized` | boolean | ❌ |
| `signatureFeeLamports` | number | ❌ |
| `signatureFeePayer` | string | ❌ |
| `prioritizationFeeLamports` | number | ❌ |
| `prioritizationFeePayer` | string | ❌ |
| `rentFeeLamports` | number | ❌ |
| `rentFeePayer` | string | ❌ |
| `lastValidBlockHeight` | string | ❌ |
| `inputMint` | string | ❌ |
| `outputMint` | string | ❌ |
| `router` | string | ❌ |
| `guaranteedPrice` | boolean | ❌ |
| `inUsdValue` | number | ❌ |
| `outUsdValue` | number | ❌ |
| `swapUsdValue` | number | ❌ |
| `priceImpact` | number | ❌ |
| `mode` | string | ❌ |
| `totalTime` | number | ❌ |

`routePlan[]` item: `{.percent:number, bsp:number, usdValue:number, swap:{ammKey, label, inputMint, outputMint, inAmount, outAmount}}` (type dari live; tidak didecode).

### 4.2 `POST /swap/v2/execute`

Body json: `{"signedTransaction":"<base64>","requestId":"…"}`.
Schema decode: `JupiterExecuteResponse` — `src/services/Zap.ts:122`. **Tidak diuji live** (butuh tanda tangan & eksekusi nyata/berbiaya).

| Properti | Tipe | Decode |
|---|---|---|
| `status` | literal `"Success"` \| `"Failed"` | ✅ |
| `signature` | string | ✅ |
| `error` | string | ✅ opsional |

### 4.3 `GET https://token.jup.ag/strict`

- Dipakai `TokenMeta` — `src/services/TokenMeta.ts:9`
- Schema decode: `TokenList` — array `TokenListEntry` per elemen
- ⚠️ **DNS `token.jup.ag` gagal resolve dari environment uji (2026-08-08)** sehingga tidak bisa diverifikasi live. Bentuk dari schema:

| Properti | Tipe | Decode (`TokenMeta.ts:12-18`) |
|---|---|---|
| `address` | string | ✅ |
| `symbol` | string | ✅ |
| `decimals` | number | ✅ |
| `name` | string | ✅ |

`TokenMetaService.get()` memetakan ke `{symbol, decimals, name}` (tanpa `address`).

---

## 5. Respons internal (SDK DLMM + Solana RPC)

Bukan HTTP API langsung, tapi hasil fungsi service yang direturn ke handler UI.

### `DlmmService` (`src/services/Dlmm.ts:61`)

**`previewRange()` → `RangePreview` (`Dlmm.ts:41-50`):**
`activeBinId`, `minBinId`, `maxBinId`, `binStep`, `tokenXMint`, `tokenYMint`, `decimalsX`, `decimalsY` (semuanya readonly number/string, dari `DLMM.create` + `getActiveBin`).

**`quotePositionCost()` → `PositionCostQuote` (`src/domain/onchain.ts:37`)** — diderivasi dari `sdkQuote` (`dlmm.quoteCreatePosition`):

| Properti | Tipe | Sumber |
|---|---|---|
| `positionCount` | number | `sdkQuote.positionCount` |
| `positionCost` | number | `sdkQuote.positionCost` |
| `positionReallocCost` | number | `sdkQuote.positionReallocCost` |
| `bitmapExtensionCost` | number | `sdkQuote.bitmapExtensionCost` |
| `binArraysCount` | number | `sdkQuote.binArraysCount` |
| `binArrayCost` | number | `sdkQuote.binArrayCost` |
| `transactionCount` | number | `sdkQuote.transactionCount` |
| `totalCost` | number | non-ref + refundable |
| `nonRefundableCost` | number | binArrayCost + bitmapExtensionCost |
| `refundableCost` | number | positionCost + positionReallocCost |

(perhitungan: `Dlmm.ts:152-166` — field sesuai SDK `@meteora-ag/dlmm`)

**`createPosition()` → `CreatePositionResult` (`onchain.ts:19`):** `signatures: string[]`, `positions: string[]`, `minBinId`, `maxBinId`, `binCount`.

**`fetchUserPositions()` → `UserPositionLive[]` (`Dlmm.ts:52`):** `{poolAddress, positionAddress, amountX, amountY, feeX, feeY}` (semua string, dari `DLMM.getAllLbPairPositionsByUser` + `.totalXAmount/.totalYAmount/.feeX/.feeY` dikonversi asset atomic→human).

**Mutasi return `string`** (signature tx): `closePosition`, `addLiquidity`, `removeLiquidity`, `claimFee`, `claimReward` (`Dlmm.ts:61-90`).

### `ZapService` (`src/services/Zap.ts:63`)

| Service | Return type | Field |
|---|---|---|
| `claimAndZapOut` / `closeAndZapOut` | `ZapOutResult` (`Zap.ts:49`) | `transactions[]`, `outputMint`, `claimSig?`, `closeSig?`, `zapSig?` |
| `swapExactIn` | `SwapExactInResult` (`Zap.ts:57`) | `signature`, `received` (BN), `outputMint` |
| `getSolBalance` | `BN` | lamports |

### `RugCheck.getScore` → `number \| null`

404 → `null`; lainnya error `RugCheckApiError`.

### `TokenMeta.get` → `TokenMetaInfo | null` (`TokenMeta.ts:26`): `{symbol, decimals, name}`.

### `Screening.screen` → `ScreenResult` (`src/lib/screening.ts:163`): `{pools: ScreenedPool[], total, filtered}`

`ScreenedPool` (`src/domain/screened.ts:1`): `pool, name, baseSymbol, baseMint, quoteSymbol, tvl, activeTvl, mcap, holders, organicScore, quoteOrganic, feeActiveTvlRatio, volatility, binStep, baseFeePct, volume, fee, activePositions, openPositions, tokenAgeHours, score, price, priceChangePct, volumeChangePct, tokenXAddress, rugScore?`.

(`rugScore` di-set dari RugCheck setelah screening — `screening.ts:55-65`.)

---

## 6. Error responses

### Payload error Meteora (400 per OpenAPI `ErrorResponse`)

```json
{ "message": "…" }
```

### Tag error di repo (`src/errors.ts`)

| Tag | Field | Definisi |
|---|---|---|
| `MeteoraApiError` | `path`, `status?`, `message` | errors.ts:3 |
| `JupiterApiError` | `stage: "order"\|"execute"`, `status?`, `message` | errors.ts:9 |
| `RugCheckApiError` | `mint`, `status?`, `message` | errors.ts:15 |
| `DecodeError` | `source`, `message` | errors.ts:21 |
| `RpcError` | `op`, `message` | errors.ts:26 |
| `OnchainError` | `op`, `message` | errors.ts:31 |
| `ConfigError`, `SignerError`, `WalletError`, `ValidationError`, `StateError` | `message` (+`file` utk StateError) | errors.ts:36–54 |

`errorMessage()` (`errors.ts:70`) mengembalikan `e.message`.

---

## 7. Ringkasan Temuan / Discrepancies (hasil uji live 2026-08-08)

1. **`/portfolio/total`** menampilkan `totalClosedPositions` (baru) — tidak di-decode schema.
2. **Item `/portfolio/open`** punya beberapa field yang tidak ada di schema repo: `collectFeeMode`, `tokenXIcon`, `tokenYIcon`, `rewardX`, `rewardY`, `balancesSol`, `unclaimedFeesSol`, `totalDepositSol`, `updatedAt`. Tidak crash karena schema melewat field ekstra.
3. **`GET /pools/{address}/historical-volume` → 404** — endpoint dihapus. Penggantinya `/volume/history` dengan **envelope berbeda** (`{start_time,end_time,timeframe,data}`) sehingga `poolHistoricalVolume()` di repo **error** meskipun path diganti (schema mengharapkan array).
4. **Item `/portfolio` (closed)** tidak tervalidasi live (wallet test kosong); dokumentasi dari schema + OpenAPI (termasuk breakdown per-token yang **tidak** dipakai repo).
5. **Jupiter `/swap/v2/order`** mengembalikan ~30 field yang tidak di-decode repo (hanya `transaction`, `requestId`, `errorMessage` — runtime-stable).
6. **`token.jup.ag/strict`** tidak bisa diverifikasi live karena DNS/env keblokir; bentuk diambil dari schema (`address`, `symbol`, `decimals`, `name`).
7. **Discovery API** menggunakan pagination cursor (`after_key`,`has_more`) yang diabaikan repo (repo hanya `total` + `data`), dan object pool jauh lebih kaya dari schema.
8. **API key RugCheck & Jupiter hardcode** di source (`RugCheck.ts:19`, `Zap.ts:26`) — risiko keamanan; sebaiknya pindah ke `vexis.config.json`.
