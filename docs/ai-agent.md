# AI Agent Vexis — Panduan Coba

AI agent Vexis mengotomasi manajemen posisi DLMM Meteora di Solana: **menemukan** pool kandidat via screening deterministik, **memutuskan** `open`/`hold` per kandidat lewat LLM, lalu **membuka posisi** di belakang guardrail deterministik yang tidak bisa di-bypass. Ditambah monitoring take-profit/stop-loss (TP/SL), penanganan posisi out-of-range (OOR), learning bobot sinyal Darwinian dari PnL, dan briefing harian.

Dokumen ini untuk orang yang mau **mencoba** agent-nya. Detail implementasi ada di `docs/dev/ai-agent.md` (internal).

## Requirements

- Node.js 20+
- Wallet Solana — **gunakan hot wallet khusus dengan dana terbatas**, karena agent melakukan transaksi on-chain nyata
- API key LLM (OpenAI-compatible). Default: base URL `https://api.openai.com/v1`, model `gpt-4o-mini`
- Bot token Telegram + chat ID (untuk notifikasi agent)

## Setup

```bash
npm install
npm run build
cp vexis.config.example.json vexis.config.json
```

Edit `vexis.config.json` — isi minimal:

```json
{
  "wallet": "YourSolanaWalletAddress",
  "privateKey": "base64-or-base58-private-key",
  "rpcUrl": "https://api.mainnet-beta.solana.com",
  "telegramBotToken": "123456:ABC-your-bot-token",
  "telegramChatId": "your-numeric-chat-id",
  "agent": {
    "enabled": false,
    "maxCandidates": 5,
    "maxSolPerPosition": 0.5,
    "maxTotalSol": 3,
    "maxOpenPositions": 4,
    "txCooldownMs": 300000,
    "poolCooldownMs": 86400000,
    "tpPct": 25,
    "slPct": -10,
    "llm": {
      "baseUrl": "https://api.openai.com/v1",
      "model": "gpt-4o-mini",
      "apiKey": "sk-..."
    }
  }
}
```

Jalankan bot:

```bash
npm run bot
```

Mulai agent dari Telegram dengan `/agent start`. Cek status dengan `/agent status`. Daftar lengkap semua key ada di [Referensi Konfigurasi](config-reference.md).

> **Catatan:** `vexis.config.json` di-gitignore karena berisi secret. `rpcUrl` hanya bisa di-set dari config file — tidak ada env var `RPC_URL`.

## Cara Kerja

```
Screening (deterministik) → LLM decide open/hold → validasi anti-halusinasi → guardrail (hard block) → createPosition
```

Heuristic bukan penentu keputusan — hanya memilih pool mana yang dilihat LLM. LLM adalah juri, guardrail adalah polisi.

### Job terjadwal

| Job | Interval | Fungsi |
|---|---|---|
| `cycle` | `max(txCooldownMs, 60s)` | Screening + LLM decide open/hold + eksekusi posisi baru |
| `event` | 30 detik | Cek TP/SL deterministik per posisi |
| `oor` | `intervalMinutes` menit | Cek TP/SL + posisi out-of-range, LLM decide hold/close |
| `briefing` | Tiap hari 09:00 lokal | Narasi LLM: portfolio health, aktivitas 24 jam, market snapshot |

Semua job berjalan sejajar wall-clock (anti-drift) dan langsung jalan sekali saat startup.

### Notifikasi live

Satu pesan Telegram diedit in-place selama satu cycle:

```
🔎 screening pools... → ⏳ N pools in cooldown → 🔁 N already open
→ 🧠 LLM: thinking... → 🧠 LLM: N candidates → M decisions
→ per keputusan: 🚀 open / ➖ hold / ⛔ blocked → summary
```

Status LLM (`llmStatus`):

| Status | Arti |
|---|---|
| `ok` | LLM sukses; ada keputusan |
| `skipped` | Nol kandidat setelah screening — normal, bukan error |
| `failed` | LLM error/timeout/respons tak ter-parse → **seluruh cycle di-skip, nol trade** |

### Guardrail yang bisa memblokir open (`⛔`)

- **Duplikat** — posisi sudah ada di pool/base token yang sama
- **Cooldown** — pool masih dalam cooldown, atau tx-cooldown global antar OPEN
- **Risiko** — rugpull, wash trading, bundle/bot/top-10 holders melebihi cap, global fees terlalu rendah, dex-paid, dev sold all, harga jauh dari ATH
- **Budget** — melebihi `maxSolPerPosition`, `maxTotalSol`, atau `maxOpenPositions`

### Darwinian

Bobot sinyal heuristic (fee/TVL ratio, organic, bin step, holders, volume, dll.) di-recalculate dari PnL posisi yang sudah ditutup — sinyal yang sering menang dinaikkan, yang sering kalah diturunkan.

## Perintah Telegram

| Perintah | Fungsi |
|---|---|
| `/agent start` | Mulai agent |
| `/agent stop` | Hentikan agent |
| `/agent status` | Status dashboard (default: `/agent`) |
| `/agent portfolio` | Portfolio + PnL |
| `/agent journal [n]` | Journal, n baris terakhir (maks 20) |
| `/briefing` | Briefing harian manual (read-only) |

Tombol pada notifikasi: `📊 PnL` (detail posisi), `⚠️ Retry` (re-run TP/SL), `📒 Journal`, `🧼 Clear`. Semua notifikasi agent **selalu terkirim** (termasuk saat LLM gagal).

## Monitoring

- **State** — `.vexis-agent.json`: `enabled`, `running`, `llmStatus`, `plans`, `cooldowns`, `executions`.
- **Journal** — `.vexis-agent-journal.jsonl`: satu baris JSON per cycle/aksi.

  ```json
  {
    "ts": "2026-08-13T09:00:00Z",
    "cycle": 3,
    "llmStatus": "ok",
    "candidates": [
      {
        "pool": "SOL-USDC",
        "poolName": "SOL/USDC",
        "heuristicScore": 87,
        "rationale": "Fees kuat, organik",
        "action": "open",
        "guardrail": "pass",
        "blockedReason": null,
        "execution": "ok",
        "txSignature": "5Kt..."
      }
    ]
  }
  ```

- **Web dashboard** — halaman `/agent` menampilkan narasi LLM + timeline journal, auto-refresh 30 detik.
- File state di-gitignore — jangan dihapus saat agent sedang berjalan.

## Risiko & Batasan

- Agent melakukan **transaksi on-chain nyata** — gunakan hot wallet khusus dengan dana terbatas.
- LLM bisa salah — guardrail adalah lapisan terakhir, tapi heuristic hanya memilih kandidat; keputusan akhir di LLM.
- LLM gagal → cycle di-skip (zero trade) — desain fail-safe.
- OOR: LLM gagal → semua posisi di-hold (`degraded`), **bukan** auto-close.
- Budget caps (`maxSolPerPosition`, `maxTotalSol`, `maxOpenPositions`) adalah hard block yang tidak bisa dilewati LLM.
- Agent hanya berjalan saat server hidup — state persisten di file JSON, bukan di memori.
- Pastikan saldo SOL cukup untuk biaya transaksi; eksekusi `createPosition` gagal jika tidak.

## Lihat Juga

- [Referensi Konfigurasi](config-reference.md) — semua key dan default
- [Troubleshooting](troubleshooting.md) — gejala → penyebab → solusi
- [Prompt untuk AI Coding Agent](coding-agent-prompt.md) — minta Claude Code / Codex bantu setup & debug
- [README](../README.md)
