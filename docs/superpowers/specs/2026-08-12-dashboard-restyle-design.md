# Dashboard Web Bot — Restyle Mengikuti Design System vexis-dlmm-dashboard

Tanggal: 2026-08-12
Status: Disetujui user

## Tujuan

Merombak seluruh tampilan dashboard web bot (`src/web/*`) agar mengikuti design system
pada `vexis-dlmm-dashboard/` (dark terminal "VEXIS // DLMM CONTROL"): palet `#0b0e14`/
`#10151e`/`#b8ff4d`, grid paper, font mono, struktur shell (sidebar + topbar) baru.
Arsitektur server-rendered HTML + htmx TIDAK berubah. Tidak ada halaman/fitur baru
(hanya 3 halaman + login yang ada).

## Keputusan kunci (hasil brainstorming)

1. **Cakupan**: restyle `src/web/*` saja, tanpa migrasi ke Next.js.
2. **Tema**: dark sebagai default; mode light dipertahankan via toggle (dark default,
   toggle menyimpan `vexis-theme` di localStorage; tanpa atribut → dark, bukan
   preferensi sistem).
3. **Shell**: adopsi penuh struktur referensi (sidebar: brand + workspace + nav +
   RPC CONNECTED + wallet; topbar: eyebrow + judul + LIVE + refresh + avatar).
4. **Halaman**: restyle 3 halaman yang ada (Portfolio, Pool Radar, Agent Log) + login.
5. **Font**: tanpa Google Fonts — Arial untuk teks, SFMono/Consolas untuk angka dan
   eyebrow (dashboard tetap offline-able seperti sekarang).

## 1. Design tokens

### Dark (default) — persis dari `vexis-dlmm-dashboard/app/globals.css`

- `--background: #0b0e14`, `--foreground: #e7ebf2`
- `--panel: #10151e`, `--panel-2: #151b25`
- `--line: #222b39`, `--muted: #7f8999`
- `--profit: #b8ff4d` (lime), `--loss: #ff6f6f`, `--gold: #f0bd57`, `--blue: #63a9ff`
- `--radius: 4px`
- Background body: grid paper `linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)` ukuran 28px
- `color-scheme: dark`

### Light (adaptasi baru)

- `--background: #f4f5f7`, `--foreground: #1a1d23`
- `--panel: #ffffff`, `--panel-2: #eceff3`
- `--line: #d9dde3`, `--muted: #6b7280`
- `--profit: #4a7a00`, `--loss: #c0392b`, `--gold: #a36a00`, `--blue: #2f6fd0`
- Grid paper: `rgba(0,0,0,.02)` dengan ukuran 28px
- `color-scheme: light`

### Tipografi

- Body: Arial, sans-serif; ukuran 12–14px
- Angka/eyebrow/mono: `SFMono-Regular, Consolas, monospace`
- Eyebrow/kicker: 10px monospace, `letter-spacing: .13em`, uppercase, warna muted
- Heading h1: 20px, tanpa dekorasi brutalist (hapus box Archivo Black)

## 2. Shell (layout.ts)

### Sidebar (224px, border-right `--line`)

- Brand: kotak `--profit` 25px berisi "V", teks "VEXIS" + small "DLMM OPS" (mono 9px)
- Workspace badge: kotak `--panel` + border `--line`, dot hijau (glow) + "MAINNET"
- Nav 3 item (Portfolio, Pool Radar, Agent Log) — aktif: background `#1a222e` +
  inset kiri 2px `--profit`; hover sama tanpa inset
- Bawah (margin-top auto): RPC CONNECTED (host RPC dari config, terpotong) +
  wallet (address terpotong `7xK9...4mP2` dari config)
- READ ONLY + Exit (border `--loss`, teks `--loss`) di sidebar bawah
- Theme toggle: di topbar (bukan sidebar)

### Topbar (88px, border-bottom `--line`)

- Kiri: eyebrow `VEXIS / {SECTION}` + h1 judul
- Kanan: `.live` (dot hijau + "LIVE" + timestamp kecil "Updated HH:MM"), tombol
  refresh (ikon ↻), avatar "VX" (kotak `--profit`)
- Mobile (<640px): tombol menu muncul, sidebar off-canvas + scrim

### Konten

- `main` dengan padding kiri menyesuaikan sidebar; lebar responsif
- Tetap gunakan htmx `contentRegion` untuk partial refresh 30s

### Tema

- JS toggle: default dark; simpan `vexis-theme` di localStorage; `data-theme="light"`
  saat terpilih
- Light mode: seluruh komponen memakai variabel CSS (semua warna via var, tidak ada
  hardcode hex di luar :root)

## 3. Komponen & halaman

### templates.ts

- `summaryCard` → `stats-grid` (4 kolom, gap 1px, background `--line`) + `.stat`
  (label eyebrow 10px, nilai 22px monospace, `stat-sub` 10px mono muted)
- `table` → `.table-scroll` + table (th: 9px mono uppercase muted, border-bottom
  `--line`; td 11px, border-bottom `rgba(34,43,57,.7)`; `tr:last-child` tanpa border)
