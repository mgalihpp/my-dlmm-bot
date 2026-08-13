# Troubleshooting Vexis

Kumpulan gejala umum → kemungkinan penyebab → solusi untuk bot Vexis dan AI agent-nya. Gunakan dokumen ini saat ada masalah; untuk kasus yang sulit, tempel output error / isi journal ke AI coding agent — lihat [Prompt untuk AI Coding Agent](coding-agent-prompt.md).

Sumber info yang paling berguna saat debug:

- Output error di konsol (server bot/web)
- Isi journal: `.vexis-agent-journal.jsonl`
- Isi state: `.vexis-agent.json`
- File config: `vexis.config.json`

## Setup & Build

| Gejala | Penyebab | Solusi |
|---|---|---|
| `npm install` gagal / error `postinstall` (patch-cjs) | Versi Node < 20, atau `node_modules` korup | Upgrade ke Node.js 20+. Hapus `node_modules` + `package-lock.json` lama, lalu `npm ci` |
| `npm run build` gagal dengan error TypeScript | Kode tidak kompatibel dengan TS di project ini, atau install tidak selesai | Jalankan `npm run typecheck` untuk detail error; pastikan `npm install` sukses |
| `npm start -- <perintah>` → perintah tidak dikenal | Belum build (dist kosong) | Jalankan `npm run build` dulu |
| Bot jalan tapi tidak memakai config yang diharapkan | Config tidak ditemukan di lokasi yang dicari | Cek search order: `$VEXIS_CONFIG` → `./vexis.config.json` → `~/.vexis/config.json`. Set `VEXIS_CONFIG` jika config di tempat lain |

## Config

| Gejala | Penyebab | Solusi |
|---|---|---|
| Error private key invalid | `privateKey` bukan base64/base58 yang valid | Ganti dengan keypair yang benar (encode base64 atau base58). Catatan: private key hanya dibaca sekali di startup |
| RPC timeout / rate limit / error simpang | `rpcUrl` salah, atau RPC publik penuh | Ganti `rpcUrl` ke provider lain. **Tidak ada env var `RPC_URL`** — rpcUrl hanya dari config file |
| Transaksi selalu gagal | Saldo SOL tidak cukup | Fund wallet. Operasi on-chain butuh SOL untuk biaya transaksi |
| Portfolio menampilkan wallet yang salah | `wallet` di config salah, atau perintah CLI menerima argumen wallet | Cek `wallet` di config; perintah CLI bisa di-override dengan argumen `<addr>` |
| Config diedit tapi tidak berpengaruh | Bot belum di-restart | Restart bot setelah mengubah config |

## Telegram

| Gejala | Penyebab | Solusi |
|---|---|---|
| Bot tidak merespon `/start` | `telegramBotToken` salah, atau bot belum di-start | Cek token dari @BotFather, buka chat bot dan tekan Start |
| Notifikasi tidak terkirim | `telegramChatId` salah, atau bot belum di-start di chat itu | Verifikasi chat ID numerik via @userinfobot; pastikan bot sudah di-start di chat tujuan |
| Tombol callback tidak bekerja | Bot di-restart / data callback tidak dipersist | Kirim pesan baru; callback lama tidak valid lagi |
| Bot merespon tapi lambat | Network/RPC lambat | Cek koneksi server dan RPC |

## AI Agent

| Gejala | Penyebab | Solusi |
|---|---|---|
| Cycle selalu di-skip, journal `llmStatus: "failed"` | LLM error: `baseUrl`/`model`/`apiKey` salah, timeout, rate limit | Cek `agent.llm.*` dan env `OPENAI_API_KEY` (fallback). Naikkan `llm.timeoutMs` jika timeout. Pastikan base URL OpenAI-compatible benar (default `https://api.openai.com/v1`) |
| Banyak notifikasi `⛔ blocked` | Guardrail deterministik memblokir: cooldown / duplikat / risiko / budget | Baca `blockedReason` di notifikasi atau journal. Sesuaikan config: `poolCooldownMs`, `risks.*`, `maxSolPerPosition`, `maxTotalSol`, `maxOpenPositions` |
| Agent tidak pernah open padahal `llmStatus: "ok"` | Semua keputusan LLM = `hold`, atau semua open diblokir guardrail | Cek `rationale` dan `blockedReason` di journal untuk alasan per pool |
| `llmStatus: "skipped"` terus-terusan | Nol kandidat setelah screening — normal, bukan error | Longgarkan filter `pools.*` (mis. `minOrganic`, `minTvl`, `minMcap`, `minVolume24h`) agar lebih banyak pool lolos |
| Eksekusi `createPosition` gagal (`execution: "failed"`) | SOL tidak cukup, slippage terlalu ketat, atau RPC error | Cek saldo wallet; naikkan `slippageBps`; cek `rpcUrl` |
| Agent tidak berjalan setelah restart server | `enabled` masih false, atau belum di-start ulang | Jalankan `/agent start` lagi; cek `/agent status`. State (`plans`, `cooldowns`) tetap tersimpan di file JSON |
| Agent tidak muncul notifikasi apa pun | Agent tidak aktif | Cek `enabled` dan `/agent status`. Notifikasi agent selalu terkirim **saat agent aktif** |
| Journal menumpuk besar | Normal — JSONL per cycle/aksi | Aman dihapus? Journal adalah riwayat; menghapus tidak menghentikan agent, tapi stats/history hilang |
| Ingin reset total | State rusak / mau mulai bersih | Hentikan agent (`/agent stop`), hapus `.vexis-agent.json` + `.vexis-agent-journal.jsonl` + `.vexis-agent-signals.json` **hanya jika yakin** — semua riwayat plans/cooldowns/signals hilang |

## Web UI

| Gejala | Penyebab | Solusi |
|---|---|---|
| Halaman blank / minta password terus | Password salah | Cek `web.password` di config dan env `VEXIS_WEB_PASSWORD` (env meng-override config) |
| Port bentrok | `web.port` sudah dipakai proses lain | Ganti `web.port` |
| Data tidak refresh | Browser cache / halaman lama | Hard refresh (Ctrl+Shift+R). Portfolio & agent auto-refresh 30 detik; pool refresh saat timeframe di-submit |
| Dashboard tidak aktif | `web.enabled` masih `false` | Set `web.enabled: true` (nonaktif secara default) |

## Verifikasi Umum

Setelah melakukan perubahan apa pun (terutama jika menyentuh kode):

```bash
npm run check
npm run typecheck
npm test
```

Jika masih buntu setelah semua langkah di atas: kumpulkan output error + isi journal `.vexis-agent-journal.jsonl` + state `.vexis-agent.json`, lalu tempel ke AI coding agent — lihat [Prompt untuk AI Coding Agent](coding-agent-prompt.md).
