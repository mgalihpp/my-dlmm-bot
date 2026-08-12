export function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export type PageSection = "portfolio" | "pools" | "agent";

export interface PageShellParams {
	readonly title: string;
	readonly active: PageSection;
	readonly body: string;
}

const NAV: ReadonlyArray<{
	readonly key: PageSection;
	readonly label: string;
	readonly href: string;
}> = [
	{ key: "portfolio", label: "Portfolio", href: "/portfolio" },
	{ key: "pools", label: "Pool Radar", href: "/pools" },
	{ key: "agent", label: "Agent Log", href: "/agent" },
];

export function pageShell(params: PageShellParams): string {
	const links = NAV.map((item) => {
		const active = item.key === params.active;
		return `<a class="nav-link${active ? " active" : ""}" href="${item.href}"${active ? ' aria-current="page"' : ""}>${item.label}</a>`;
	}).join("\n");

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#17181c">
<title>${escapeHtml(params.title)} // VEXIS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://unpkg.com/htmx.org@1.9.12"></script>
<style>
:root {
	--bg: #ffffff;
	--bg-alt: #f6f7f9;
	--card: #ffffff;
	--ink: #17181c;
	--muted: #6b7280;
	--border: #e4e6eb;
	--acid: #c7f36b;
	--coral: #ff725e;
	--blue: #8ba7ff;
	--yellow: #ffd447;
	--table-head: #f3f4f6;
	--pos: #147a33;
	--neg: #c0392b;
	--line: 1px solid var(--border);
	--shadow: 0 1px 3px rgba(16, 24, 40, 0.1);
	--sidebar: #17181c;
	--sidebar-ink: #f4f5f7;
}
@media (prefers-color-scheme: dark) {
	:root {
		--bg: #0e1013;
		--bg-alt: #15181d;
		--card: #15181d;
		--ink: #e7e9ee;
		--muted: #9aa3af;
		--border: #262b33;
		--table-head: #1b1f26;
		--pos: #2ecc71;
		--neg: #ff6b5e;
		--shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
		--sidebar: #101216;
		--sidebar-ink: #e7e9ee;
	}
}

* { box-sizing: border-box; }
html, body { margin: 0; }
body {
	min-height: 100vh;
	background: var(--bg);
	color: var(--ink);
	font-family: "IBM Plex Mono", "Courier New", monospace;
	font-size: 14px;
	line-height: 1.5;
}

a { color: var(--ink); }
a:hover { background: var(--acid); }
button, select, input { font: inherit; }

.sidebar {
	position: fixed;
	inset: 0 auto 0 0;
	z-index: 5;
	display: flex;
	width: 232px;
	flex-direction: column;
	gap: 22px;
	padding: 22px 14px 16px;
	border-right: 1px solid var(--border);
	background: var(--sidebar);
	color: var(--sidebar-ink);
}
.brand {
	display: inline-flex;
	align-items: center;
	gap: 10px;
	color: var(--sidebar-ink);
	font-family: "Archivo Black", Impact, sans-serif;
	font-size: 1.02rem;
	letter-spacing: -0.04em;
	text-decoration: none;
}
.brand:hover { background: transparent; }
.brand-mark {
	display: grid;
	width: 36px;
	height: 36px;
	place-items: center;
	border: 2px solid var(--sidebar-ink);
	background: var(--acid);
	color: var(--ink);
	font-family: "IBM Plex Mono", monospace;
	font-size: 0.75rem;
	font-weight: 700;
}
.brand small {
	display: block;
	margin-top: -2px;
	color: var(--muted);
	font-family: "IBM Plex Mono", monospace;
	font-size: 0.58rem;
	font-weight: 700;
	letter-spacing: 0.12em;
}
.nav-links { display: flex; flex-direction: column; gap: 6px; }
.nav-link {
	display: block;
	padding: 9px 11px;
	border: 1px solid transparent;
	border-radius: 4px;
	color: var(--sidebar-ink);
	font-size: 0.78rem;
	font-weight: 700;
	text-decoration: none;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
.nav-link:hover { border-color: var(--border); background: rgba(255, 255, 255, 0.08); }
.nav-link.active { border-color: var(--acid); background: var(--acid); color: var(--ink); }
.sidebar-footer { display: flex; flex-direction: column; gap: 8px; margin-top: auto; }
.read-only { padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; color: var(--muted); font-size: 0.62rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; text-align: center; }
.logout {
	padding: 8px;
	border: 1px solid var(--coral);
	border-radius: 4px;
	background: transparent;
	color: var(--coral);
	font-size: 0.68rem;
	font-weight: 700;
	letter-spacing: 0.05em;
	text-decoration: none;
	text-transform: uppercase;
	text-align: center;
}
.logout:hover { background: var(--coral); color: var(--ink); }

main { width: min(1200px, calc(100% - 60px)); margin-left: 262px; padding: 34px 0 72px; }
h1, h2, h3 { font-family: "Archivo Black", Impact, sans-serif; line-height: 1.1; letter-spacing: -0.04em; }
h1 { display: inline-block; margin: 0 0 22px; padding: 9px 14px; border: 2px solid var(--ink); border-radius: 4px; background: var(--acid); font-size: clamp(1.6rem, 4vw, 2.6rem); text-transform: uppercase; }
h2 { margin: 30px 0 12px; font-size: 1.15rem; text-transform: uppercase; }
.section-kicker { margin: -10px 0 18px; color: var(--muted); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }

.cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 26px; }
.card { min-height: 122px; padding: 16px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); box-shadow: var(--shadow); }
.card .label { color: var(--muted); font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.card .value { margin-top: 12px; font-family: "Archivo Black", Impact, sans-serif; font-size: clamp(1.3rem, 2.6vw, 1.9rem); letter-spacing: -0.04em; line-height: 1; }
.card .sub { margin-top: 9px; color: var(--muted); font-size: 0.7rem; font-weight: 700; }

.table-shell { overflow-x: auto; border: 1px solid var(--border); border-radius: 6px; background: var(--card); box-shadow: var(--shadow); }
table { width: 100%; min-width: 720px; border-collapse: collapse; }
th, td { padding: 11px 13px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 0.78rem; }
th:last-child, td:last-child { border-right: 0; }
tr:last-child td { border-bottom: 0; }
th { background: var(--table-head); color: var(--ink); font-size: 0.66rem; letter-spacing: 0.08em; text-transform: uppercase; }
tbody tr:nth-child(even) { background: var(--bg-alt); }
tbody tr:hover { background: var(--acid); }
td a { font-weight: 700; }
.mono { font-family: "IBM Plex Mono", "Courier New", monospace; font-size: 0.72rem; }
.sub { color: var(--muted); font-size: 0.7rem; }
.pos { color: var(--pos); font-weight: 700; }
.neg { color: var(--neg); font-weight: 700; }
.zero { color: var(--muted); font-weight: 700; }

.badge { display: inline-block; padding: 3px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.64rem; font-weight: 700; line-height: 1.1; text-transform: uppercase; }
.badge.ok { background: var(--acid); color: var(--ink); border-color: var(--ink); }
.badge.warn { background: var(--yellow); color: var(--ink); border-color: var(--ink); }
.badge.danger { background: var(--coral); color: var(--ink); border-color: var(--ink); }
.badge.neutral { background: var(--bg-alt); }
.empty { margin: 16px 0 26px; padding: 22px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); box-shadow: var(--shadow); font-weight: 700; }
.error { margin: 0 0 22px; padding: 14px 16px; border: 1px solid var(--coral); border-radius: 6px; background: var(--coral); box-shadow: var(--shadow); font-weight: 700; }
.error a { margin-left: 10px; font-weight: 700; }