- `badge(text, kind)` — kind remap: `ok`→`pass` (profit), `warn`→`review`/`gold`,
  `danger`→`blocked`/`sl` (loss), `neutral`→muted border; tambah `open`/`tp` (profit),
  `hold` (blue). Badge: 9px mono uppercase, border + tinted background per kind
- `pnlClass` → kelas `profit` / `loss` (nilai), sub tetap muted
- `sparkline` → stroke `currentColor`, diwarnai pemanggil (profit/loss)
- `errorBanner` → border `--loss`, background tinted loss
- `empty` → panel muted centered (ikon + b + span)

### Halaman Portfolio (pages/portfolio.ts)

- Header: `section-head` (kicker "ACCOUNT EQUITY" berwarna profit + muted deskripsi)
- Stats: 4 stat — Total Equity (profit), Unrealized PnL (profit/loss), Net Worth
  (SOL), Active Positions (jumlah + pools watched)
- Grid-two (1.55fr / 0.85fr):
  - Panel Equity Curve: `panel-head` (eyebrow + nilai + persen) + SVG line chart
    (stroke `--profit`, area gradient lime transparan, label mono muted) + `chart-labels`
  - Panel Allocation: ring conic-gradient (profit/gold/muted) dari snapshot terakhir
    + legend (7px kotak warna + label + nilai)
- Tabel Open Positions: kolom Pool/Bin/Balance/Fees/PnL/PnL SOL/Range — badge
  IN RANGE (pass) / OOR (blocked), link pool warna `--blue`, address sub mono
- Tabel Closed Positions: Pool/Deposit/Withdraw/Fees/PnL USD/PnL SOL/Closed
- PnL history chart: `lineChart` dengan warna baru (bagian 4)

### Halaman Pool Radar (pages/pools.ts)

- `section-head`: kicker `MARKET SCANNER / {N} POOLS` + muted + tombol Filters
  (outline + `filter-count` badge)
- `panel` + `toolbar`: search (ikon + input, max-width 340px), sort select
  (`--panel-2`), timestamp "Screened HH:MM" kanan
- `radar-table` (min-width 1000px): kolom POOL/PRICE/VOLUME/TVL/FEES/SPREAD/APR/
  CHANGE/RUGCHECK/★ — APR & CHANGE `profit`/`loss` mono, RUGCHECK badge
  pass/review/blocked + ikon, tombol star (hover gold)

### Halaman Agent Log (pages/agent.ts)

- `agent-banner`: border lime tinted + gradient, pulse (aktif: glow profit; berhenti:
  border loss), judul "Agent is running/stopped", subtitle "Last cycle … next cycle
  in …", tombol Start/Stop (mengikuti state journal terbaru)
- Stats-grid agent: Cycles, Opens (42.7% dari keputusan), Blocked (gold), Success
  rate (profit)
- Grid-two:
  - Panel Latest Briefing: eyebrow + "Decision context" + ikon, paragraf briefing,
    `briefing-tags` (badge LOW RISK pass, FAVORABLE gold, "Generated by Vexis LLM")
  - Panel Decisions/Cycle: bar chart (bar `#354052`, hot bar `--profit`) + chart-labels
- Tabel journal: badge action (OPEN/TP → profit, BLOCKED/SL → loss, HOLD → blue,
  REVIEW → gold), tx link warna `--blue`

### Halaman Login (layout.ts `loginPage`)

- Gaya referensi: kartu grid 2 kolom (kiri: eyebrow "VEXIS / SOLANA LIQUIDITY OPS",
  headline "READ ONLY.", paragraf; kanan: "Observer access" + form password)
- Panel kiri: background `--profit` dengan teks gelap (dark) / tinted lime (light)
- Input: background `--background`, border `--line`, focus border `--blue` + ring
- Tombol submit: background `--ink` (dark) / `--profit` (light), uppercase mono
- Theme toggle tetap (posisi fixed kanan atas)

## 4. Charts (charts.ts)

- Line chart: stroke utama `var(--profit)`, area gradient `--profit` (opacity .24 →
  0), gridline `var(--line)` atau rgba, label `var(--muted)` mono 9–10px
- Garis kedua (jika ada multi-series): `var(--blue)`
- Sparkline: stroke `var(--profit)` (naik) / `var(--loss)` (turun)
- Semua warna lewat CSS variable agar light mode ikut menyesuaikan

## 5. Verifikasi

- Tidak ada perubahan logika server/htmx/Effect — murni template string + CSS
- `npm run check && npm run typecheck && npm test` harus tetap hijau
- Test unit yang ada (format, dll.) tidak terpengaruh; tidak ada test untuk HTML
  shell, jadi verifikasi manual via `npm run dev` (CLI web) atau `npm run bot`

## Non-goals

- Tidak menambah halaman Alerts & Risk / Settings
- Tidak migrasi ke Next.js/React
- Tidak mengubah API/domain/logika bisnis
- Tidak menambahkan font eksternal
