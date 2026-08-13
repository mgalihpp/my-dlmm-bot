# Prompt untuk AI Coding Agent

File ini berisi prompt siap copy-paste untuk AI coding agent (Claude Code, Codex, Gemini CLI, Copilot, dll.) agar bisa membantu kamu setup, konfigurasi, dan debugging project Vexis — bot manajemen posisi DLMM Meteora di Solana.

**Cara pakai:** copy prompt ke agent, lalu tempel tambahan (output error / isi journal / deskripsi masalah) jika diminta. Jawaban agent akan berbahasa Indonesia.

> **Keamanan:** JANGAN pernah menempelkan nilai secret ke prompt — private key, bot token, API key LLM, atau password web. Agent akan minta kamu mengisinya sendiri ke config file / env.

---

## 1. Prompt Universal

Prompt utama untuk semua task. Copy-paste ini dulu, lalu tambahkan pertanyaan/masalahmu di bawahnya.

````markdown
Kamu membantu saya dengan project **Vexis** — bot manajemen posisi DLMM Meteora di Solana (TypeScript + Effect + grammY).

SEBELUM bertindak, baca dokumen ini secara berurutan:
1. `README.md` — ringkasan project
2. `docs/ai-agent.md` — panduan AI agent (bahasa Indonesia)
3. `docs/config-reference.md` — referensi konfigurasi (bahasa Indonesia)
4. `docs/troubleshooting.md` — troubleshooting (bahasa Indonesia)
5. `AGENTS.md` — konvensi kode dan arsitektur

Aturan:
- Jangan pernah menampilkan, menulis, atau meng-commit secret: private key, bot token, API key LLM, password web.
- Jangan memodifikasi `vexis.config.json` (gitignored) tanpa izin saya; contoh config ada di `vexis.config.example.json`.
- Perintah verifikasi yang benar: `npm run check && npm run typecheck && npm test`.
- Bot jalan dengan `npm run bot` (dev) / `npm run bot:start` (compiled). Web: `npm run web` / `npm run web:start`.
- Jika ada informasi yang tidak saya berikan (mis. private key, token, RPC), tanyakan dulu — jangan mengarang.
- Jawab dalam bahasa Indonesia.
````

---

## 2. Prompt Setup

Untuk setup AI agent dari awal.

````markdown
Bantu saya setup AI agent Vexis dari awal. Ikuti langkah:
1. Pastikan `node_modules` terinstall dan build sukses (`npm install && npm run build`).
2. Buat `vexis.config.json` dari `vexis.config.example.json` (jangan commit).
3. Pandu saya mengisi: `wallet`, `privateKey`, `rpcUrl`, `telegramBotToken`, `telegramChatId`, dan blok `agent` + `agent.llm` (referensi: `docs/config-reference.md`).
4. Jelaskan cara mulai: `npm run bot`, lalu `/agent start` di Telegram.
5. Verifikasi dengan `npm run check && npm run typecheck && npm test`.
Jangan menampilkan nilai secret di jawaban.
````

---

## 3. Prompt Troubleshooting

Untuk diagnosis masalah. Tempel output error / isi journal di bagian yang disediakan.

````markdown
AI agent Vexis saya bermasalah. Bantu diagnosis berdasarkan info ini:

[Tempel di sini: output error, log konsol, isi `.vexis-agent-journal.jsonl`, atau isi `.vexis-agent.json`]

- Baca `docs/troubleshooting.md` dulu.
- Identifikasi gejala → kemungkinan penyebab → solusi.
- Jika solusi melibatkan perubahan config, tunjukkan nilai yang disarankan + alasannya.
- Jika menyangkut secret, minta saya mengisinya sendiri.
- Jangan langsung menyarankan transaksi on-chain tanpa konfirmasi.
````

---

## 4. Prompt Perubahan Kode / Fitur Baru

Jika kamu minta agent mengubah kode (bukan sekadar setup/debug).

````markdown
Bantu saya mengubah kode Vexis. Task: [jelaskan perubahan/feature yang diminta]

- Baca `AGENTS.md` dulu — ikuti konvensi project (Effect, ESM, TypeScript strict, Biome).
- Ikuti arsitektur existing; jangan buat abstraksi baru jika sudah ada yang menyelesaikan masalah.
- Tambah/update test unit di `test/` (vitest) untuk perubahan logic.
- Verifikasi: `npm run check && npm run typecheck && npm test`.
- Jangan mengubah perilaku publik (CLI, config, perintah Telegram) tanpa menanyakannya dulu.
- Jangan pernah menampilkan atau meng-commit secret.
````

---

## Catatan

- Prompt bebas dimodifikasi — tambahkan detail project atau preferensimu.
- Jika task menyangkut on-chain (transaksi, wallet), agent wajib minta konfirmasi sebelum menyarankan eksekusi.
- Untuk task yang melibatkan banyak perubahan, minta agent membuat rencana dulu sebelum implementasi.
- Secret tidak pernah boleh di-paste ke prompt — isi langsung ke config file / env variable.
