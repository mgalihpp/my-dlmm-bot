# Desain: Dokumentasi End-User + AI Coding Agent

Tanggal: 2026-08-13
Status: Disetujui

## Tujuan

Project tidak punya dokumentasi untuk orang yang baru mau **mencoba** AI agent DLMM (setup, konfigurasi, monitoring, troubleshooting). `docs/ai-agent.md` yang ada berisi detail implementasi internal (untuk maintainer), bukan panduan end-user. Selain itu, dokumentasi perlu dibuat **AI-agent friendly**: terstruktur, faktual, dan presisi supaya coding agent (Claude Code, Codex, dll.) bisa langsung membantu user setup/debug tanpa konteks yang hanya bisa dilihat manusia.

Konteks yang sudah ada:
- `README.md` — bahasa Inggris, sudah lengkap untuk bot/CLI/web, tapi belum ada "documentation hub".
- `AGENTS.md` — konteks coding agent untuk maintenance (sudah ada, tak disentuh).
- `docs/ai-agent.md` — implementasi internal (bahasa Indonesia), akan **dipindah** ke `docs/dev/` tanpa mengubah isi.
- `docs/api-responses.md`, `docs/superpowers/` — internal/dev, tidak disentuh.

## Keputusan Kunci

- **Bahasa:** README tetap bahasa Inggris; semua docs baru berbahasa Indonesia (per request user).
- **Struktur:** 3 halaman docs terpisah (panduan agent, referensi config, troubleshooting) + 1 file prompt untuk coding agent, semuanya di-link dari README.
- **Dokumen internal dipisah:** `docs/ai-agent.md` (lama) pindah ke `docs/dev/ai-agent.md` tanpa perubahan isi. Docs baru `docs/ai-agent.md` untuk end-user.
- **AI-agent friendly:** tiap halaman ditulis dengan informasi presisi — path file persis, perintah copy-paste, tabel default value dari schema `src/domain/config.ts`, mapping gejala → penyebab → solusi. Tidak ada referensi yang hanya bisa dilihat manusia (mis. screenshot).
- **Prompt untuk coding agent** di file terpisah `docs/coding-agent-prompt.md`: user tinggal copy-paste ke Claude Code/Codex + tempel output error. Prompt mengarahkan agent membaca README + docs + AGENTS.md, verifikasi dengan `npm run check && npm run typecheck && npm test`, dan tidak pernah mengekspos secret.
- **Tidak ada perubahan kode.** Murni dokumentasi. Git: pindah file lama (git mv), tambah file baru.

## Perubahan File

### 1. `docs/ai-agent.md` — BARU (panduan end-user, bahasa Indonesia)

Struktur:

1. **Ringkasan** — apa yang dilakukan agent (screening deterministik → LLM decide open/hold → guardrail hard block → eksekusi; TP/SL; OOR; Darwinian; briefing harian).
2. **Requirements** — Node.js 20+, wallet Solana dengan SOL untuk on-chain ops, RPC, API key LLM (OpenAI-compatible), Telegram bot token + chat ID (untuk notifikasi).
3. **Setup langkah demi langkah** — `npm install`, `npm run build`, `cp vexis.config.example.json vexis.config.json`, isi `agent.*`, `llm.*`, env vars. Copy-paste config minimum yang berfungsi.
4. **Cara kerja dari perspektif user** — 3 job terjadwal (cycle, event TP/SL 30s, OOR, briefing harian 09:00), apa arti notifikasi live `🔎 screening... 🧠 LLM thinking... 🚀/➖/⛔`, `llmStatus` (ok/skipped/failed).
5. **Perintah Telegram** — `/agent start|stop|status|portfolio|journal [n]|briefing` + arti tiap output.
6. **Monitoring** — file state `.vexis-agent.json`, journal `.vexis-agent-journal.jsonl` (format baris JSON singkat), halaman web `/agent` (narasi + timeline).
7. **Risiko & batasan** — hot wallet dedicated dengan dana terbatas, cap budget (`maxSolPerPosition`, `maxTotalSol`, `maxOpenPositions`), guardrail tak bisa di-bypass LLM, LLM gagal → cycle di-skip (nol trade).
8. **Link** ke config-reference, troubleshooting, coding-agent-prompt, dan README.

### 2. `docs/config-reference.md` — BARU (referensi config, bahasa Indonesia)

Struktur:

