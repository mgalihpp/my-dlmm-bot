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
	{ key: "pools", label: "Pools", href: "/pools" },
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
<meta name="theme-color" content="#c7f36b">
<title>${escapeHtml(params.title)} // VEXIS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<script src="https://unpkg.com/htmx.org@1.9.12"></script>
<style>
:root {
	--paper: #f4efdf;
	--paper-deep: #e8dfc9;
	--ink: #171717;
	--muted: #6d685c;
	--acid: #c7f36b;
	--coral: #ff725e;
	--blue: #8ba7ff;
	--yellow: #ffd447;
	--white: #fffdf5;
	--line: 3px solid var(--ink);
	--shadow: 7px 7px 0 var(--ink);
}

* { box-sizing: border-box; }
html { background: var(--paper); }
body {
	min-height: 100vh;
	margin: 0;
	background-color: var(--paper);
	background-image: radial-gradient(var(--ink) 0.8px, transparent 0.8px);
	background-size: 16px 16px;
	color: var(--ink);
	font-family: "IBM Plex Mono", "Courier New", monospace;
	font-size: 14px;
	line-height: 1.5;
}

body::before {
	position: fixed;
	inset: 0;
	z-index: -1;
	background: var(--paper);
	content: "";
	opacity: 0.87;
}

a { color: var(--ink); text-decoration-thickness: 2px; text-underline-offset: 3px; }
a:hover { background: var(--acid); }
button, select, input { font: inherit; }

.topbar {
	position: sticky;
	top: 0;
	z-index: 5;
	display: flex;
	min-height: 68px;
	align-items: center;
	gap: 18px;
	padding: 12px 24px;
	border-bottom: var(--line);
	background: var(--ink);
	color: var(--white);
}
.brand {
	display: inline-flex;
	align-items: center;
	gap: 10px;
	color: var(--white);
	font-family: "Archivo Black", Impact, sans-serif;
	font-size: 1.08rem;
	letter-spacing: -0.04em;
	text-decoration: none;
}
.brand:hover { background: transparent; }
.brand-mark {
	display: grid;
	width: 38px;
	height: 38px;
	place-items: center;
	border: 3px solid var(--white);
	background: var(--acid);
	color: var(--ink);
	font-family: "IBM Plex Mono", monospace;
	font-size: 0.8rem;
	font-weight: 700;
	letter-spacing: -0.08em;
}
.brand small {
	display: block;
	margin-top: -2px;
	color: var(--acid);
	font-family: "IBM Plex Mono", monospace;
	font-size: 0.58rem;
	font-weight: 700;
	letter-spacing: 0.12em;
}
.nav-links { display: flex; flex-wrap: wrap; gap: 8px; }
.nav-link {
	padding: 7px 10px;
	border: 2px solid var(--white);
	color: var(--white);
	font-size: 0.78rem;
	font-weight: 700;
	text-decoration: none;
	text-transform: uppercase;
}
.nav-link:hover, .nav-link.active { border-color: var(--acid); background: var(--acid); color: var(--ink); }
.topbar-spacer { flex: 1; }
.read-only,
.logout {
	padding: 5px 8px;
	border: 2px solid var(--ink);
	font-size: 0.68rem;
	font-weight: 700;
	letter-spacing: 0.05em;
	text-decoration: none;
	text-transform: uppercase;
}
.read-only { background: var(--yellow); color: var(--ink); }
.logout { border-color: var(--white); color: var(--white); }
.logout:hover { background: var(--coral); color: var(--ink); }

main { width: min(1280px, calc(100% - 40px)); margin: 0 auto; padding: 38px 0 72px; }
h1, h2, h3 { font-family: "Archivo Black", Impact, sans-serif; line-height: 1.05; letter-spacing: -0.045em; }
h1 { display: inline-block; margin: 0 0 26px; padding: 8px 12px 9px; border: var(--line); background: var(--acid); box-shadow: var(--shadow); font-size: clamp(1.8rem, 5vw, 3rem); text-transform: uppercase; }
h2 { margin: 34px 0 14px; font-size: 1.25rem; text-transform: uppercase; }
.section-kicker { margin: -14px 0 20px; color: var(--muted); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }

.cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 28px; }
.card {
	min-height: 132px;
	padding: 16px;
	border: var(--line);
	background: var(--white);
	box-shadow: var(--shadow);
}
.card:nth-child(2n) { background: var(--blue); }
.card:nth-child(3n) { background: var(--yellow); }
.card .label { color: var(--ink); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.card .value { margin-top: 13px; font-family: "Archivo Black", Impact, sans-serif; font-size: clamp(1.35rem, 3vw, 2rem); letter-spacing: -0.05em; line-height: 1; }
.card .sub { margin-top: 10px; color: var(--ink); font-size: 0.72rem; font-weight: 700; }

.table-shell { overflow-x: auto; border: var(--line); background: var(--white); box-shadow: var(--shadow); }
table { width: 100%; min-width: 720px; border-collapse: collapse; }
th, td { padding: 12px 13px; border-right: 2px solid var(--ink); border-bottom: 2px solid var(--ink); text-align: left; vertical-align: top; font-size: 0.78rem; }
th:last-child, td:last-child { border-right: 0; }
tr:last-child td { border-bottom: 0; }
th { background: var(--ink); color: var(--acid); font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; }
tbody tr:nth-child(even) { background: var(--paper-deep); }
tbody tr:hover { background: var(--acid); }
td a { font-weight: 700; }
.mono { font-family: "IBM Plex Mono", "Courier New", monospace; font-size: 0.72rem; }
.sub { color: var(--muted); font-size: 0.7rem; }
.pos { color: #147a33; font-weight: 700; }
.neg { color: #b72e20; font-weight: 700; }
.zero { color: var(--muted); font-weight: 700; }

.badge { display: inline-block; padding: 3px 7px; border: 2px solid var(--ink); box-shadow: 3px 3px 0 var(--ink); font-size: 0.66rem; font-weight: 700; line-height: 1.1; text-transform: uppercase; }
.badge.ok { background: var(--acid); }
.badge.warn { background: var(--yellow); }
.badge.danger { background: var(--coral); }
.badge.neutral { background: var(--white); }
.empty { margin: 16px 0 26px; padding: 22px; border: var(--line); background: var(--white); box-shadow: var(--shadow); font-weight: 700; }
.error { margin: 0 0 22px; padding: 14px 16px; border: var(--line); background: var(--coral); box-shadow: var(--shadow); font-weight: 700; }
.error a { margin-left: 10px; font-weight: 700; }

.filter {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	margin-bottom: 20px;
	padding: 12px;
	border: var(--line);
	background: var(--white);
	box-shadow: var(--shadow);
}
.filter label { font-weight: 700; text-transform: uppercase; }
.filter select, .filter button {
	min-height: 40px;
	padding: 7px 10px;
	border: var(--line);
	background: var(--yellow);
	color: var(--ink);
	font-weight: 700;
}
.filter button { cursor: pointer; background: var(--ink); color: var(--acid); }
.filter button:hover { transform: translate(-2px, -2px); box-shadow: 4px 4px 0 var(--coral); }
.sparkline-card { display: inline-block; margin: 0 0 20px; padding: 10px; border: var(--line); background: var(--blue); box-shadow: var(--shadow); }
svg { display: block; }

@media (max-width: 860px) {
	.topbar { flex-wrap: wrap; gap: 10px; padding: 10px 14px; }
	.topbar-spacer { display: none; }
	.nav-links { order: 3; width: 100%; }
	.read-only { margin-left: auto; }
	main { width: min(100% - 24px, 680px); padding-top: 28px; }
	.cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
	.card { min-height: 116px; box-shadow: 5px 5px 0 var(--ink); }
}
@media (max-width: 480px) {
	.brand { font-size: 0.95rem; }
	.brand-mark { width: 32px; height: 32px; }
	.logout { display: none; }
	h1 { box-shadow: 5px 5px 0 var(--ink); font-size: 1.7rem; }
	.cards { grid-template-columns: 1fr; }
	.card { min-height: 104px; }
	.table-shell { box-shadow: 5px 5px 0 var(--ink); }
}
</style>
</head>
<body>
<header class="topbar">
	<a class="brand" href="/portfolio">
		<span class="brand-mark">VX</span>
		<span>VEXIS<small>/ DLMM OPS</small></span>
	</a>
	<nav class="nav-links" aria-label="Primary navigation">
		${links}
	</nav>
	<span class="topbar-spacer"></span>
	<span class="read-only">READ ONLY</span>
	<a class="logout" href="/logout">Exit</a>
</header>
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
<meta name="theme-color" content="#c7f36b">
<title>Login // VEXIS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root { --paper: #f4efdf; --ink: #171717; --acid: #c7f36b; --coral: #ff725e; --blue: #8ba7ff; --white: #fffdf5; --line: 3px solid var(--ink); --shadow: 8px 8px 0 var(--ink); }
* { box-sizing: border-box; }
body { min-height: 100vh; display: grid; place-items: center; margin: 0; padding: 20px; background-color: var(--paper); background-image: radial-gradient(var(--ink) 0.8px, transparent 0.8px); background-size: 16px 16px; color: var(--ink); font-family: "IBM Plex Mono", "Courier New", monospace; }
.login-card { width: min(100%, 820px); display: grid; grid-template-columns: 1.1fr 0.9fr; border: var(--line); background: var(--white); box-shadow: var(--shadow); }
.login-copy { padding: clamp(24px, 6vw, 58px); background: var(--acid); border-right: var(--line); }
.login-copy .eyebrow { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; }
.login-copy h1 { margin: 48px 0 16px; font-family: "Archivo Black", Impact, sans-serif; font-size: clamp(2.7rem, 8vw, 5rem); letter-spacing: -0.08em; line-height: 0.85; }
.login-copy p { max-width: 30rem; font-size: 0.82rem; font-weight: 600; }
.login-form { padding: clamp(24px, 6vw, 58px); }
.login-form h2 { margin: 0 0 24px; font-family: "Archivo Black", Impact, sans-serif; font-size: 1.6rem; letter-spacing: -0.06em; text-transform: uppercase; }
.login-form form { display: grid; gap: 12px; }
.login-form label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; }
.login-form input { width: 100%; padding: 13px; border: var(--line); background: var(--paper); color: var(--ink); outline: none; }
.login-form input:focus { background: var(--blue); box-shadow: 5px 5px 0 var(--ink); }
.login-form button { padding: 13px; border: var(--line); background: var(--ink); color: var(--acid); cursor: pointer; font-weight: 700; text-transform: uppercase; }
.login-form button:hover { transform: translate(-2px, -2px); box-shadow: 5px 5px 0 var(--coral); }
.error { margin: 0 0 18px; padding: 12px; border: var(--line); background: var(--coral); font-size: 0.75rem; font-weight: 700; }
@media (max-width: 640px) { .login-card { grid-template-columns: 1fr; } .login-copy { border-right: 0; border-bottom: var(--line); } .login-copy h1 { margin-top: 28px; } }
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