.filter { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 20px; padding: 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); box-shadow: var(--shadow); }
.filter label { font-weight: 700; text-transform: uppercase; font-size: 0.72rem; }
.filter select, .filter button { min-height: 38px; padding: 7px 10px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--ink); font-weight: 700; }
.filter button { cursor: pointer; border-color: var(--ink); background: var(--ink); color: var(--acid); }
.sparkline-card { display: inline-block; margin: 0 0 20px; padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); box-shadow: var(--shadow); }
svg { display: block; }
.chart { margin: 0 0 24px; padding: 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); box-shadow: var(--shadow); }
.chart svg text { font-family: "IBM Plex Mono", monospace; }
.chart-legend-row { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; font-weight: 700; text-transform: uppercase; font-size: 0.72rem; }
.chart-legend i { display: inline-block; width: 13px; height: 13px; margin-right: 6px; border: 1px solid var(--border); vertical-align: middle; }
.hbar { padding: 14px 16px; }
.hbar-row { display: flex; align-items: center; gap: 10px; margin: 9px 0; }
.hbar-label { flex: 0 0 130px; font-weight: 700; font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hbar-track { flex: 1; border: 1px solid var(--border); border-radius: 3px; height: 18px; background: var(--bg-alt); }
.hbar-bar { display: block; height: 100%; border-radius: 2px; }
.hbar-value { flex: 0 0 90px; text-align: right; font-weight: 700; font-family: "IBM Plex Mono", monospace; }
.pagination { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 14px 0 4px; font-weight: 700; }
.pagination a { padding: 6px 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--card); color: var(--ink); text-decoration: none; }
.pagination a:hover { background: var(--acid); }
.pagination a.disabled { opacity: 0.35; pointer-events: none; }

