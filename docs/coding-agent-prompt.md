# Prompt untuk AI Coding Agent

File ini berisi prompt siap copy-paste untuk AI coding agent (Claude Code, Codex, Gemini CLI, Copilot, dll.).

**Kamu adalah end user — kamu tidak perlu setup apa-apa.** Cukup:

1. Clone repo ini, buka foldernya di Claude Code / Codex (atau coding agent lain).
2. Copy-paste prompt di bawah ini **satu kali**.
3. Jawab pertanyaan preferensi yang diajukan agent (modal, risiko, TP/SL, dll.) — satu per satu, tinggal tekan Enter untuk pakai default.
4. Agent yang mengerjakan sisanya: install, build, buat config sesuai preferensimu, verifikasi, dan jelaskan cara menjalankan.

Yang perlu kamu siapkan sebelum mulai (secret — **jangan pernah di-paste ke chat**, kamu isi sendiri di file config saat diminta agent):

- Private key wallet Solana (base64 atau base58)
- Bot token dari @BotFather
- Chat ID dari @userinfobot
- API key LLM (kalau tidak pakai default OpenAI)

---

## Prompt Setup Sekali Paste

````markdown
Kamu adalah asisten setup untuk project **Vexis** — bot otomatis manajemen posisi DLMM Meteora di Solana. Saya end user yang tidak paham teknis. Tugasmu: setup SEMUANYA untuk saya.

LANGKAH PERTAMA — Pelajari project:
1. Baca `README.md`
2. Baca `docs/ai-agent.md`
3. Baca `docs/config-reference.md`
4. Baca `docs/troubleshooting.md`
5. Baca `AGENTS.md`

KEMUDIAN — Tanya preferensi saya SATU PER SATU (bahasa Indonesia, bahasa sehari-hari, tanpa jargon). Untuk tiap pertanyaan, beri default aman dan bilang saya bisa tekan Enter untuk memakainya. Yang wajib ditanyakan:
1. Total modal yang mau dipakai (SOL) — default 3 SOL
2. Maksimal SOL per posisi — default 0.5 SOL
3. Maksimal posisi terbuka sekaligus — default 4
4. Take profit (%) — default 25
5. Stop loss (%) — default -10
6. Level risiko: Konservatif / Seimbang / Agresif — default Seimbang (ini menentukan filter risiko: rugpull, wash trading, bundle holders, bot holders, dll.)
7. Model AI: pakai default (`gpt-4o-mini`) atau punya API sendiri? Kalau punya, minta base URL + nama model (jangan minta API key di chat)
8. RPC Solana: pakai default publik, atau punya RPC sendiri?

JANGAN PERNAH minta saya paste private key, bot token, atau API key di chat — itu rahasia.

SETELAH tahu preferensi saya:
1. Jalankan `npm install && npm run build` — kalau gagal, perbaiki sendiri dan coba lagi.
2. Buat `vexis.config.json` dari `vexis.config.example.json` (JANGAN commit — file ini gitignored karena berisi secret).
3. Isi config sesuai preferensi saya: blok `agent` (budget, TP/SL, risks sesuai level risiko, llm), `pools` (pakai default aman dari example), dan lainnya. Semua yang tidak saya tentukan, pakai default aman.
4. Berhenti di sini dan minta saya membuka `vexis.config.json` sendiri untuk mengisi 3-4 nilai rahasia: `privateKey`, `telegramBotToken`, `telegramChatId`, dan `agent.llm.apiKey` (hanya jika saya punya API sendiri). Tunggu konfirmasi saya bahwa sudah diisi — lalu lanjut verifikasi.
5. Verifikasi: `npm run check && npm run typecheck && npm test` — semua harus pass.
6. Jelaskan cara menjalankan dengan bahasa sederhana: `npm run bot`, lalu kirim `/agent start` di Telegram. Jelaskan apa yang akan saya lihat (pesan live `🔎 screening... 🧠 LLM... 🚀/➖/⛔`) dan cara cek status (`/agent status`).

Aturan:
- Bahasa Indonesia, ramah, sesederhana mungkin. Kalau harus pakai istilah teknis, jelaskan singkat.
- Satu pertanyaan per pesan — jangan tanya banyak sekaligus.
- Jangan pernah menampilkan nilai secret saya.
- Kalau saya jawab "terserah"/"default" atau tidak tahu, pakai default aman dan beri tahu keputusannya.
- Kerjakan semuanya sendiri — jangan meminta saya menjalankan perintah teknis di terminal.
````

---

## Prompt Troubleshooting (kalau ada masalah setelah jalan)

Paste ini saat agent sudah jalan tapi bermasalah. Tempel output error / isi journal di bagian yang disediakan.

````markdown
Bot Vexis saya bermasalah. Saya end user, jelaskan dengan bahasa sederhana. Ini informasinya:

[Tempel di sini: output error dari terminal, atau isi `.vexis-agent-journal.jsonl`]

- Baca `docs/troubleshooting.md` dulu, lalu `docs/ai-agent.md` jika perlu.
- Cari tahu penyebabnya, perbaiki sendiri kalau bisa (termasuk config), jangan minta saya menjalankan perintah teknis kecuali benar-benar perlu.
- Jelaskan apa yang salah dan apa yang kamu perbaiki — bahasa sederhana, tanpa jargon berlebihan.
- Kalau masalahnya menyangkut secret (token, key), minta saya mengisinya sendiri — jangan menampilkannya.
- Verifikasi dengan `npm run check && npm run typecheck && npm test`.
````

---

## Catatan

- Prompt bebas dimodifikasi — misalnya tambahkan "lebih agresif" atau "konservatif banget" pada bagian level risiko.
- Secret tidak pernah boleh di-paste ke chat agent — isi langsung di `vexis.config.json` saat agent minta.
- Jika kamu tidak punya repo ini, minta agent meng-clone-nya dulu dari URL yang kamu berikan.
