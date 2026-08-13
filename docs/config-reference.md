# Referensi Konfigurasi Vexis

Dokumen ini berisi referensi lengkap semua key konfigurasi Vexis — bot manajemen posisi DLMM Meteora di Solana. Nilai default diambil dari `vexis.config.example.json` dan schema `src/domain/config.ts`.

## Cara Config Dimuat

1. `$VEXIS_CONFIG` — path eksplisit (env var), prioritas tertinggi.
2. `./vexis.config.json` — file di direktori kerja.
3. `~/.vexis/config.json` — file di home directory.

Environment overrides:

- `VEXIS_PRIVATE_KEY` — override `privateKey`
- `TELEGRAM_BOT_TOKEN` — override `telegramBotToken`
- `TELEGRAM_CHAT_ID` — override `telegramChatId`
- `VEXIS_WEB_PASSWORD` — override `web.password`
- `OPENAI_API_KEY` — fallback `agent.llm.apiKey`

**Penting:**

- `rpcUrl` hanya bisa di-set lewat config file — **tidak ada** environment variable `RPC_URL`.
- `vexis.config.json` di-gitignore karena bisa berisi secret. Contoh lengkap selalu di `vexis.config.example.json`.

## Top-Level Keys

| Key | Tipe | Deskripsi |
|---|---|---|
| `wallet` | string | Alamat wallet Solana default untuk query portfolio |
| `privateKey` | string | Kunci privat base64/base58 — dibaca sekali di startup, tidak pernah ditulis ke disk. Hanya dibutuhkan untuk operasi on-chain (create, close, add/remove liquidity, claim) |
| `rpcUrl` | string | Endpoint RPC Solana |
| `telegramBotToken` | string | Token bot Telegram dari @BotFather |
| `telegramChatId` | string | Numeric chat ID (dari @userinfobot) |
| `alertInterval` | number | Interval cek alert dalam menit (`0` = disabled) |
| `stopLossPct` | number \| null | Ambang stop-loss default (%) |
| `takeProfitPct` | number \| null | Ambang take-profit default (%) |
| `pageSize` | number | Ukuran halaman hasil query |
| `dev` | boolean | Mode dev |

## `agent.*` — AI Agent

Konfigurasi AI agent (lihat [Panduan AI Agent](ai-agent.md) untuk cara pakai).

| Key | Default | Deskripsi |
|---|---|---|
| `agent.enabled` | `false` | Aktif tidak otomatis — mulai via `/agent start` |
| `agent.intervalMinutes` | `15` | Interval job OOR (menit) |
| `agent.maxCandidates` | `5` | Jumlah kandidat teratas yang dilihat LLM |
| `agent.minCandidate` | `70` | **`@deprecated`** — sudah tidak men-gate keputusan (LLM yang decide). Dipertahankan untuk kompatibilitas config |
| `agent.maxSolPerPosition` | `0.5` | Cap SOL per posisi |
| `agent.maxTotalSol` | `3` | Cap SOL total deployed |
| `agent.maxOpenPositions` | `4` | Maks posisi terbuka |
| `agent.txCooldownMs` | `300000` (5 menit) | Cooldown antar OPEN |
| `agent.poolCooldownMs` | `86400000` (24 jam) | Cooldown per pool setelah close/block |
| `agent.tpPct` | `25` (atau `takeProfitPct`) | Ambang take-profit % |
| `agent.slPct` | `-10` (atau `stopLossPct`) | Ambang stop-loss % |
| `agent.notifLevel` | — | **`@deprecated`** — notifikasi selalu terkirim; dipertahankan untuk kompatibilitas |

### `agent.llm.*` — LLM

| Key | Default | Deskripsi |
|---|---|---|
| `llm.baseUrl` | `https://api.openai.com/v1` | Base URL API OpenAI-compatible |
| `llm.model` | `gpt-4o-mini` | Model LLM |
| `llm.apiKey` | env `OPENAI_API_KEY` | API key |
| `llm.timeoutMs` | `120000` | Timeout request LLM |

### `agent.risks.*` — Guardrail Risiko