1. **Cara config dimuat** — search order `$VEXIS_CONFIG` → `./vexis.config.json` → `~/.vexis/config.json`; env overrides; catatan `rpcUrl` config-file-only (TIDAK ada `RPC_URL`).
2. **Top-level keys** — `wallet`, `privateKey` (base64/base58, hanya dibaca di startup), `rpcUrl`, `telegramBotToken`, `telegramChatId`, `alertInterval`, `stopLossPct`, `takeProfitPct`, `pageSize`, `dev`.
3. **`agent.*`** — tabel lengkap dari `src/domain/config.ts`: `enabled`, `intervalMinutes`, `maxCandidates`, `minCandidate` (deprecated — sudah tidak men-gate), `maxSolPerPosition`, `maxTotalSol`, `maxOpenPositions`, `txCooldownMs`, `poolCooldownMs`, `tpPct`, `slPct`, `notifLevel` (deprecated — notifikasi selalu terkirim), `llm.*` (baseUrl/model/apiKey/timeoutMs), `risks.*` (enabled, minTokenFeesSol, maxBundlePct, maxBotHoldersPct, maxTop10Pct, maxPriceVsAthPct, blockWash, blockRugpull, blockDexScreenerPaid, blockDevSoldAll — dengan default dari guardrails), `darwin.*` (enabled, windowDays, recalcEvery, boostFactor, decayFactor, weightFloor, weightCeiling, minSamples).
4. **`pools.*`** — tabel 30+ filter dengan default dari `vexis.config.example.json` + catatan `null` = skip filter.
5. **`create.*`** — strategy (spot/curve/bidask), mode (two-sided/single-x/single-y), range, amountPresets, autoSwap, slippageBps.
6. **`web.*`** — enabled/port/password + `VEXIS_WEB_PASSWORD`.
7. **Environment variables** — `VEXIS_CONFIG`, `VEXIS_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `OPENAI_API_KEY`, `VEXIS_WEB_PASSWORD`.
8. **Deprecated keys** — `agent.minCandidate`, `agent.notifLevel`: alasan + status.

### 3. `docs/troubleshooting.md` — BARU (troubleshooting, bahasa Indonesia)

Format tabel **Gejala | Penyebab | Solusi** per area:

1. **Setup & build** — Node < 20, `npm install` gagal, `postinstall patch-cjs` gagal, `npm run build` error TS, `npm start` tidak ditemukan (belum build).
2. **Config** — config file tidak ditemukan (search order), `privateKey` invalid (base64/base58), RPC down/timeout (rpcUrl salah, rate limit), wallet salah.
3. **Telegram** — bot tidak merespon (token invalid / bot belum di-start / chat ID salah), notifikasi tidak terkirim (fire-and-forget — cek `TELEGRAM_CHAT_ID`), `/start` tidak jalan.
4. **AI agent** — siklus di-skip (`llmStatus: "failed"` → cek baseUrl/model/apiKey/timeout), `⛔` blocked (baca `blockedReason`: cooldown/risiko/budget), tidak pernah open (cek `enabled`, `maxOpenPositions`, budget), tx gagal (insufficient SOL, slippage, RPC), agent tidak jalan setelah restart (state file), `llmStatus: "skipped"` itu normal (nol kandidat).
5. **Web UI** — halaman blank/auth error (password salah), port bentrok, data tidak refresh.
6. **Verifikasi umum** — `npm run check && npm run typecheck && npm test` + di mana mencari log (journal, state, konsol).

### 4. `docs/coding-agent-prompt.md` — BARU (prompt copy-paste untuk coding agent)

Isi:

1. Intro singkat: apa itu file ini, untuk siapa.
2. **Prompt universal** (copy-paste utama): identitas project (Vexis — Meteora DLMM bot, TypeScript + Effect + grammY), perintah membaca README.md + docs yang relevan + AGENTS.md sebelum bertindak, konvensi (ESM, `.js` extension, strict TS, Biome), aturan keselamatan (jangan expose secret, jangan commit config), verifikasi dengan `npm run check && npm run typecheck && npm test`.
3. **Prompt setup**: langkah yang dijalankan agent (install, build, buat config dari example, set agent.*, env, verifikasi bot jalan).
4. **Prompt troubleshooting**: tempel error log/output + deskripsi gejala; agent diminta membaca docs/troubleshooting.md dan melaporkan diagnosis + fix.
5. Catatan: prompt mengarahkan agent untuk bertanya dulu bila butuh info yang tidak ada (private key, token, RPC).

### 5. `README.md` — UPDATE (tetap bahasa Inggris)

- Tambah section **Documentation** di dekat atas (setelah intro): tabel link `docs/ai-agent.md` (AI agent guide), `docs/config-reference.md`, `docs/troubleshooting.md`, `docs/coding-agent-prompt.md` (untuk Claude Code/Codex).
- Update section **AI Agent**: ganti link `docs/ai-agent.md` tetap (sekarang menuju panduan end-user), tambah link ke troubleshooting + config reference + coding agent prompt.
- Tidak ada perubahan isi lain.

### 6. `docs/dev/ai-agent.md` — PINDAH

- `git mv docs/ai-agent.md docs/dev/ai-agent.md` — isi tidak berubah (internal implementation notes).
- Update referensi apa pun yang menunjuk path lama (periksa dengan grep sebelum commit).

## Verification

- `npm run check` dan `npm run typecheck` — memastikan tidak ada kode tersentuh.
- Grep seluruh repo untuk `docs/ai-agent.md` agar tidak ada link patah.
- Cek semua link antar docs (relative path benar: `docs/` dari README, `../` dari dalam docs).

## Non-Goals

- Tidak mengubah `docs/api-responses.md`, `docs/superpowers/`, `AGENTS.md`, `CLAUDE.md`.
- Tidak mengubah kode, config schema, CLI, atau perilaku Telegram.
- Tidak menerjemahkan README ke bahasa Indonesia.