@media (max-width: 860px) {
	.sidebar {
		position: static;
		width: 100%;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-right: 0;
		border-bottom: 1px solid var(--border);
	}
	.nav-links { order: 3; flex-direction: row; width: 100%; overflow-x: auto; }
	.nav-link { flex: 1; text-align: center; white-space: nowrap; }
	.sidebar-footer { margin-top: 0; flex-direction: row; margin-left: auto; }
	.read-only { display: none; }
	main { width: min(100% - 24px, 680px); margin-left: 0; padding-top: 24px; }
	.cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
	.card { min-height: 108px; }
}
@media (max-width: 480px) {
	.brand { font-size: 0.9rem; }
	.brand-mark { width: 30px; height: 30px; }
	h1 { font-size: 1.5rem; }
	.cards { grid-template-columns: 1fr; }
	.card { min-height: 96px; }
}
</style>
</head>
<body>
<aside class="sidebar">
	<a class="brand" href="/portfolio">
		<span class="brand-mark">VX</span>
		<span>VEXIS<small>/ DLMM OPS</small></span>
	</a>
	<nav class="nav-links" aria-label="Primary navigation">
		${links}
	</nav>
	<div class="sidebar-footer">
		<span class="read-only">READ ONLY</span>
		<a class="logout" href="/logout">Exit</a>
	</div>
</aside>
<main>
${params.body}
</main>
</body>
</html>`;
}

export interface ContentRegionOptions {
	readonly id: string;
	readonly inner: string;
	readonly refreshPath: string | null;
}

export function contentRegion(opts: ContentRegionOptions): string {
	const attrs = opts.refreshPath
		? ` hx-get="${escapeHtml(opts.refreshPath)}" hx-trigger="every 30s" hx-swap="outerHTML"`
		: "";
	return `<div id="${escapeHtml(opts.id)}"${attrs}>${opts.inner}</div>`;
}

export function errorBanner(message: string): string {
	return `<div class="error">${escapeHtml(message)} <a href=".">Retry</a></div>`;
}

export function loginPage(opts: { error?: string | null } = {}): string {
	const error = opts.error
		? `<p class="error">${escapeHtml(opts.error)}</p>`
		: "";
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#17181c">
<title>Login // VEXIS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root { --bg: #ffffff; --card: #ffffff; --ink: #17181c; --muted: #6b7280; --border: #e4e6eb; --acid: #c7f36b; --coral: #ff725e; --blue: #8ba7ff; --line: 1px solid var(--border); --shadow: 0 1px 3px rgba(16, 24, 40, 0.1); }
@media (prefers-color-scheme: dark) {
	:root { --bg: #0e1013; --card: #15181d; --ink: #e7e9ee; --muted: #9aa3af; --border: #262b33; --shadow: 0 1px 3px rgba(0, 0, 0, 0.5); }
}
* { box-sizing: border-box; }
body { min-height: 100vh; display: grid; place-items: center; margin: 0; padding: 20px; background: var(--bg); color: var(--ink); font-family: "IBM Plex Mono", "Courier New", monospace; }
.login-card { width: min(100%, 820px); display: grid; grid-template-columns: 1.1fr 0.9fr; border: 1px solid var(--border); border-radius: 8px; background: var(--card); box-shadow: var(--shadow); overflow: hidden; }
.login-copy { padding: clamp(24px, 6vw, 56px); background: var(--acid); color: var(--ink); border-right: 1px solid var(--border); }
.login-copy .eyebrow { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; }
.login-copy h1 { margin: 44px 0 16px; font-family: "Archivo Black", Impact, sans-serif; font-size: clamp(2.6rem, 8vw, 4.8rem); letter-spacing: -0.08em; line-height: 0.85; }
.login-copy p { max-width: 30rem; font-size: 0.8rem; font-weight: 600; }
.login-form { padding: clamp(24px, 6vw, 56px); }
.login-form h2 { margin: 0 0 22px; font-family: "Archivo Black", Impact, sans-serif; font-size: 1.5rem; letter-spacing: -0.05em; text-transform: uppercase; }
.login-form form { display: grid; gap: 12px; }
.login-form label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
.login-form input { width: 100%; padding: 13px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--ink); outline: none; }
.login-form input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(139, 167, 255, 0.35); }
.login-form button { padding: 13px; border: 1px solid var(--ink); border-radius: 4px; background: var(--ink); color: var(--acid); cursor: pointer; font-weight: 700; text-transform: uppercase; }
.login-form button:hover { background: var(--blue); color: var(--ink); }
.error { margin: 0 0 18px; padding: 12px; border: 1px solid var(--coral); border-radius: 4px; background: var(--coral); font-size: 0.75rem; font-weight: 700; }
@media (max-width: 640px) { .login-card { grid-template-columns: 1fr; } .login-copy { border-right: 0; border-bottom: 1px solid var(--border); } .login-copy h1 { margin-top: 24px; } }
</style>
</head>
<body>
<main class="login-card">
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
</main>
</body>
</html>`;
}