Filter risiko deterministik yang tidak bisa di-bypass LLM.

| Key | Default | Deskripsi |
|---|---|---|
| `risks.enabled` | `true` | Aktifkan filter risiko |
| `risks.minTokenFeesSol` | `30` | Minimal fee token (SOL) agar lolos |
| `risks.maxBundlePct` | `30` | Cap persentase bundled holders |
| `risks.maxBotHoldersPct` | `30` | Cap persentase bot holders |
| `risks.maxTop10Pct` | `60` | Cap persentase top-10 holders |
| `risks.maxPriceVsAthPct` | `80` | Cap jarak harga dari ATH (%) |
| `risks.blockWash` | `true` | Blokir pool dengan indikasi wash trading |
| `risks.blockRugpull` | `true` | Blokir pool terindikasi rugpull |
| `risks.blockDexScreenerPaid` | `true` | Blokir pool berbayar di DEX Screener |
| `risks.blockDevSoldAll` | `true` | Blokir pool dengan dev yang menjual semua |

### `agent.darwin.*` — Learning Bobot Sinyal

Bobot sinyal heuristic di-recalculate dari PnL posisi yang sudah ditutup.

| Key | Default | Deskripsi |
|---|---|---|
| `darwin.enabled` | `true` | Aktifkan recalculation bobot |
| `darwin.windowDays` | `60` | Window data (hari) |
| `darwin.recalcEvery` | `5` | Recalc setelah N close |
| `darwin.boostFactor` | `1.05` | Faktor naik bobot sinyal bagus |
| `darwin.decayFactor` | `0.95` | Faktor turun bobot sinyal jelek |
| `darwin.weightFloor` | `0.3` | Batas bawah bobot |
| `darwin.weightCeiling` | `2.5` | Batas atas bobot |
| `darwin.minSamples` | `10` | Minimal sample untuk recalc |

## `pools.*` — Filter Screening

Filter pool dari Meteora Pool Discovery API. **Set `null` untuk melewati filter.**

| Filter | Config Key | Default | Deskripsi |
|---|---|---|---|
| Page size | `pools.pageSize` | `50` | Jumlah pool per halaman API |
| Timeframe | `pools.timeframe` | `"30m"` | Timeframe screening |
| Kategori | `pools.category` | `"top"` | Kategori pool |
| Base token warnings | `pools.baseTokenHasHighSupplyConcentration` | `false` | Boolean — exclude konsentrasi supply tinggi |
| Base token ownership | `pools.baseTokenHasHighSingleOwnership` | `false` | Boolean — exclude single ownership tinggi |
| Market cap | `pools.minMcap` / `pools.maxMcap` | `250000` / `10000000` | Min/max market cap base token |
| Holders | `pools.minHolders` / `pools.maxHolders` | `500` / `null` | Min/max holders base token |
| Organic score | `pools.minOrganic` / `pools.maxOrganic` | `60` / `null` | Min/max organic score base token |
| Token age | `pools.minTokenAgeHours` / `pools.maxTokenAgeHours` | `null` / `null` | Min/max umur token (jam) |
| Launchpad | `pools.blockedLaunchpads` | `[]` | Array nama launchpad yang diblokir |
| Quote organic | `pools.minQuoteOrganic` / `pools.maxQuoteOrganic` | `60` / `null` | Min/max organic score quote token |
| TVL | `pools.minTvl` / `pools.maxTvl` | `5000` / `200000` | Min/max total value locked |
| Active TVL | `pools.minActiveTvl` / `pools.maxActiveTvl` | `null` / `null` | Min/max active TVL |
| Volume | `pools.minVolume` / `pools.maxVolume` | `1000` / `null` | Min/max volume trading |
| Volume 24h | `pools.minVolume24h` / `pools.maxVolume24h` | `500000` / `null` | Min/max volume 24 jam (**server-side, independen dari `timeframe`**) |
| Fee | `pools.minFee` / `pools.maxFee` | `50` / `null` | Min/max fee ($) |
| Fee/TVL ratio | `pools.minFeeActiveTvlRatio` / `pools.maxFeeActiveTvlRatio` | `0.05` / `null` | Min/max rasio fee-to-TVL |
| Bin step | `pools.minBinStep` / `pools.maxBinStep` | `20` / `125` | Min/max DLMM bin step |
| Volatility | `pools.minVolatility` / `pools.maxVolatility` | `null` / `null` | Min/max volatilitas pool |
| Pool price | `pools.minPoolPrice` / `pools.maxPoolPrice` | `null` / `null` | Min/max harga pool |
| Active positions | `pools.minActivePositions` / `pools.maxActivePositions` | `null` / `null` | Min/max posisi aktif |
| Open positions | `pools.minOpenPositions` / `pools.maxOpenPositions` | `null` / `null` | Min/max posisi terbuka |
| Swap count | `pools.minSwapCount` / `pools.maxSwapCount` | `null` / `null` | Min/max jumlah swap |
| Unique traders | `pools.minUniqueTraders` / `pools.maxUniqueTraders` | `null` / `null` | Min/max trader unik |
| Price change | `pools.minPriceChangePct` / `pools.maxPriceChangePct` | `null` / `null` | Min/max perubahan harga (%) |
| Volume change | `pools.minVolumeChangePct` / `pools.maxVolumeChangePct` | `null` / `null` | Min/max perubahan volume (%) |
| Price trend | `pools.priceTrend` | `null` | Filter arah tren harga |
| SOL pair only | `pools.solPairOnly` | `true` | Boolean — hanya pool berpasangan SOL |
| Display limit | `pools.displayLimit` | `15` | Jumlah pool yang ditampilkan |

