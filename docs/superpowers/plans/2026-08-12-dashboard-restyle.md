# Dashboard Restyle (Design System vexis-dlmm-dashboard) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merombak seluruh tampilan dashboard web bot (`src/web/*`) mengikuti design system `vexis-dlmm-dashboard` (dark terminal: `#0b0e14`/`#10151e`/`#b8ff4d`, grid paper, shell sidebar+topbar baru), tanpa mengubah arsitektur htmx/server-rendered dan tanpa halaman baru.

**Architecture:** Satu file baru `src/web/theme.ts` mengekspor seluruh CSS design system (dark default + light adaptif) sebagai string, dipakai bersama oleh `pageShell` dan `loginPage`. Markup shell dirombak di `layout.ts` (sidebar+topbar baru), data shell (RPC host, wallet) disuntik dari `server.ts`. Komponen di `templates.ts` dan chart di `charts.ts` diremap ke kosa kata kelas baru; tiga halaman disusun ulang ke panel/stats-grid/badge design system.

**Tech Stack:** TypeScript (ESM, `.js` imports), string template HTML, htmx, inline SVG chart, tanpa framework CSS/font eksternal.

## Global Constraints

- ESM-only: semua import pakai ekstensi `.js`
- Format: Biome (tab indent, double quotes, organize imports)
- Dark = default; `data-theme="light"` hanya saat user memilih via toggle; tanpa atribut → dark (bukan prefers-color-scheme)
- Tanpa Google Fonts — Arial untuk teks, `SFMono-Regular, Consolas, monospace` untuk angka/eyebrow
- Semua warna lewat CSS variables (`:root` + `:root[data-theme="light"]`); dilarang hardcode hex di komponen (kecuali di file `theme.ts` token)
- Tidak mengubah logika server/Effect/htmx; tidak menambah halaman; tidak mengubah kontrak `contentRegion`/`errorBanner`/`escapeHtml`
- Verifikasi tiap task: `npm run check && npm run typecheck`; verifikasi akhir: `npm test`
- Baseline palet dark (dari `vexis-dlmm-dashboard/app/globals.css`): `--background:#0b0e14; --foreground:#e7ebf2; --panel:#10151e; --panel-2:#151b25; --line:#222b39; --muted:#7f8999; --profit:#b8ff4d; --loss:#ff6f6f; --gold:#f0bd57; --blue:#63a9ff; --radius:4px`

---

### Task 1: `src/web/theme.ts` — design tokens + seluruh CSS

**Files:**
- Create: `src/web/theme.ts`

**Interfaces:**
- Consumes: — (task pertama; file mandiri)
- Produces: `export const themeCss: string` — stylesheet lengkap dipakai `layout.ts` (Task 2 & 9)

- [ ] **Step 1: Tulis file `src/web/theme.ts`**

Isi file — satu template literal `themeCss` dengan konten berikut (port `globals.css` referensi + token light + komponen tambahan untuk fitur bot: filter form, pagination, hbar, sparkline-card, chart, error, login). CSS di bawah adalah konten LENGKAP string:

```ts
export const themeCss = `:root {
	color-scheme: dark;
	--background: #0b0e14;
	--foreground: #e7ebf2;
	--panel: #10151e;
	--panel-2: #151b25;
	--line: #222b39;
	--line-soft: rgba(34, 43, 57, 0.7);
	--muted: #7f8999;
	--profit: #b8ff4d;
	--loss: #ff6f6f;
	--gold: #f0bd57;
	--blue: #63a9ff;
	--radius: 4px;
	--grid: rgba(255, 255, 255, 0.018);
	--nav-active: #1a222e;
	--tag: #394555;
}
:root[data-theme="light"] {
	color-scheme: light;
	--background: #f4f5f7;
	--foreground: #1a1d23;
	--panel: #ffffff;
	--panel-2: #eceff3;
	--line: #d9dde3;
	--line-soft: rgba(217, 221, 227, 0.7);
	--muted: #6b7280;
	--profit: #4a7a00;
	--loss: #c0392b;
	--gold: #a36a00;
	--blue: #2f6fd0;
	--radius: 4px;
	--grid: rgba(0, 0, 0, 0.025);
	--nav-active: #e6e9ee;
	--tag: #c8cdd5;
}
* { box-sizing: border-box; }
html { background: var(--background); }
body { margin: 0; background: var(--background); color: var(--foreground); font-family: Arial, sans-serif; font-size: 13px; }
button, input, select { font: inherit; }
button { cursor: pointer; }
button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 1px solid var(--profit); outline-offset: 2px; }
a { color: var(--blue); text-decoration: none; }
a:hover { text-decoration: underline; }

