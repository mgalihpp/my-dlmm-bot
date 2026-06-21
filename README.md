# vexis-dlmm-bot

CLI untuk menampilkan portfolio Meteora DLMM — posisi terbuka (open) maupun yang sudah ditutup (closed) — langsung dari [Meteora Data API](https://docs.meteora.ag/api-reference/dlmm/portfolio). Hanya butuh wallet address, tanpa RPC.

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

```bash
vexis open <wallet>      # posisi terbuka, dikelompokkan per pool
vexis closed <wallet>    # pool yang berisi posisi tertutup (deposit/withdraw/fee/PnL)
vexis summary <wallet>   # total PnL portfolio (USD & SOL)
```

## Config

Buat `vexis.config.json` (lihat `vexis.config.example.json`) supaya tidak perlu mengetik wallet tiap kali:

```json
{
  "wallet": "DYAn4XpAkN5mhiXkRB7dGq4Jadnx6XYgu8L5b3WGhbrt",
  "dev": false,
  "pageSize": 50
}
```

- `wallet` — wallet default saat argumen tidak diberikan.
- `dev`, `pageSize` — default untuk `--dev` dan `--page-size`.

Lokasi config dicari berurutan: `$VEXIS_CONFIG` → `./vexis.config.json` → `~/.vexis/config.json`.

```bash
vexis open            # pakai wallet default dari config
vexis config          # tampilkan config aktif & lokasinya
```

CLI argument & flag selalu menimpa nilai dari config.

### Opsi

| Opsi | Berlaku di | Keterangan |
|------|-----------|------------|
| `--json` | semua | output JSON mentah |
| `--dev` | semua | pakai server API dev (`dlmm.dev.metdev.io`) |
| `-p, --page <n>` | open/closed | nomor halaman (default 1) |
| `-s, --page-size <n>` | open/closed | jumlah per halaman, maks 50 (default 50) |

Set `NO_COLOR=1` untuk menonaktifkan warna.

## Contoh

```bash
vexis open DYAn4XpAkN5mhiXkRB7dGq4Jadnx6XYgu8L5b3WGhbrt
vexis summary <wallet> --json
```

## Endpoint yang dipakai

- `GET /portfolio/open` — posisi terbuka per-pool
- `GET /portfolio` — pool dengan posisi tertutup
- `GET /portfolio/total` — total PnL agregat
