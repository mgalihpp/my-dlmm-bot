export const themeCss = `
:root {
	color-scheme: dark;
	--background: #0b0e14;
	--foreground: #e7ebf2;
	--panel: #10151e;
	--panel-2: #151b25;
	--line: #222b39;
	--line-soft: rgba(34, 43, 57, 0.72);
	--muted: #7f8999;
	--profit: #b8ff4d;
	--loss: #ff6f6f;
	--gold: #f0bd57;
	--blue: #63a9ff;
	--radius: 4px;
	--grid: rgba(255, 255, 255, 0.018);
	--nav-active: #1a222e;
	--tag: #394555;
	--legend-muted: #3c4653;
	--sidebar-bg: rgba(13, 17, 24, 0.97);
	--overlay: rgba(0, 0, 0, 0.65);
}

:root[data-theme="light"] {
	color-scheme: light;
	--background: #f4f5f7;
	--foreground: #1a1d23;
	--panel: #ffffff;
	--panel-2: #eceff3;
	--line: #d9dde3;
	--line-soft: rgba(217, 221, 227, 0.72);
	--muted: #6b7280;
	--profit: #4a7a00;
	--loss: #c0392b;
	--gold: #a36a00;
	--blue: #2f6fd0;
	--grid: rgba(0, 0, 0, 0.025);
	--nav-active: #e6e9ee;
	--tag: #c8cdd5;
	--legend-muted: #c8cdd5;
	--sidebar-bg: rgba(250, 251, 252, 0.97);
	--overlay: rgba(17, 24, 39, 0.35);
}

* { box-sizing: border-box; }
html { background: var(--background); }
body {
	min-height: 100vh;
	margin: 0;
	background: var(--background);
	color: var(--foreground);
	font-family: Arial, sans-serif;
	font-size: 13px;
	line-height: 1.5;
}
button, input, select { font: inherit; }
button { cursor: pointer; }
button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible {
	outline: 1px solid var(--profit);
	outline-offset: 2px;
}
a { color: var(--blue); text-decoration: none; }
a:hover { text-decoration: underline; }

.terminal {
	height: 100vh;
	overflow: hidden;
	display: flex;
	background-color: var(--background);
	background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px);
	background-size: 28px 28px;
}
.sidebar {
	width: 224px;
	flex: 0 0 224px;
	height: 100vh;
	overflow-y: auto;
	z-index: 10;
	display: flex;
	flex-direction: column;
	padding: 22px 14px 16px;
	border-right: 1px solid var(--line);
	background: var(--sidebar-bg);
}
.brand {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 0 9px 26px;
	letter-spacing: 0.08em;
	}
.brand-link {
	display: flex;
	align-items: center;
	gap: 10px;
	color: var(--foreground);
	text-decoration: none;
}
.brand-link:hover { text-decoration: none; }
.brand-mark {
	display: grid;
	width: 25px;
	height: 25px;
	place-items: center;
	border-radius: 3px;
	background: var(--profit);
	color: var(--background);
	font: 800 15px monospace;
}
.brand b, .brand small { display: block; }
.brand b { font-size: 15px; letter-spacing: 0.16em; }
.brand small { margin-top: 3px; color: var(--muted); font: 9px monospace; letter-spacing: 0.11em; }
.close-nav, .mobile-menu {
	display: none;
	border: 0;
	background: transparent;
	color: var(--muted);
}
.workspace {
	display: flex;
	align-items: center;
	gap: 7px;
	margin-bottom: 20px;
	padding: 9px 10px;
	border: 1px solid var(--line);
	background: var(--panel);
	color: var(--muted);
	font: 10px monospace;
}
.workspace svg { margin-left: auto; }
.dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; }
.green { background: var(--profit); box-shadow: 0 0 8px color-mix(in srgb, var(--profit) 65%, transparent); }
nav { display: grid; gap: 3px; }
.nav-item {
	display: flex;
	align-items: center;
	gap: 11px;
	padding: 11px 10px;
	border: 0;
	border-radius: 3px;
	background: transparent;
	color: var(--muted);
	font-size: 12px;
	text-align: left;
}
.nav-item:hover, .nav-item.active { background: var(--nav-active); color: var(--foreground); text-decoration: none; }
.nav-item.active { box-shadow: inset 2px 0 var(--profit); }
.sidebar-bottom { display: grid; gap: 14px; margin-top: auto; }
.rpc { display: flex; align-items: flex-start; gap: 9px; padding: 16px 8px 0; border-top: 1px solid var(--line); }
.rpc b, .rpc small { display: block; }
.rpc b { color: var(--profit); font: 10px monospace; }
.rpc small { max-width: 170px; margin-top: 4px; overflow: hidden; color: var(--muted); font: 10px monospace; text-overflow: ellipsis; white-space: nowrap; }
.wallet {
	display: flex;
	align-items: center;
	gap: 7px;
	padding: 10px;
	border: 1px solid var(--line);
	color: var(--muted);
	font: 10px monospace;
}
.wallet .addr { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sidebar-actions { display: grid; gap: 8px; }
.read-only {
	padding: 6px 8px;
	border: 1px solid var(--line);
	border-radius: 3px;
	color: var(--muted);
	font: 10px monospace;
	letter-spacing: 0.1em;
	text-align: center;
}
.logout {
	display: block;
	padding: 8px;
	border: 1px solid var(--loss);
	border-radius: 3px;
	background: transparent;
	color: var(--loss);
	font: 10px monospace;
	letter-spacing: 0.05em;
	text-align: center;
	text-transform: uppercase;
}
.logout:hover { background: var(--loss); color: var(--background); text-decoration: none; }

.content { min-width: 0; flex: 1; height: 100vh; overflow-y: auto; padding: 0 30px 45px; }
.topbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 20px;
	height: 88px;
	border-bottom: 1px solid var(--line);
}
.eyebrow, .kicker { display: block; color: var(--muted); font: 10px monospace; letter-spacing: 0.13em; }
.tooltip { position: relative; cursor: help; }
.tooltip::after {
	content: attr(data-tip);
	position: absolute;
	top: 130%;
	left: 0;
	z-index: 20;
	display: none;
	padding: 6px 8px;
	border: 1px solid var(--line);
	background: var(--panel-2);
	color: var(--foreground);
	font: 10px monospace;
	letter-spacing: 0;
	white-space: nowrap;
	pointer-events: none;
}
.tooltip:hover::after { display: block; }
.topbar h1 { margin: 7px 0 0; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; line-height: 1; }
.top-actions { display: flex; align-items: center; gap: 9px; }
.live { display: flex; align-items: center; gap: 6px; color: var(--profit); font: 10px monospace; }
.live small { padding-left: 8px; border-left: 1px solid var(--line); color: var(--muted); }
.icon-button, .avatar, .theme-toggle {
	display: grid;
	place-items: center;
	width: 31px;
	height: 31px;
	border: 1px solid var(--line);
	border-radius: 3px;
	background: var(--panel);
	color: var(--muted);
}
.icon-button:hover, .theme-toggle:hover { color: var(--profit); border-color: var(--profit); }
.avatar { border-color: var(--profit); background: var(--profit); color: var(--background); font: 800 10px monospace; }
.theme-toggle .icon-sun, .login-theme .icon-sun { display: none; }
.theme-toggle .icon-moon, .login-theme .icon-moon { display: block; }
[data-theme="light"] .theme-toggle .icon-sun, [data-theme="light"] .login-theme .icon-sun { display: block; }
[data-theme="light"] .theme-toggle .icon-moon, [data-theme="light"] .login-theme .icon-moon { display: none; }
.login-theme svg { display: inline-block; margin-right: 6px; vertical-align: -2px; }
.page-stack { padding-top: 28px; }
.page-region { display: grid; gap: 16px; }
.section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; }
section > * + *:not(h2) { margin-top: 16px; }
.kicker { margin: 0 0 6px; color: var(--profit); }
.section-head .muted { margin: 0; font-size: 12px; }
.muted { color: var(--muted); }
.small { font-size: 10px; }

.stats-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 1px;
	border: 1px solid var(--line);
	background: var(--line);
}
.stat { min-height: 91px; padding: 17px 18px; background: var(--panel); }
.stat strong { display: block; margin-top: 10px; color: var(--foreground); font: 600 22px monospace; letter-spacing: -0.06em; }
.stat-sub { display: block; margin-top: 7px; color: var(--muted); font: 10px monospace; }
.sol-icon { display: inline-block; vertical-align: -2px; }
.profit { color: var(--profit) !important; }
.loss { color: var(--loss) !important; }
.gold { color: var(--gold) !important; }
.zero { color: var(--muted) !important; }
.grid-two { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(270px, 0.85fr); gap: 16px; }
.panel { min-width: 0; border: 1px solid var(--line); background: var(--panel); }
.panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 17px 18px; border-bottom: 1px solid var(--line); }
.panel-head b { display: block; margin-top: 8px; font-size: 13px; font-weight: 500; }
.panel-head em { margin-left: 8px; font: normal 11px monospace; }
.chart-panel { min-height: 280px; }
.equity-chart { display: block; width: calc(100% - 36px); height: 184px; margin: 16px 18px 0; }
.chart-labels { display: flex; justify-content: space-between; padding: 0 18px 13px; color: var(--muted); font: 10px monospace; }
.allocation { min-height: 280px; }
.allocation-ring { position: relative; display: grid; width: 130px; height: 130px; margin: 22px auto 19px; place-items: center; border-radius: 50%; }
.allocation-ring::before { position: absolute; inset: 12px; border-radius: 50%; background: var(--panel); content: ""; }
.allocation-ring div { position: relative; text-align: center; }
.allocation-ring b { display: block; font: 24px monospace; }
.allocation-ring small { color: var(--muted); font: 9px monospace; }
.legend { display: grid; gap: 9px; padding: 0 18px; color: var(--muted); font: 10px monospace; }
.legend span { display: flex; align-items: center; gap: 8px; }
.legend b { margin-left: auto; color: var(--foreground); font-weight: 400; }
.legend i { width: 7px; height: 7px; border-radius: 1px; }
.legend-green { background: var(--profit); }
.legend-gold { background: var(--gold); }
.legend-muted { background: var(--legend-muted); }
.allocation-list { display: grid; gap: 9px; padding: 14px 18px; color: var(--muted); font: 10px monospace; }
.allocation-list span { display: flex; align-items: center; gap: 8px; }
.allocation-list .pair { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.allocation-list em { margin-left: auto; font-style: normal; color: var(--foreground); }
.allocation-total { display: flex; align-items: center; justify-content: space-between; margin: 0 18px 16px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font: 10px monospace; letter-spacing: 0.1em; }
.allocation-total b { font: 600 16px monospace; }

.text-button, .outline-button, .accent-button {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 7px 10px;
	border: 1px solid var(--line);
	background: transparent;
	color: var(--muted);
	font-size: 11px;
}
.text-button { padding: 0; border: 0; }
.text-button:hover, .outline-button:hover { border-color: var(--muted); color: var(--foreground); }
.accent-button { border-color: var(--profit); background: var(--profit); color: var(--background); font: 600 11px monospace; }
.accent-button:hover { filter: brightness(1.08); }
.table-scroll { overflow-x: auto; border: 1px solid var(--line); background: var(--panel); }
.table-scroll table { min-width: 760px; }
.radar-table { min-width: 1000px !important; }
table { width: 100%; border-collapse: collapse; }
th { padding: 11px 18px; border-bottom: 1px solid var(--line); color: var(--muted); font: 9px monospace; letter-spacing: 0.1em; text-align: left; white-space: nowrap; }
td { padding: 13px 18px; border-bottom: 1px solid var(--line-soft); font-size: 11px; white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
tbody tr { transition: background 120ms ease; }
tbody tr:hover { background: color-mix(in srgb, var(--profit) 7%, var(--panel)); }
td strong, td small { display: block; }
td strong { font-size: 11px; font-weight: 500; }
td small { margin-top: 5px; color: var(--muted); font: 10px monospace; }
.mono { font-family: monospace; }
.chevron { padding: 0 6px 0 0; border: 0; background: transparent; color: var(--muted); font: 700 12px monospace; cursor: pointer; transition: transform 150ms ease; vertical-align: middle; }
.chevron.open { transform: rotate(90deg); }
.detail-row td { padding: 0 18px 16px; background: color-mix(in srgb, var(--panel-2) 45%, var(--panel)); }
.detail-row:hover { background: transparent; }
.detail-row[hidden] { display: none; }
.detail-inner { padding: 14px 0 0; }
.detail-head { display: block; margin-bottom: 10px; color: var(--muted); font: 9px monospace; letter-spacing: 0.1em; }
.table-scroll .detail-table { min-width: 0 !important; }
.detail-error { padding: 14px 18px; border: 1px solid var(--loss); color: var(--loss); font-size: 11px; }
.spark { display: block; width: 126px; height: 42px; }

.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
.search { display: flex; flex: 1; align-items: center; gap: 8px; max-width: 340px; padding: 8px 10px; border: 1px solid var(--line); background: var(--background); color: var(--muted); }
.search:focus-within { border-color: var(--blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 18%, transparent); }
.search input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--foreground); font-size: 11px; }
.select-label, .filter label { display: flex; align-items: center; gap: 8px; color: var(--muted); font: 9px monospace; }
.select-label select, .compact-select, .filter select { padding: 6px 8px; border: 1px solid var(--line); background: var(--panel-2); color: var(--foreground); font: 10px monospace; }
.toolbar .small { margin-left: auto; }
.filter-count { padding: 1px 5px; border-radius: 10px; background: var(--profit); color: var(--background); }
.badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 6px; border: 1px solid var(--tag); color: var(--muted); font: 9px monospace; letter-spacing: 0.05em; text-transform: uppercase; }
.badge.pass { border-color: color-mix(in srgb, var(--profit) 35%, transparent); background: color-mix(in srgb, var(--profit) 8%, transparent); color: var(--profit); }
.badge.review { border-color: color-mix(in srgb, var(--gold) 35%, transparent); background: color-mix(in srgb, var(--gold) 8%, transparent); color: var(--gold); }
.badge.blocked { border-color: color-mix(in srgb, var(--loss) 35%, transparent); background: color-mix(in srgb, var(--loss) 8%, transparent); color: var(--loss); }
.badge.hold { border-color: color-mix(in srgb, var(--blue) 35%, transparent); background: color-mix(in srgb, var(--blue) 7%, transparent); color: var(--blue); }
.badge.neutral { color: var(--muted); }
.position-range-chart { width: min(360px, 42vw); min-width: 240px; margin-top: 10px; overflow: hidden; border: 1px solid var(--line); background: #171724; }
.position-range-chart svg { display: block; width: 100%; height: auto; }
.range-axis { stroke: var(--muted); stroke-width: 1; opacity: 0.65; }
.range-bars { fill: var(--blue); opacity: 0.95; }
.range-price-line { stroke: var(--foreground); stroke-width: 2; stroke-dasharray: 5 4; }
.range-price-label { fill: #303044; }
.range-price-title, .range-price-value, .range-label { fill: var(--foreground); font-family: monospace; }
.range-price-title { font-size: 10px; opacity: 0.72; }
.range-price-value { font-size: 10px; font-weight: 700; }
.range-label { fill: var(--muted); font-size: 10px; }
.star { padding: 3px; border: 0; background: transparent; color: var(--muted); }
.star:hover, .star.active { color: var(--gold); }
.empty { display: grid; place-items: center; gap: 8px; padding: 42px; border: 1px solid var(--line); background: var(--panel); color: var(--muted); text-align: center; }
.empty b { color: var(--foreground); font-size: 13px; }
.empty span { font-size: 11px; }
.error { margin: 0 0 18px; padding: 12px 14px; border: 1px solid var(--loss); background: color-mix(in srgb, var(--loss) 9%, transparent); color: var(--loss); font-size: 11px; }
.error a { margin-left: 10px; color: var(--foreground); font-weight: 700; }

.agent-banner { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 20px; border: 1px solid color-mix(in srgb, var(--profit) 35%, transparent); background: linear-gradient(90deg, color-mix(in srgb, var(--profit) 8%, transparent), color-mix(in srgb, var(--panel) 80%, transparent)); }
.agent-status { display: flex; align-items: center; gap: 13px; }
.agent-status h2 { margin: 7px 0 5px; font-size: 16px; font-weight: 600; }
.agent-status p { margin: 0; font: 10px monospace; }
.pulse { width: 10px; height: 10px; border: 2px solid var(--loss); border-radius: 50%; }
.pulse.active { border-color: var(--profit); background: var(--profit); box-shadow: 0 0 0 5px color-mix(in srgb, var(--profit) 10%, transparent), 0 0 14px var(--profit); }
.agent-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.stats-grid.portfolio-stats { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.bars { display: flex; align-items: flex-end; gap: 8px; height: 160px; padding: 22px 18px 0; }
.bar { flex: 1; min-width: 5px; background: var(--tag); }
.bar.hot { background: var(--profit); }
.briefing { padding: 0 18px; color: var(--foreground); font-size: 12px; line-height: 1.65; }
.briefing-tags { display: flex; align-items: center; gap: 8px; padding: 8px 18px 18px; }
.briefing-tags .muted { margin-left: auto; }
.reason { max-width: 220px; overflow: hidden; color: var(--muted); text-overflow: ellipsis; }
.compact-select { margin-left: auto; }
.filter { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 16px; padding: 12px 14px; border: 1px solid var(--line); background: var(--panel); }
.filter button { padding: 6px 10px; border: 1px solid var(--profit); background: transparent; color: var(--profit); font: 10px monospace; }
.filter button:hover { background: var(--profit); color: var(--background); }
.pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 14px 0 4px; color: var(--muted); font: 10px monospace; }
.pagination a { padding: 6px 12px; border: 1px solid var(--line); background: var(--panel); color: var(--foreground); }
.pagination a:hover { border-color: var(--profit); color: var(--profit); text-decoration: none; }
.pagination a.disabled { opacity: 0.35; pointer-events: none; }
.chart { margin: 0 0 16px; padding: 12px; border: 1px solid var(--line); background: var(--panel); }
.chart svg text { fill: var(--muted); font-family: monospace; }
.chart-tip { position: fixed; z-index: 999; padding: 6px 9px; border: 1px solid var(--line); background: var(--panel); color: var(--foreground); font: 11px monospace; pointer-events: none; opacity: 0; transition: opacity 0.1s; white-space: nowrap; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35); }
.chart-tip.show { opacity: 1; }
.chart-legend-row { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; color: var(--muted); font-size: 10px; text-transform: uppercase; }
.chart-legend i { display: inline-block; width: 13px; height: 13px; margin-right: 6px; border: 1px solid var(--line); vertical-align: middle; }
.hbar { padding: 14px 16px; }
.hbar-row { display: flex; align-items: center; gap: 10px; margin: 9px 0; }
.hbar-label { flex: 0 0 130px; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.hbar-track { flex: 1; height: 18px; border: 1px solid var(--line); border-radius: 3px; background: var(--background); }
.hbar-bar { display: block; height: 100%; border-radius: 2px; }
.hbar-value { flex: 0 0 90px; color: var(--muted); font: 10px monospace; text-align: right; }
.sub { color: var(--muted); font-size: 10px; }
.trend-cell { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.trend-cell svg { display: block; }
h2 { margin: 26px 0 12px; font-size: 15px; font-weight: 600; }
h2 .sub { margin-left: 8px; font: normal 11px monospace; }
.section-kicker { margin: -10px 0 18px; color: var(--muted); font: 10px monospace; letter-spacing: 0.12em; }

.login-theme { position: fixed; top: 14px; right: 14px; z-index: 9; padding: 7px 10px; border: 1px solid var(--line); border-radius: 3px; background: var(--panel); color: var(--muted); font: 10px monospace; text-transform: uppercase; }
.login-theme:hover { border-color: var(--profit); color: var(--profit); }
.login-layout { min-height: 100vh; display: grid; place-items: center; padding: 20px; }
.login-card { width: min(100%, 820px); display: grid; grid-template-columns: 1.1fr 0.9fr; overflow: hidden; border: 1px solid var(--line); background: var(--panel); }
.login-copy { padding: clamp(24px, 6vw, 56px); border-right: 1px solid var(--line); background: var(--profit); color: var(--background); }
.login-copy .eyebrow { color: var(--background); opacity: 0.7; }
.login-copy h1 { margin: 44px 0 16px; font-size: clamp(2.6rem, 8vw, 4.8rem); font-weight: 800; letter-spacing: -0.06em; line-height: 0.85; }
.login-copy p { max-width: 30rem; font-size: 12px; line-height: 1.6; }
.login-form { padding: clamp(24px, 6vw, 56px); }
.login-form h2 { margin: 0 0 22px; font-size: 16px; font-weight: 600; }
.login-form form { display: grid; gap: 12px; }
.login-form label { color: var(--muted); font: 10px monospace; letter-spacing: 0.1em; text-transform: uppercase; }
.login-form input { width: 100%; padding: 13px; border: 1px solid var(--line); border-radius: var(--radius); outline: 0; background: var(--background); color: var(--foreground); font: 11px monospace; }
.login-form input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 25%, transparent); }
.login-form button { padding: 13px; border: 1px solid var(--foreground); border-radius: var(--radius); background: var(--foreground); color: var(--background); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.login-form button:hover { border-color: var(--profit); background: var(--profit); }
.scrim { display: none; }

.page-region > * { animation: rise-in 240ms ease both; }
@keyframes rise-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
	*, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}

@media (max-width: 900px) {
	.sidebar { width: 205px; flex-basis: 205px; }
	.content { padding: 0 18px 35px; }
	.grid-two { grid-template-columns: 1fr; }
	.allocation { min-height: auto; }
	.stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.stats-grid.portfolio-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
	.sidebar { position: fixed; inset: 0 auto 0 0; transform: translateX(-100%); transition: transform 180ms ease; }
	.sidebar.open { transform: translateX(0); }
	.scrim.open { display: block; position: fixed; inset: 0; z-index: 5; border: 0; background: var(--overlay); }
	.close-nav, .mobile-menu { display: grid; place-items: center; }
	.close-nav { margin-left: auto; padding: 2px 5px; }
	.mobile-menu { padding: 0; }
	.content { width: 100%; padding: 0 12px 30px; }
	.position-range-chart { width: min(360px, 80vw); min-width: 220px; }
	.topbar { height: 74px; }
	.topbar h1 { font-size: 16px; }
	.top-actions { gap: 6px; }
	.live small { display: none; }
	.section-head { align-items: flex-start; flex-direction: column; }
	.stat { min-height: 84px; padding: 13px; }
	.stat strong { font-size: 18px; }
	.toolbar { padding: 12px; }
	.search { max-width: none; flex-basis: 100%; }
	.toolbar .small { margin-left: 0; }
	.agent-banner { align-items: flex-start; flex-direction: column; }
	.agent-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.panel-head { padding: 14px; }
	th, td { padding-right: 12px; padding-left: 12px; }
	.hbar-label { flex-basis: 92px; }
	.hbar-value { flex-basis: 72px; }
	.login-card { grid-template-columns: 1fr; }
	.login-copy { border-right: 0; border-bottom: 1px solid var(--line); }
	.login-copy h1 { margin-top: 24px; }
}
`;