## `create.*` — Default Pembuatan Posisi

| Key | Default | Deskripsi |
|---|---|---|
| `create.strategy` | `"bidask"` | Distribusi likuiditas: `spot`, `curve`, `bidask` |
| `create.mode` | `"single-y"` | `two-sided`, `single-x`, atau `single-y` |
| `create.range` | `{ "type": "default" }` | Rentang: `default`, `bin` (`minBin`/`maxBin`), `pct` (`minPct`/`maxPct`) |
| `create.amountPresets` | `[0.1, 0.25, 0.5, 1]` | Preset jumlah SOL pada wizard |
| `create.xAmount` / `create.yAmount` | `null` | Jumlah tetap token X/Y |
| `create.autoSwap` | `true` | Swap otomatis saat diperlukan |
| `create.slippageBps` | `100` | Slippage swap (basis poin) |

## `web.*` — Web Dashboard

| Key | Default | Deskripsi |
|---|---|---|
| `web.enabled` | `false` | Aktifkan dashboard (nonaktif secara default) |
| `web.port` | `8080` | Port server |
| `web.password` | — | Password login; bisa di-override `VEXIS_WEB_PASSWORD` |

Dashboard bersifat **read-only**: tidak pernah mengekspos kontrol on-chain atau private key.

## Environment Variables

| Variabel | Fungsi |
|---|---|
| `VEXIS_CONFIG` | Path eksplisit ke config file (prioritas tertinggi) |
| `VEXIS_PRIVATE_KEY` | Override `privateKey` |
| `TELEGRAM_BOT_TOKEN` | Override `telegramBotToken` |
| `TELEGRAM_CHAT_ID` | Override `telegramChatId` |
| `OPENAI_API_KEY` | Fallback `agent.llm.apiKey` |
| `VEXIS_WEB_PASSWORD` | Override `web.password` |

Tidak ada `RPC_URL` — `rpcUrl` hanya dari config file.

## Ringkasan Key Deprecated

| Key | Alasan |
|---|---|
| `agent.minCandidate` | Dulu men-gate kandidat berdasarkan skor heuristic. Sekarang LLM yang memutuskan `open`/`hold` — heuristic hanya mengurutkan kandidat. Tetap diterima di config agar file lama tidak rusak, tapi tidak berpengaruh. |
| `agent.notifLevel` | Dulu membatasi level notifikasi. Sekarang semua notifikasi selalu terkirim. Tetap diterima, tidak berpengaruh. |