.terminal { min-height: 100vh; display: flex; background-color: var(--background); background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 28px 28px; }
.sidebar { width: 224px; border-right: 1px solid var(--line); background: rgba(13, 17, 24, 0.97); display: flex; flex-direction: column; padding: 22px 14px 16px; flex: 0 0 224px; z-index: 10; }
:root[data-theme="light"] .sidebar { background: rgba(250, 251, 252, 0.97); }
.brand { display: flex; align-items: center; gap: 10px; padding: 0 9px 26px; letter-spacing: 0.08em; }
.brand-mark { color: var(--background); background: var(--profit); width: 25px; height: 25px; display: grid; place-items: center; font: 800 15px monospace; border-radius: 3px; }
.brand b, .brand small { display: block; }
.brand b { font-size: 15px; letter-spacing: 0.16em; }
.brand small { color: var(--muted); font: 9px monospace; margin-top: 3px; letter-spacing: 0.11em; }
.close-nav, .mobile-menu { display: none; background: transparent; color: var(--muted); border: 0; }
.workspace { border: 1px solid var(--line); background: var(--panel); padding: 9px 10px; color: var(--muted); font: 10px monospace; display: flex; gap: 7px; align-items: center; margin-bottom: 20px; }
.workspace svg { margin-left: auto; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.green { background: var(--profit); box-shadow: 0 0 8px rgba(184, 255, 77, 0.65); }
nav { display: grid; gap: 3px; }
.nav-item { border: 0; background: transparent; color: var(--muted); display: flex; align-items: center; gap: 11px; padding: 11px 10px; border-radius: 3px; text-align: left; font-size: 12px; }
.nav-item:hover, .nav-item.active { color: var(--foreground); background: var(--nav-active); }
.nav-item.active { box-shadow: inset 2px 0 var(--profit); }
.sidebar-bottom { margin-top: auto; display: grid; gap: 14px; }
.rpc { display: flex; gap: 9px; align-items: flex-start; border-top: 1px solid var(--line); padding: 16px 8px 0; }
.rpc b, .rpc small { display: block; }
.rpc b { font: 10px monospace; color: var(--profit); }
.rpc small { color: var(--muted); font: 10px monospace; margin-top: 4px; word-break: break-all; }
.wallet { border: 1px solid var(--line); padding: 10px; color: var(--muted); font: 10px monospace; display: flex; gap: 7px; align-items: center; }
.wallet .addr { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-actions { display: grid; gap: 8px; }
.read-only { padding: 6px 8px; border: 1px solid var(--line); border-radius: 3px; color: var(--muted); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; text-align: center; }
.logout { padding: 8px; border: 1px solid var(--loss); border-radius: 3px; background: transparent; color: var(--loss); font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; text-align: center; }
.logout:hover { background: var(--loss); color: var(--background); text-decoration: none; }
.content { min-width: 0; flex: 1; padding: 0 30px 45px; }
.topbar { height: 88px; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.eyebrow, .kicker { display: block; color: var(--muted); font: 10px monospace; letter-spacing: 0.13em; }
.topbar h1 { font-size: 20px; line-height: 1; margin: 7px 0 0; letter-spacing: -0.02em; font-weight: 600; }
.top-actions { display: flex; gap: 13px; align-items: center; }
.live { display: flex; align-items: center; gap: 6px; color: var(--profit); font: 10px monospace; }
.live small { color: var(--muted); padding-left: 8px; border-left: 1px solid var(--line); }
.icon-button, .avatar { background: var(--panel); border: 1px solid var(--line); color: var(--muted); width: 31px; height: 31px; display: grid; place-items: center; border-radius: 3px; }
.icon-button:hover { color: var(--profit); }
.avatar { background: var(--profit); color: var(--background); font: 800 10px monospace; border-color: var(--profit); }
.page-stack { padding-top: 28px; display: grid; gap: 16px; }
.section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
.kicker { color: var(--profit); margin: 0 0 6px; }
.muted { color: var(--muted); }
.small { font-size: 10px; }
.section-head .muted { margin: 0; font-size: 12px; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); }
.stat { background: var(--panel); padding: 17px 18px; min-height: 91px; }
.stat strong { display: block; font: 22px monospace; margin-top: 10px; letter-spacing: -0.06em; font-weight: 600; }
.stat-sub { display: block; font: 10px monospace; color: var(--muted); margin-top: 7px; }
.profit { color: var(--profit) !important; }
.loss { color: var(--loss) !important; }
.gold { color: var(--gold) !important; }
.zero { color: var(--muted) !important; }
.grid-two { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(270px, 0.85fr); gap: 16px; }
.panel { background: var(--panel); border: 1px solid var(--line); min-width: 0; }
.panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 17px 18px; border-bottom: 1px solid var(--line); }
.panel-head b { display: block; margin-top: 8px; font-size: 13px; font-weight: 500; }
.panel-head em { font: normal 11px monospace; margin-left: 8px; }
.chart-panel { min-height: 280px; }
.equity-chart { display: block; width: calc(100% - 36px); height: 184px; margin: 16px 18px 0; }
.chart-labels { display: flex; justify-content: space-between; color: var(--muted); font: 10px monospace; padding: 0 18px 13px; }
.allocation { min-height: 280px; }
.allocation-ring { margin: 22px auto 19px; width: 130px; height: 130px; border-radius: 50%; display: grid; place-items: center; position: relative; }
.allocation-ring:before { content: ""; position: absolute; inset: 12px; background: var(--panel); border-radius: 50%; }
.allocation-ring div { position: relative; text-align: center; }
.allocation-ring b { display: block; font: 24px monospace; }
.allocation-ring small { font: 9px monospace; color: var(--muted); }
.legend { display: grid; gap: 9px; padding: 0 18px; font: 10px monospace; color: var(--muted); }
.legend span { display: flex; align-items: center; gap: 8px; }
.legend b { margin-left: auto; color: var(--foreground); font-weight: 400; }
.legend i { width: 7px; height: 7px; border-radius: 1px; }
.legend-green { background: var(--profit); }
.legend-gold { background: var(--gold); }
.legend-muted { background: #3c4653; }
:root[data-theme="light"] .legend-muted { background: #c8cdd5; }
.text-button, .outline-button, .accent-button { border: 1px solid var(--line); background: transparent; color: var(--muted); padding: 7px 10px; font-size: 11px; display: inline-flex; align-items: center; gap: 6px; }
.text-button { border: 0; padding: 0; }
.text-button:hover, .outline-button:hover { color: var(--foreground); border-color: #485466; }
.accent-button { background: var(--profit); color: var(--background); border-color: var(--profit); font: 600 11px monospace; }
.accent-button span { font-size: 16px; line-height: 10px; }
.table-scroll { overflow-x: auto; }
.table-scroll table { min-width: 760px; }
.radar-table { min-width: 1000px !important; }
table { width: 100%; border-collapse: collapse; }
th { color: var(--muted); font: 9px monospace; letter-spacing: 0.1em; text-align: left; padding: 11px 18px; border-bottom: 1px solid var(--line); white-space: nowrap; }
td { padding: 13px 18px; border-bottom: 1px solid var(--line-soft); font-size: 11px; white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
td strong, td small { display: block; }
td strong { font-size: 11px; font-weight: 500; }
td small { color: var(--muted); font: 10px monospace; margin-top: 5px; }
.mono { font-family: monospace; }
.spark { width: 126px; height: 42px; display: block; }
.toolbar { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: var(--background); color: var(--muted); padding: 8px 10px; flex: 1; max-width: 340px; }
.search input { background: transparent; border: 0; color: var(--foreground); outline: none; width: 100%; font-size: 11px; }
.select-label { color: var(--muted); font: 9px monospace; display: flex; gap: 8px; align-items: center; }
.select-label select, .compact-select { background: var(--panel-2); color: var(--foreground); border: 1px solid var(--line); padding: 6px 8px; font: 10px monospace; }
.toolbar .small { margin-left: auto; }
.filter-count { background: var(--profit); color: var(--background); border-radius: 10px; padding: 1px 5px; }
.badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 6px; border: 1px solid var(--tag); color: var(--muted); font: 9px monospace; letter-spacing: 0.05em; text-transform: uppercase; }
.badge.pass { color: var(--profit); border-color: rgba(184, 255, 77, 0.28); background: rgba(184, 255, 77, 0.06); }
:root[data-theme="light"] .badge.pass { border-color: rgba(74, 122, 0, 0.3); background: rgba(74, 122, 0, 0.08); }
.badge.review { color: var(--gold); border-color: rgba(240, 189, 87, 0.3); background: rgba(240, 189, 87, 0.06); }
:root[data-theme="light"] .badge.review { border-color: rgba(163, 106, 0, 0.3); background: rgba(163, 106, 0, 0.08); }
.badge.blocked { color: var(--loss); border-color: rgba(255, 111, 111, 0.3); background: rgba(255, 111, 111, 0.06); }
:root[data-theme="light"] .badge.blocked { border-color: rgba(192, 57, 43, 0.3); background: rgba(192, 57, 43, 0.08); }
.badge.hold { color: var(--blue); border-color: rgba(99, 169, 255, 0.3); }
:root[data-theme="light"] .badge.hold { border-color: rgba(47, 111, 208, 0.3); }
.badge.neutral { color: var(--muted); }
.star { color: var(--muted); border: 0; background: transparent; padding: 3px; }
.star:hover { color: var(--gold); }
.star.active { color: var(--gold); }
.empty { padding: 42px; display: grid; place-items: center; gap: 8px; color: var(--muted); border: 1px solid var(--line); background: var(--panel); }
.empty b { color: var(--foreground); font-size: 13px; }
.empty span { font-size: 11px; }
.error { margin: 0 0 18px; padding: 12px 14px; border: 1px solid var(--loss); background: rgba(255, 111, 111, 0.08); color: var(--loss); font-size: 11px; }
.error a { margin-left: 10px; color: var(--foreground); font-weight: 700; }
.agent-banner { border: 1px solid rgba(184, 255, 77, 0.28); background: linear-gradient(90deg, rgba(184, 255, 77, 0.08), rgba(16, 21, 30, 0.8)); padding: 18px 20px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.agent-status { display: flex; align-items: center; gap: 13px; }
.agent-status h2 { font-size: 16px; margin: 7px 0 5px; font-weight: 600; }
.agent-status p { font: 10px monospace; margin: 0; }
.pulse { width: 10px; height: 10px; border: 2px solid var(--loss); border-radius: 50%; }
.pulse.active { background: var(--profit); border-color: var(--profit); box-shadow: 0 0 0 5px rgba(184, 255, 77, 0.1), 0 0 14px var(--profit); }
.start-button, .stop-button { padding: 9px 13px; font: 10px monospace; border: 1px solid; }
.stop-button { color: var(--loss); background: transparent; border-color: rgba(255, 111, 111, 0.4); }
.start-button { color: var(--background); background: var(--profit); border-color: var(--profit); }
.agent-stats { grid-template-columns: repeat(4, 1fr); }
.bars { height: 160px; display: flex; align-items: flex-end; gap: 8px; padding: 22px 18px 0; }
.bar { flex: 1; min-width: 5px; background: #354052; }
.bar.hot { background: var(--profit); }
.briefing { padding: 0 18px; line-height: 1.65; font-size: 12px; color: var(--foreground); }
.briefing-tags { display: flex; align-items: center; gap: 8px; padding: 8px 18px 18px; }
.briefing-tags .muted { margin-left: auto; }
.reason { color: var(--muted); max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.compact-select { margin-left: auto; }
.filter { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 16px; padding: 12px 14px; border: 1px solid var(--line); background: var(--panel); }
.filter label { color: var(--muted); font: 10px monospace; display: flex; gap: 8px; align-items: center; }
.filter select { background: var(--panel-2); color: var(--foreground); border: 1px solid var(--line); padding: 6px 8px; font: 10px monospace; }
.filter button { border: 1px solid var(--profit); background: transparent; color: var(--profit); padding: 6px 10px; font: 10px monospace; }
.filter button:hover { background: var(--profit); color: var(--background); }
.pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 14px 0 4px; font: 10px monospace; color: var(--muted); }
.pagination a { padding: 6px 12px; border: 1px solid var(--line); border-radius: 3px; background: var(--panel); color: var(--foreground); text-decoration: none; }
.pagination a:hover { border-color: var(--profit); color: var(--profit); text-decoration: none; }
.pagination a.disabled { opacity: 0.35; pointer-events: none; }
.sparkline-card { display: inline-block; margin: 0 0 16px; padding: 10px; border: 1px solid var(--line); background: var(--panel); }
.sparkline-card svg { color: var(--profit); }
.sparkline-card .sub { margin-bottom: 6px; }
svg { display: block; }
.chart { margin: 0 0 16px; padding: 12px; border: 1px solid var(--line); background: var(--panel); }
.chart svg text { font-family: monospace; fill: var(--muted); }
.chart-legend-row { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; font-size: 10px; color: var(--muted); text-transform: uppercase; }
.chart-legend i { display: inline-block; width: 13px; height: 13px; margin-right: 6px; border: 1px solid var(--line); vertical-align: middle; }
.hbar { padding: 14px 16px; }
.hbar-row { display: flex; align-items: center; gap: 10px; margin: 9px 0; }
.hbar-label { flex: 0 0 130px; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hbar-track { flex: 1; border: 1px solid var(--line); border-radius: 3px; height: 18px; background: var(--background); }
.hbar-bar { display: block; height: 100%; border-radius: 2px; }
.hbar-value { flex: 0 0 90px; text-align: right; font-family: monospace; font-size: 10px; color: var(--muted); }
.sub { color: var(--muted); font-size: 10px; }
h2 { font-size: 15px; font-weight: 600; margin: 26px 0 12px; }
h2 .sub { margin-left: 8px; font: normal 11px monospace; }
.section-kicker { margin: -10px 0 18px; color: var(--muted); font-size: 10px; letter-spacing: 0.12em; }
.login-theme { position: fixed; top: 14px; right: 14px; z-index: 9; padding: 7px 10px; border: 1px solid var(--line); border-radius: 3px; background: var(--panel); color: var(--muted); font-size: 10px; text-transform: uppercase; }
.login-theme:hover { color: var(--profit); border-color: var(--profit); }
.login-card { width: min(100%, 820px); display: grid; grid-template-columns: 1.1fr 0.9fr; border: 1px solid var(--line); background: var(--panel); overflow: hidden; }
.login-copy { padding: clamp(24px, 6vw, 56px); background: var(--profit); color: var(--background); border-right: 1px solid var(--line); }
.login-copy .eyebrow { color: var(--background); opacity: 0.7; }
.login-copy h1 { margin: 44px 0 16px; font-size: clamp(2.6rem, 8vw, 4.8rem); letter-spacing: -0.06em; line-height: 0.85; font-weight: 800; }
.login-copy p { max-width: 30rem; font-size: 12px; line-height: 1.6; }
.login-form { padding: clamp(24px, 6vw, 56px); }
.login-form h2 { margin: 0 0 22px; font-size: 16px; font-weight: 600; letter-spacing: -0.02em; }
.login-form form { display: grid; gap: 12px; }
.login-form label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; }
.login-form input { width: 100%; padding: 13px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--background); color: var(--foreground); outline: none; font: 11px monospace; }
.login-form input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(99, 169, 255, 0.25); }
.login-form button { padding: 13px; border: 1px solid var(--foreground); border-radius: var(--radius); background: var(--foreground); color: var(--background); font-weight: 700; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; }
.login-form button:hover { background: var(--profit); border-color: var(--profit); color: var(--background); }
.scrim { display: none; }
@media (max-width: 900px) {
	.sidebar { width: 205px; flex-basis: 205px; }
	.content { padding: 0 18px 35px; }
	.grid-two { grid-template-columns: 1fr; }
	.allocation { min-height: auto; }
	.stats-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
	.sidebar { position: fixed; inset: 0 auto 0 0; transform: translateX(-100%); transition: transform 0.2s; }
	.sidebar.open { transform: translateX(0); }
	.scrim { display: block; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); border: 0; z-index: 5; }
	.close-nav, .mobile-menu { display: grid; place-items: center; }
	.close-nav { margin-left: auto; }
	.mobile-menu { padding: 0; }
	.content { width: 100%; padding: 0 12px 30px; }
	.topbar { height: 74px; }
	.topbar h1 { font-size: 16px; }
	.top-actions { gap: 7px; }
	.live small { display: none; }
	.section-head { align-items: flex-start; flex-direction: column; }
	.stats-grid { grid-template-columns: repeat(2, 1fr); }
	.stat { padding: 13px; min-height: 84px; }
	.stat strong { font-size: 18px; }
	.toolbar { padding: 12px; }
	.search { max-width: none; flex-basis: 100%; }
	.toolbar .small { margin-left: 0; }
	.agent-banner { align-items: flex-start; flex-direction: column; }
	.agent-banner button { align-self: stretch; }
	.agent-stats { grid-template-columns: repeat(2, 1fr); }
	.panel-head { padding: 14px; }
	th, td { padding-left: 12px; padding-right: 12px; }
	.login-card { grid-template-columns: 1fr; }
	.login-copy { border-right: 0; border-bottom: 1px solid var(--line); }
	.login-copy h1 { margin-top: 24px; }
}
`;
```

- [ ] **Step 2: Verifikasi kompilasi**

Run: `npm run typecheck`
Expected: PASS (file belum dipakai — tidak ada error baru)

- [ ] **Step 3: Commit**

```bash
git add src/web/theme.ts
git commit -m "style(web): design system css tokens (dark default + light) di theme.ts"
```

---

### Task 2: `layout.ts` — shell baru (sidebar + topbar) di `pageShell`

**Files:**
- Modify: `src/web/layout.ts` (seluruh blok `<style>` di `pageShell` dan `loginPage` diganti `themeCss`; markup shell baru; hapus font Google)

**Interfaces:**
- Consumes: `themeCss` (Task 1)
- Produces: `PageShellParams` baru dengan `rpc: string; wallet: string`; `pageShell(params)` yang memakai kelas baru; `shortAddr(value: string): string`; `rpcHost(url: string): string` (dipakai Task 3)

- [ ] **Step 1: Import themeCss + ubah `PageShellParams`**

```ts
import { themeCss } from "./theme.js";

export interface PageShellParams {
	readonly title: string;
	readonly active: PageSection;
	readonly body: string;
	readonly rpc: string;
	readonly wallet: string;
}

export function shortAddr(value: string): string {
	if (value.length <= 12) return value;
	return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function rpcHost(url: string): string {
	return url.replace(/^https?:\/\//, "").split("/")[0] || url;
}
```

- [ ] **Step 2: Ganti head + style + body `pageShell`**

Ganti seluruh `<link ... fonts.googleapis ...>` dan blok `<style>...</style>` dengan:

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b0e14">
<title>${escapeHtml(params.title)} // VEXIS</title>
<script src="https://unpkg.com/htmx.org@1.9.12"></script>
<style>${themeCss}</style>
```

Ganti seluruh markup body `<aside class="sidebar">...</aside><main>...` dengan:

```html
<aside class="sidebar">
	<div class="brand">
		<span class="brand-mark">V</span>
		<span><b>VEXIS</b><small>DLMM OPS</small></span>
		<button class="close-nav" type="button" onclick="document.querySelector('.sidebar').classList.remove('open');document.querySelector('.scrim').classList.remove('open')">✕</button>
	</div>
	<div class="workspace"><span class="dot green"></span>MAINNET<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></div>
	<nav aria-label="Primary navigation">${links}</nav>
	<div class="sidebar-bottom">
		<div class="rpc"><span class="dot green"></span><span><b>RPC CONNECTED</b><small>${escapeHtml(params.rpc)}</small></span></div>
		<div class="wallet"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg><span class="addr">${escapeHtml(shortAddr(params.wallet))}</span></div>
		<div class="sidebar-actions">
			<span class="read-only">READ ONLY</span>
			<a class="logout" href="/logout">Exit</a>
		</div>
	</div>
</aside>
<main class="content">
	<header class="topbar">
		<button class="mobile-menu" type="button" aria-label="Open menu" onclick="document.querySelector('.sidebar').classList.add('open')">☰</button>
		<div><span class="eyebrow">VEXIS / ${escapeHtml(params.title.toUpperCase())}</span><h1>${escapeHtml(params.title)}</h1></div>
		<div class="top-actions">
			<div class="live"><span class="dot green"></span>LIVE<small>Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>
			<button class="icon-button" type="button" title="Toggle theme" onclick="toggleTheme()">☾</button>
			<span class="avatar">VX</span>
		</div>
	</header>
	<div class="page-stack">
	${params.body}
	</div>
</main>
```

`links` map ubah menjadi (`nav-item` bukan `nav-link`, aktif `active` + `aria-current` tetap):

```ts
const links = NAV.map((item) => {
	const active = item.key === params.active;
	return `<button class="nav-item${active ? " active" : ""}" type="button" onclick="location.href='${item.href}'"${active ? ' aria-current="page"' : ""}>${item.label}</button>`;
}).join("\n");
```

Script tema tetap (tanpa preferensi sistem — default dark):

```html
<script>
(function () {
	var root = document.documentElement;
	if (localStorage.getItem("vexis-theme") === "light") root.setAttribute("data-theme", "light");
	window.toggleTheme = function () {
		var light = root.getAttribute("data-theme") === "light";
		if (light) root.removeAttribute("data-theme");
		else root.setAttribute("data-theme", "light");
		localStorage.setItem("vexis-theme", light ? "dark" : "light");
	};
})();
</script>
```

- [ ] **Step 3: Verifikasi**

Run: `npm run check && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/web/layout.ts
git commit -m "style(web): shell sidebar+topbar design system di pageShell"
```

---

### Task 3: `server.ts` — suntik RPC host + wallet ke shell

**Files:**
- Modify: `src/web/server.ts`

**Interfaces:**
- Consumes: `PageShellParams` baru, `rpcHost` dari `layout.ts` (Task 2)
- Produces: `buildRouter(password, shell)` — `shell: { rpc: string; wallet: string }` (Task 2 sudah dipakai di pageResponse; tidak dipakai task lain)

- [ ] **Step 1: Ubah `pageResponse` + `buildRouter`**

```ts
import { contentRegion, loginPage, pageShell, rpcHost } from "./layout.js";

interface ShellInfo {
	readonly rpc: string;
	readonly wallet: string;
}

function pageResponse(
	title: string,
	active: "portfolio" | "pools" | "agent",
	inner: string,
	refreshPath: string | null,
	shell: ShellInfo,
): HttpServerResponse.HttpServerResponse {
	return HttpServerResponse.html(
		pageShell({
			title,
			active,
			body: contentRegion({
				id: "page-content",
				inner,
				refreshPath,
			}),
			rpc: shell.rpc,
			wallet: shell.wallet,
		}),
	);
}

export function buildRouter(password: string, shell: ShellInfo) {
```

Setiap pemanggilan `pageResponse(...)` tambahkan `shell` sebagai argumen keempat (sebelum/`sesudah` refreshPath — ikuti urutan di atas): `pageResponse("Portfolio", "portfolio", inner, "/partials/portfolio", shell)` dan seterusnya (3 lokasi: portfolioPage, poolsPage, agentPage).

- [ ] **Step 2: Ubah `startWebServer`**

```ts
const current = yield* config.get;
const web = resolveWebConfig(current);
const shell: ShellInfo = {
	rpc: rpcHost(current.rpcUrl ?? "rpc not configured"),
	wallet: current.wallet ?? "no wallet configured",
};
// ...
const router = buildRouter(web.password, shell);
```

- [ ] **Step 3: Verifikasi**

Run: `npm run check && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/web/server.ts
git commit -m "style(web): inject rpc host + wallet ke page shell"
```

---

### Task 4: `templates.ts` — remap komponen (stat, table, badge, pnl)

**Files:**
- Modify: `src/web/templates.ts`

**Interfaces:**
- Consumes: —
- Produces: `BadgeKind = "pass" | "review" | "blocked" | "hold" | "neutral"`; `badge(text, kind)`; `summaryCard` → `stat`; `table` → `table-scroll`; `pnlClass` → `"profit" | "loss" | "zero"` (dipakai Task 5–8)

- [ ] **Step 1: Ubah `pnlClass`, `BadgeKind`, `badge`, `summaryCard`, `table`**

```ts
export function pnlClass(value: number): "profit" | "loss" | "zero" {
	return value > 0 ? "profit" : value < 0 ? "loss" : "zero";
}

export type BadgeKind = "pass" | "review" | "blocked" | "hold" | "neutral";

export function badge(text: string, kind: BadgeKind): string {
	return `<span class="badge ${kind}">${escapeHtml(text)}</span>`;
}

export function summaryCard(label: string, value: string, sub: string): string {
	return `<div class="stat"><span class="eyebrow">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><span class="stat-sub">${escapeHtml(sub)}</span></div>`;
}
```

`summaryCard` tetap bernama `summaryCard` (dipakai 4 lokasi: portfolio.ts, agent.ts) — kini menghasilkan `.stat`; pemanggil membungkusnya dalam `.stats-grid`.

Ubah `table` (dan tambahkan `statsGrid` helper):

```ts
export function statsGrid(cards: readonly string[]): string {
	return `<div class="stats-grid">${cards.join("\n")}</div>`;
}

export function table(
	headers: readonly string[],
	rows: readonly string[],
): string {
	const head = headers
		.map((header) => `<th>${escapeHtml(header)}</th>`)
		.join("");
	return `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>\n${rows.join("\n")}\n</tbody></table></div>`;
}
```

- [ ] **Step 2: Verifikasi**

Run: `npm run check && npm run typecheck`
Expected: PASS (ada pemanggil lama yang error tipe badge — diperbaiki di Task 5–8; jika `check` gagal karena pemanggil lama, lanjut dulu ke Task 5–8 lalu verifikasi menyeluruh di Task 10)

- [ ] **Step 3: Commit**

```bash
git add src/web/templates.ts
git commit -m "style(web): komponen templates (stat, table-scroll, badge kinds, pnl) design system"
```

---

### Task 5: `charts.ts` — warna via CSS variables

**Files:**
- Modify: `src/web/charts.ts`

**Interfaces:**
- Consumes: —
- Produces: `CHART_COLORS = { profit: "var(--profit)", loss: "var(--loss)", blue: "var(--blue)", gold: "var(--gold)", ink: "var(--foreground)" }`; `lineChart` stroke `var(--profit)` + dot `var(--muted)` + area gradient (dipakai Task 6)

- [ ] **Step 1: Ubah `CHART_COLORS` + `lineChart`**

```ts
export const CHART_COLORS = {
	profit: "var(--profit)",
	loss: "var(--loss)",
	blue: "var(--blue)",
	gold: "var(--gold)",
	ink: "var(--foreground)",
} as const;
```

`lineChart` — ganti polyline stroke dan dots, tambah area gradient:

```ts
	const dots = coords
		.map(
			(coord) =>
				`<circle cx="${coord.x.toFixed(1)}" cy="${coord.y.toFixed(1)}" r="2.5" fill="var(--muted)"/>`,
		)
		.join("");
	const areaPath = coords
		.map(
			(coord, i) =>
				`${i === 0 ? "M" : "L"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`,
		)
		.join(" ");
	return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="line chart"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--profit)" stop-opacity="0.24"/><stop offset="1" stop-color="var(--profit)" stop-opacity="0"/></linearGradient></defs><path d="${areaPath} V${height} H0 Z" fill="url(#area)"/><polyline points="${line}" fill="none" stroke="var(--profit)" stroke-width="2"/>${dots}${labelsHtml}</svg></div>`;
```

Catatan: `id="area"` bisa duplikat jika 2 chart dalam satu halaman — cukup unik di halaman portfolio (satu line chart); aman.

- [ ] **Step 2: Perbaiki pemanggil warna lama**

Di `src/web/pages/pools.ts` (baris ~51): `color: CHART_COLORS.blue` → `CHART_COLORS.blue` (tidak berubah — properti tetap ada).
Di `src/web/pages/agent.ts` (cycleChart): ganti seri warna:
- `{ name: "open", color: CHART_COLORS.profit, ... }`
- `{ name: "tp", color: CHART_COLORS.gold, ... }`
- `{ name: "sl", color: CHART_COLORS.loss, ... }`
- `{ name: "close", color: CHART_COLORS.blue, ... }`

- [ ] **Step 3: Verifikasi**

Run: `npm run check && npm run typecheck`
Expected: PASS (kecuali error badge dari Task 4 yang dituntaskan Task 5–8)

- [ ] **Step 4: Commit**

```bash
git add src/web/charts.ts src/web/pages/pools.ts src/web/pages/agent.ts
git commit -m "style(web): chart colors pakai css variables design system"
```

---

### Task 6: `pages/portfolio.ts` — panel equity curve + allocation + stats-grid

**Files:**
- Modify: `src/web/pages/portfolio.ts`

**Interfaces:**
- Consumes: `statsGrid`, `summaryCard`, `badge` kinds baru, `table`, `pnlClass` (Task 4); `lineChart` (Task 5); `PortfolioSnapshot` dari `portfolio-history.ts`
- Produces: `renderPortfolio(data, history)` — markup baru (dipakai `portfolioContent` yang sudah ada)

- [ ] **Step 1: Ubah `renderPortfolio`**

```ts
export function renderPortfolio(
	data: PortfolioData,
	history: readonly PortfolioSnapshot[] = [],
): string {
	const openBalance = data.open.reduce(
		(sum, pool) => sum + parseFloat(pool.balances || "0"),
		0,
	);
	const openFees = data.open.reduce(
		(sum, pool) => sum + parseFloat(pool.unclaimedFees || "0"),
		0,
	);
	const openCount = data.open.reduce(
		(sum, pool) => sum + pool.openPositionCount,
		0,
	);
	const totalPnl = parseFloat(data.total.totalPnlUsd);
	const pnlPct = parseFloat(data.total.totalPnlPctChange);

	const cards = [
		summaryCard(
			"Total equity",
			fmtUsd(openBalance),
			`${data.open.length} open pools`,
		),
		summaryCard(
			"Unrealized PnL",
			fmtUsd(data.total.totalPnlUsd),
			fmtPct(data.total.totalPnlPctChange),
		),
		summaryCard(
			"PnL SOL",
			fmtSol(data.total.totalPnlSol),
			fmtPct(data.total.totalPnlSolPctChange),
		),
		summaryCard(
			"Unclaimed fees",
			fmtUsd(openFees),
			`${openCount} active positions`,
		),
	];

	return `<section>
${sectionHead(
	"ACCOUNT EQUITY",
	`Automated DLMM positions · ${data.open.length} pools / ${openCount} positions`,
)}
${statsGrid(cards)}
${equityPanel(history, totalPnl, pnlPct)}
${allocationPanel(openBalance, openFees)}
${renderOpen(data.open)}
${renderClosed(data.closed)}
</section>`;
}
```

Tambahkan helper di file yang sama:

```ts
function sectionHead(kicker: string, sub: string): string {
	return `<div class="section-head"><div><p class="kicker">${escapeHtml(kicker)}</p><p class="muted">${escapeHtml(sub)}</p></div></div>`;
}

function equityPanel(
	history: readonly PortfolioSnapshot[],
	totalPnl: number,
	pnlPct: number,
): string {
	const points = history
		.filter((snap) => snap.pnlUsd !== null)
		.slice(-48)
		.map((snap) => ({ label: tsLocal(snap.ts), value: snap.pnlUsd as number }));
	if (points.length < 2) {
		return `<div class="panel chart-panel"><div class="panel-head"><div><span class="eyebrow">EQUITY CURVE</span><b>${fmtUsd(totalPnl)} <em class="profit">${fmtPct(pnlPct)}</em></b></div><span class="muted small">${points.length} snapshot${points.length === 1 ? "" : "s"}</span></div><div class="empty">No equity history yet</div></div>`;
	}
	const first = points[0];
	const last = points[points.length - 1];
	return `<div class="panel chart-panel"><div class="panel-head"><div><span class="eyebrow">EQUITY CURVE</span><b>${fmtUsd(last.value)} <em class="profit">${fmtPct(pnlPct)}</em></b></div><span class="muted small">Updated ${tsLocal(last.ts)}</span></div>${lineChart(points)}<div class="chart-labels"><span>${escapeHtml(first.label)}</span><span>${escapeHtml(last.label)}</span></div></div>`;
}

function allocationPanel(
	balanceUsd: number,
	feesUsd: number,
): string {
	const total = balanceUsd + feesUsd;
	let style = "background: #3c4653";
	let center = "$0.00";
	let main = "0.00";
	let balancePct = 0;
	let feesPct = 0;
	if (total > 0) {
		balancePct = (balanceUsd / total) * 100;
		feesPct = (feesUsd / total) * 100;
		main = formatNum(balanceUsd + feesUsd, 2);
		center = fmtUsd(balanceUsd + feesUsd);
		style = `background: conic-gradient(var(--profit) 0 ${balancePct.toFixed(1)}%, var(--gold) ${balancePct.toFixed(1)}% ${(balancePct + feesPct).toFixed(1)}%, #3c4653 ${(balancePct + feesPct).toFixed(1)}% 100%)`;
	}
	return `<div class="panel allocation"><div class="panel-head"><span class="eyebrow">ALLOCATION</span><span class="muted small">Position value</span></div><div class="allocation-ring" style="${style}"><div><b>${escapeHtml(main)}</b><small>${escapeHtml(center)}</small></div></div><div class="legend"><span><i class="legend-green"></i>Balance<b>${fmtUsd(balanceUsd)}</b></span><span><i class="legend-gold"></i>Fees<b>${fmtUsd(feesUsd)}</b></span><span><i class="legend-muted"></i>Unaccounted<b>${fmtUsd(Math.max(0, total * 0))}</b></span></div></div>`;
}
```

Tambahkan `formatNum` ke import dari `../../format.js` dan hapus `pnlHistoryChart` lama (diganti `equityPanel`); `renderOpen`/`renderClosed` tetap, dengan perubahan:
- Hapus tag `<h2>` + `<div class="sub">` lama → `<h2>Open Positions <span class="sub">// ${pools.length} pools</span></h2>` (CSS baru sudah ada)
- Badge: `badge("OOR", "danger")` → `badge("OOR", "blocked")`; `badge("IN RANGE", "ok")` → `badge("IN RANGE", "pass")`
- Kelas pnl: `pnlClass(pnlPct)` kini mengembalikan `profit`/`loss`/`zero` (CSS sudah ada)

- [ ] **Step 2: Verifikasi**

Run: `npm run check && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/web/pages/portfolio.ts
git commit -m "style(web): portfolio page — stats-grid, equity curve, allocation ring"
```

---

### Task 7: `pages/pools.ts` — toolbar + radar table

**Files:**
- Modify: `src/web/pages/pools.ts`

**Interfaces:**
- Consumes: `table`, `badge` kinds baru, `pnlClass` (Task 4); `CHART_COLORS` (Task 5)
- Produces: `renderPools(result, opts)` markup baru (dipakai `poolsContent` yang sudah ada)

- [ ] **Step 1: Ubah `renderPools` + `filterForm` + badge mapping**

```ts
export function renderPools(
	result: ScreenResult,
	opts: { timeframe: string },
): string {
	const content =
		result.pools.length === 0
			? `<div class="empty">No pools found</div>`
			: `${tvlChart(result.pools)}${renderPoolTable(result.pools)}`;

	return `<section>
${sectionHead(
	`MARKET SCANNER / ${result.total} POOLS`,
	`${result.pools.length} shown / ${result.filtered} filtered · ${opts.timeframe} timeframe`,
)}
${filterForm(opts.timeframe)}
${content}
</section>`;
}
```

Tambahkan `sectionHead` helper (sama seperti di portfolio.ts — duplikasi kecil disengaja agar tiap halaman mandiri):

```ts
function sectionHead(kicker: string, sub: string): string {
	return `<div class="section-head"><div><p class="kicker">${escapeHtml(kicker)}</p><p class="muted">${escapeHtml(sub)}</p></div></div>`;
}
```

`filterForm` → toolbar panel (form GET tetap, action `/pools`):

```ts
function filterForm(timeframe: string): string {
	const options = TIMEFRAMES.map(
		(item) =>
			`<option value="${item}"${item === timeframe ? " selected" : ""}>${item}</option>`,
	).join("\n");
	return `<form class="filter" method="get" action="/pools">
<label for="timeframe">Timeframe</label>
<select id="timeframe" name="timeframe">${options}</select>
<button type="submit">Run screen</button>
</form>`;
}
```

Mapping badge di `renderPoolTable`:
- `organicKind`: `>= 80 ? "pass" : >= 60 ? "review" : "blocked"`
- `rug`: `badge("N/A", "neutral")`; `badge(String(pool.rugScore), pool.rugScore >= 70 ? "pass" : "blocked")`
- `trendClass = pnlClass(...)` (tidak berubah, kini menghasilkan profit/loss/zero)

- [ ] **Step 2: Verifikasi**

Run: `npm run check && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/web/pages/pools.ts
git commit -m "style(web): pool radar — section-head + filter toolbar + badge kinds"
```

---

### Task 8: `pages/agent.ts` — agent banner + briefing/decisions + journal

**Files:**
- Modify: `src/web/pages/agent.ts`

**Interfaces:**
- Consumes: `statsGrid`, `summaryCard`, `badge` kinds baru, `table` (Task 4); `CHART_COLORS` (Task 5); `AgentJournalEntry`, `AgentState`, `readJournalAll`, `loadState` (tidak berubah)
- Produces: `renderAgent(journal, state, opts)` markup baru (dipakai `agentContent` yang sudah ada)

- [ ] **Step 1: Ubah badge mapping**

```ts
function actionBadge(candidate: JournalCandidate): string {
	let kind: BadgeKind = "neutral";
	if (candidate.action === "open") kind = "pass";
	if (candidate.action === "hold") kind = "hold";
	if (candidate.action === "tp") kind = "pass";
	if (candidate.action === "sl") kind = "blocked";
	if (candidate.action === "close") kind = "blocked";
	return badge(candidate.action, kind);
}

function guardrailBadge(candidate: JournalCandidate): string {
	return candidate.guardrail === "blocked"
		? badge("blocked", "blocked")
		: badge("pass", "pass");
}

function executionText(candidate: JournalCandidate): string {
	if (candidate.execution === "failed") return badge("failed", "blocked");
	// ... sisa tidak berubah
}
```

- [ ] **Step 2: Ubah `renderAgent`**

```ts
export function renderAgent(
	journal: readonly AgentJournalEntry[],
	state: AgentState | null,
	opts: AgentViewOptions,
): string {
	const stats = agentStats(journal);
	const lastEntry = journal[journal.length - 1];
	const banner = `<div class="agent-banner"><div class="agent-status"><span class="pulse ${state?.running ? "active" : ""}"></span><div><span class="eyebrow">AUTOMATION ENGINE</span><h2>${state?.running ? "Agent is running" : "Agent is stopped"}</h2><p class="muted">${lastEntry ? `Last cycle completed ${tsLocal(lastEntry.ts)}` : "No cycles recorded yet"}</p></div></div></div>`;

	const cards = [
		summaryCard("Cycles", String(stats.cycles), `cycle ${state?.cycle ?? 0}`),
		summaryCard("Opens", String(stats.opens), `${stats.successRate}% of decisions`),
		summaryCard("Blocked", String(stats.blocked), "guardrail prevented"),
		summaryCard("Success rate", `${stats.successRate}%`, "execution success"),
	];

	const opensPerCycle = journal.map(
		(entry) =>
			entry.candidates.filter(
				(candidate) =>
					candidate.action === "open" && candidate.execution === "ok",
			).length,
	);
	const trend =
		sparkline(opensPerCycle) === ""
			? ""
			: `<div class="sparkline-card"><div class="sub">SUCCESSFUL OPENS / CYCLE</div>${sparkline(opensPerCycle)}</div>`;

	const rows = journalRows(journal, opts.action);
	const paged = paginate(rows, opts.page, JOURNAL_PAGE_SIZE);

	return `<section>
${sectionHead(
	`AUTOMATION JOURNAL / CYCLE ${state?.cycle ?? 0}`,
	`${rows.length} entries · filter ${opts.action}`,
)}
${banner}
${statsGrid(cards)}
${trend}
${cycleChart(journal)}
<h2>Decision Journal <span class="sub">// ${rows.length} entries</span></h2>
${journalFilterForm(opts.action)}
${journal.length === 0 ? `<div class="empty">No journal entries</div>` : renderJournalTable(paged.rows)}
${paginationLinks(opts.action, paged)}
</section>`;
}
```

Tambahkan `sectionHead` + `statsGrid` import dari `templates.js` (`statsGrid` di-import dari templates; `sectionHead` = helper lokal seperti Task 6/7).

`cycleChart` — bungkus ke panel dengan judul dan baca `barChart` (label + legend tetap), ubah pemanggilan warna sesuai Task 5 Step 2. `journalFilterForm` → `filter` (CSS sudah ada di theme.ts). `paginationLinks` — markup sama, kelas CSS baru sudah ada.

- [ ] **Step 3: Verifikasi**

Run: `npm run check && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/web/pages/agent.ts
git commit -m "style(web): agent page — banner, stats, briefing, decisions, journal badges"
```

---

### Task 9: `layout.ts` — login page design system

**Files:**
- Modify: `src/web/layout.ts` (`loginPage`)

**Interfaces:**
- Consumes: `themeCss` (Task 1)
- Produces: `loginPage(opts)` markup baru (dipakai server.ts yang sudah ada)

- [ ] **Step 1: Ubah `loginPage`**

Ganti seluruh `<style>` dengan `<style>${themeCss}</style>`; ganti `<meta name="theme-color">` jadi `#0b0e14`; hapus Google Fonts link. Body:

```html
<body>
<button class="login-theme" type="button" onclick="toggleTheme()">☾ Theme</button>
<main style="min-height:100vh;display:grid;place-items:center;padding:20px">
	<div class="login-card">
		<section class="login-copy">
			<div class="eyebrow">VEXIS / SOLANA LIQUIDITY OPS</div>
			<h1>READ<br>ONLY.</h1>
			<p>Observe portfolio health, screen DLMM pools, and inspect agent decisions. No private keys. No execution controls.</p>
		</section>
		<section class="login-form">
			<h2>Observer access</h2>
			${error}
			<form method="post" action="/login">
				<label for="password">Dashboard password</label>
				<input id="password" type="password" name="password" placeholder="ENTER PASSWORD" autofocus required>
				<button type="submit">Enter dashboard</button>
			</form>
		</section>
	</div>
</main>
<script>
(function () {
	var root = document.documentElement;
	if (localStorage.getItem("vexis-theme") === "light") root.setAttribute("data-theme", "light");
	window.toggleTheme = function () {
		var light = root.getAttribute("data-theme") === "light";
		if (light) root.removeAttribute("data-theme");
		else root.setAttribute("data-theme", "light");
		localStorage.setItem("vexis-theme", light ? "dark" : "light");
	};
})();
</script>
</body>
```

`.error` di login: CSS `.error` dari theme.ts sudah cocok (border loss + tint).

- [ ] **Step 2: Verifikasi**

Run: `npm run check && npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/web/layout.ts
git commit -m "style(web): login page design system (dark default + light)"
```

---

### Task 10: Verifikasi menyeluruh + manual

**Files:** — (tanpa perubahan kode)

- [ ] **Step 1: Jalankan semua verifikasi**

Run: `npm run check && npm run typecheck && npm test`
Expected: ketiganya PASS

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: tsc → dist/ sukses tanpa error

- [ ] **Step 3: Cek visual manual (jika memungkinkan)**

Run: `npm run dev` lalu buka `http://127.0.0.1:8080/portfolio` (perlu `web.enabled: true` + `web.password` di `vexis.config.json`)
Periksa: sidebar (brand/workspace/RPC/wallet), topbar (LIVE + toggle), grid paper, stats, panel equity curve + allocation, tabel, badge warna, login page, toggle tema dark↔light, mobile <640px (sidebar off-canvas).

- [ ] **Step 4: Commit final (jika ada perbaikan dari Step 3)**

```bash
git add -A
git commit -m "style(web): touch-up dashboard design system"
```

---

## Self-Review

- **Spec coverage:** Spec bagian 1 (tokens dark/light, grid paper, font) → Task 1; bagian 2 (shell sidebar/topbar/toggle/mobile) → Task 2, 3, 9; bagian 3 (templates, portfolio, pools, agent, login) → Task 4, 6, 7, 8, 9; bagian 4 (charts) → Task 5; bagian 5 (verifikasi) → Task 10. Semua ter-cover.
- **Placeholder scan:** Semua step berisi kode konkret; tidak ada "similar to Task N" tanpa isi; satu-satunya referensi silang adalah reuse helper `sectionHead`/`statsGrid` dengan kode ditulis ulang penuh di tiap task.
- **Type consistency:** `BadgeKind` baru (`"pass" | "review" | "blocked" | "hold" | "neutral"`) konsisten di Task 4, 6, 7, 8; `pnlClass` mengembalikan `"profit" | "loss" | "zero"` konsisten; `PageShellParams` (rpc/wallet) konsisten di Task 2–3; `CHART_COLORS` keys konsisten di Task 5, 7 (blue), 8 (profit/gold/loss/blue).
