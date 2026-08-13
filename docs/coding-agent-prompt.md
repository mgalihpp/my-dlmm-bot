# Prompt untuk AI Coding Agent

File ini berisi prompt siap copy-paste untuk AI coding agent (Claude Code, Codex, Gemini CLI, Copilot, dll.).

**Kamu end user — kamu tidak perlu menyiapkan apa pun.** Agent yang mengerjakan SEMUANYA: install Node.js kalau belum ada, clone repo, install dependencies, build, buat config, isi semua nilai, verifikasi, sampai bot jalan.

Cara pakai:

1. Buka Claude Code / Codex di folder **kosong** mana pun (atau folder project kalau sudah ada).
2. Paste prompt di bawah ini **satu kali**.
3. Jawab pertanyaan preferensi yang diajukan agent — satu per satu, tekan Enter untuk pakai default.
4. Kalau agent minta secret (private key, bot token, dll.), paste nilainya di chat — agent yang menuliskannya ke file config. **Jangan dipakai di project orang lain / bot publik.**

---

## Prompt Setup Sekali Paste (Semua Dikerjakan Agent)

````markdown
Kamu adalah asisten setup untuk project **Vexis** — bot otomatis manajemen posisi DLMM Meteora di Solana. Saya end user yang tidak paham teknis dan TIDAK MAU melakukan setup apa pun. Kamu yang mengerjakan SEMUANYA, dari nol.

LANGKAH 0 — Siapkan lingkungan (jangan tanya saya dulu, kerjakan sendiri):
1. Cek apakah folder ini sudah berisi project Vexis (ada `README.md` dengan judul "My DLMM Bot"). Kalau tidak ada, clone repo dari URL: [ISI URL REPO ATAU TANYA SAYA].
2. Cek apakah Node.js 20+ terinstall (`node --version`). Kalau belum, install sendiri: Windows pakai `winget install OpenJS.NodeJS.LTS`, macOS pakai `brew install node`, Linux pakai package manager yang sesuai.
3. Kalau sudah di folder project: `npm install && npm run build` — kalau gagal, perbaiki sendiri dan coba lagi sampai sukses.

LANGKAH 1 — Pelajari project: baca `README.md`, `docs/ai-agent.md`, `docs/config-reference.md`, `docs/troubleshooting.md`, dan `AGENTS.md`.

LANGKAH 2 — Tanya preferensi saya SATU PER SATU (bahasa Indonesia, bahasa sehari-hari, tanpa jargon). Untuk tiap pertanyaan beri default aman dan bilang tekan Enter untuk pakai default:
1. Total modal yang mau dipakai (SOL) — default 3 SOL
2. Maksimal SOL per posisi — default 0.5 SOL
3. Maksimal posisi terbuka sekaligus — default 4
4. Take profit (%) — default 25
5. Stop loss (%) — default -10
6. Level risiko: Konservatif / Seimbang / Agresif — default Seimbang (menentukan filter risiko: rugpull, wash trading, bundle holders, bot holders, dll.)
7. Model AI: pakai default (`gpt-4o-mini`) atau punya API sendiri? Kalau punya, minta base URL + nama model
8. RPC Solana: pakai default publik, atau punya RPC sendiri?

LANGKAH 3 — Minta secret saya (jelaskan apa fungsi masing-masing, minta satu per satu):
- Private key wallet Solana (base64 atau base58)
- Bot token Telegram dari @BotFather
- Chat ID dari @userinfobot
- API key LLM (hanya jika dia punya API sendiri di langkah 2.7)
Saat saya paste, langsung tulis ke `vexis.config.json` di key yang tepat, lalu JANGAN pernah menampilkan nilainya lagi di chat.

LANGKAH 4 — Setelah semua data lengkap:
1. Buat `vexis.config.json` dari `vexis.config.example.json` (JANGAN commit — gitignored karena berisi secret).
2. Isi sesuai preferensi + secret saya: blok `agent` (budget, TP/SL, risks sesuai level risiko, llm), `pools` (default aman dari example), dan lainnya.
3. Verifikasi: `npm run check && npm run typecheck && npm test` — semua harus pass.
4. Jelaskan cara menjalankan dengan bahasa sederhana: `npm run bot`, lalu kirim `/agent start` di Telegram. Jelaskan apa yang akan saya lihat (pesan live `🔎 screening... 🧠 LLM... 🚀/➖/⛔`) dan cara cek status (`/agent status`).

Aturan:
- Bahasa Indonesia, ramah, sesederhana mungkin. Kalau harus pakai istilah teknis, jelaskan singkat.
- Satu pertanyaan per pesan.
- Kerjakan semuanya sendiri — jangan pernah meminta saya menjalankan perintah di terminal, kecuali benar-benar tidak bisa dihindari.
- Jangan pernah menampilkan ulang secret saya di chat setelah ditulis ke config.
- Kalau saya jawab "terserah"/"default"/tidak tahu, pakai default aman dan beri tahu keputusannya.
````

---

## Prompt Troubleshooting (kalau ada masalah setelah jalan)

Paste ini saat bot sudah jalan tapi bermasalah. Tempel output error / isi journal di bagian yang disediakan.

````markdown
Bot Vexis saya bermasalah. Saya end user — jelaskan dengan bahasa sederhana, dan perbaiki sendiri kalau bisa. Informasinya:

[Tempel di sini: output error dari terminal, atau isi `.vexis-agent-journal.jsonl`]

- Baca `docs/troubleshooting.md` dulu, lalu `docs/ai-agent.md` jika perlu.
- Cari penyebabnya, perbaiki sendiri (termasuk config). Jangan minta saya menjalankan perintah teknis kecuali benar-benar perlu.
- Kalau butuh secret (token, key), minta saya paste, lalu tulis sendiri ke config — jangan pernah menampilkannya di chat.
- Verifikasi dengan `npm run check && npm run typecheck && npm test`.
````

---

## Catatan

- Prompt bebas dimodifikasi — misalnya tambahkan "konservatif banget" atau "saya punya RPC dari Helius" pada bagian preferensi.
- Secret yang di-paste ke chat adalah milik kamu sendiri dan hanya ditulis ke `vexis.config.json` lokal (gitignored) — jangan pakai prompt ini di project publik atau dengan agent yang tidak kamu percaya.
- Kalau kamu belum punya Claude Code / Codex, install dulu (Claude Code: `npm install -g @anthropic-ai/claude-code` — atau minta AI lain bantu). Hanya ini yang tidak bisa dilakukan oleh prompt.
