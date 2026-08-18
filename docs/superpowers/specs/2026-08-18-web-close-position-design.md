# Web UI — Close Position On-chain

**Issue:** #20 — "[Feature] Web UI opt-out on-chain untuk close position"
**Date:** 2026-08-18
**Branch:** `feat/web-close-position`

## Goal

Memungkinkan pengguna menutup (close) posisi DLMM on-chain langsung dari Web UI dashboard, dengan alur konfirmasi yang jelas. Aksi dieksekusi **server-side** menggunakan wallet yang sudah dikonfigurasi — private key **tidak pernah** dikirim ke client.

## Scope

- Tombol **Close** per posisi terbuka di halaman Portfolio.
- Aksi close = **Close & Zap Out** (tarik semua likuiditas + claim fees, lalu swap ke SOL via Jupiter), identik dengan perintah Telegram `/close`. Menggunakan `Zap.closeAndZapOut`.
- Setelah close, catat manual-close cooldown ke state agent agar agent tidak langsung membuka posisi di pool yang sama.
- Revisi AGENTS.md: dashboard boleh expose aksi on-chain yang terautentikasi; tetap read-only untuk data dan tanpa mengekspos key.

## Non-goals

- Tidak menambah opsi "close saja tanpa swap".
- Tidak ada ekspos private key / kontrol on-chain lain (hanya close).
- Tidak refactor `closeAndZapOut`.

## Architecture

Web app (`src/web-react`) adalah React Router SSR yang memuat `AppLayer` (Effect) lewat alias `@vexis/*` → `../`. Karena `AppLayer` berisi `Solana` (signer) + `Zap`, aksi on-chain dapat dieksekusi server-side di dalam route action.

### Alur

1. Pengguna klik tombol **Close** pada sebuah posisi → `Sheet` konfirmasi (shadcn) menampilkan pair, pool address, position address, dan peringatan *irreversible*.
2. Pengguna konfirmasi → `useFetcher` POST ke route `/portfolio` dengan `formData` berisi `op=close`, `pool`, `position`.
3. Route action diproteksi `authMiddleware` (sudah ada). Server memanggil `closePosition(pool, position)`.
4. `closePosition`:
   - `zap.closeAndZapOut(pool, position)` via `AppLayer` → `{ closeSig, zapSig }`.
   - Ambil signature: `zapSig || closeSig`.
   - Panggil `recordManualClose(() => null, pool, pairName, baseMint)` (fallback ke state persist; aman dipanggil tanpa runtime agent).
   - Return `{ ok: true, sig }`.
5. UI menampilkan signature (link solscan) via toast / hasil; kesalahan ditampilkan sebagai error.

### File

**Baru:**
- `src/web-react/app/lib/server/close.server.ts`
  - `closePosition(poolAddress, positionPubkey): Promise<{ ok: boolean; sig?: string; error?: string }>`
  - Membaca config untuk `resolvePoolDetail`-like pair name (reuse pola yang dipakai Telegram; jika gagal, pakai string kosong).
  - Menjalankan `Zap` + `recordManualClose` via `Effect.provide(AppLayer)`, `Effect.catchAll` → `errorMessage`.

**Diubah:**
- `src/web-react/app/routes/portfolio.tsx` — tambah `action` (baca formData, validasi, panggil `closePosition`).
- `src/web-react/app/components/portfolio/positions-table.tsx` — tombol Close + `Sheet` konfirmasi di kedua view (`PositionsDetail` tabel → kolom aksi; `PositionsCardDetail` kartu mobile).
- `AGENTS.md` — revisi aturan "read-only".

## Error handling

- Validasi input: `pool` dan `position` wajib ada, format string non-kosong, sebelum eksekusi.
- Kegagalan `Effect` → `errorMessage(error)` dikembalikan ke UI sebagai error toast.
- Kegagalan `recordManualClose` tidak menggagalkan close (sudah di-handle `try/catch` di `recordManualClose`).

## Security

- Semua aksi berjalan server-side; client hanya mengirim `pool` + `position` + aksi konfirmasi.
- `authMiddleware` melindungi loader & action `/portfolio`.
- Tidak ada private key yang dikirim atau ditampilkan.

## Testing

- Unit test untuk `closePosition` dengan mock boundary `Zap` dan `recordManualClose` (inline fixture; tanpa RPC/Telegram/network live).
- Validasi input (missing pool/position) → return error, tidak memanggil `Zap`.

## Verification

```bash
npm run check
npm run typecheck
npm test
# dalam src/web-react
npm run typecheck
npm run format
```
