import { themeCss } from "./theme.js";

export function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function shortAddr(value: string): string {
	if (value.length <= 12) return value;
	return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function rpcHost(url: string): string {
	return url.replace(/^https?:\/\//, "").split("/")[0] || url;
}

export type PageSection = "portfolio" | "pools" | "agent";

export interface PageShellParams {
	readonly title: string;
	readonly active: PageSection;
	readonly body: string;
	readonly rpc: string;
	readonly wallet: string;
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

const VEXIS_LOGO_SRC = "/images/logo.png";

function logoMark(className: string): string {
	return `<span class="logo-crop ${className}" aria-hidden="true"><img src="${VEXIS_LOGO_SRC}" alt=""></span>`;
}

export function pageShell(params: PageShellParams): string {
	const links = NAV.map((item) => {
		const active = item.key === params.active;
		return `<a class="nav-item${active ? " active" : ""}" href="${item.href}"${active ? ' aria-current="page"' : ""}>${item.label}</a>`;
	}).join("\n");
	const updated = new Date().toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b0e14">
<title>${escapeHtml(params.title)} // VEXIS</title>
<script src="https://unpkg.com/htmx.org@1.9.12"></script>
<style>${themeCss}</style>
</head>
<body>
<main class="terminal">
	<aside class="sidebar" id="primary-navigation">
		<div class="brand">
			<a class="brand-link" href="/portfolio">${logoMark("brand-mark")}<span><b>VEXIS</b><small>SOLANA LIQUIDITY OPS</small></span></a>
			<button class="close-nav" type="button" aria-label="Close navigation" onclick="closeNav()">&#10005;</button>
		</div>
		<div class="workspace"><span class="dot green"></span>MAINNET<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></div>
		<nav aria-label="Primary navigation">${links}</nav>
		<div class="sidebar-bottom">
			<div class="rpc"><span class="dot green"></span><span><b>RPC CONNECTED</b><small title="${escapeHtml(params.rpc)}">${escapeHtml(params.rpc)}</small></span></div>
			<div class="wallet"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg><span class="addr" title="${escapeHtml(params.wallet)}">${escapeHtml(shortAddr(params.wallet))}</span></div>
			<div class="sidebar-actions"><span class="read-only">READ ONLY</span><a class="logout" href="/logout">Exit</a></div>
		</div>
	</aside>
	<button class="scrim" type="button" aria-label="Close navigation" onclick="closeNav()"></button>
	<section class="content">
		<header class="topbar">
			<button class="mobile-menu" type="button" aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded="false" onclick="openNav()">&#9776;</button>
			<div><span class="eyebrow">VEXIS / ${escapeHtml(params.title.toUpperCase())}</span><h1>${escapeHtml(params.title)}</h1></div>
			<div class="top-actions">
				<div class="live"><span class="dot green"></span>LIVE<small>Updated ${updated}</small></div>
				<button class="icon-button" type="button" aria-label="Refresh dashboard" title="Refresh dashboard" onclick="window.location.reload()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4"/></svg></button>
				<button class="theme-toggle" type="button" aria-label="Toggle color theme" title="Toggle color theme" onclick="toggleTheme()"><svg class="icon-sun" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg><svg class="icon-moon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>
				<span class="avatar" aria-label="Vexis account">VX</span>
			</div>
		</header>
		<div class="page-stack">${params.body}</div>
	</section>
</main>
<script>
(function () {
	var root = document.documentElement;
	var menu = document.querySelector('.mobile-menu');
	var scrim = document.querySelector('.scrim');
	if (localStorage.getItem('vexis-theme') === 'light') root.setAttribute('data-theme', 'light');
	window.openNav = function () {
		document.querySelector('.sidebar').classList.add('open');
		scrim.classList.add('open');
		menu.setAttribute('aria-expanded', 'true');
	};
	window.closeNav = function () {
		document.querySelector('.sidebar').classList.remove('open');
		scrim.classList.remove('open');
		menu.setAttribute('aria-expanded', 'false');
	};
	window.toggleTheme = function () {
		var light = root.getAttribute('data-theme') === 'light';
		if (light) root.removeAttribute('data-theme');
		else root.setAttribute('data-theme', 'light');
		localStorage.setItem('vexis-theme', light ? 'dark' : 'light');
	};
	var tip = document.createElement('div');
	tip.className = 'chart-tip';
	document.body.appendChild(tip);
	document.addEventListener('mouseover', function (e) {
		var hit = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
		if (hit) {
			tip.textContent = hit.getAttribute('data-tip');
			tip.classList.add('show');
		}
	});
	document.addEventListener('mousemove', function (e) {
		if (tip.classList.contains('show')) {
			tip.style.left = e.pageX + 14 + 'px';
			tip.style.top = e.pageY + 14 + 'px';
		}
	});
	document.addEventListener('mouseout', function (e) {
		var hit = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
		if (hit) tip.classList.remove('show');
	});
})();
</script>
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
	return `<div id="${escapeHtml(opts.id)}" class="page-region"${attrs}>${opts.inner}</div>`;
}

export function errorBanner(message: string): string {
	return `<div class="error">${escapeHtml(message)} <a href=".">Retry</a></div>`;
}

export function loginPage(opts: { error?: string | null } = {}): string {
	const error = opts.error
		? `<p class="login-error">${escapeHtml(opts.error)}</p>`
		: "";
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b0e14">
<title>Login // VEXIS</title>
<style>${themeCss}</style>
</head>
<body>
<button class="login-theme" type="button" aria-label="Toggle color theme" onclick="toggleTheme()"><svg class="icon-sun" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg><svg class="icon-moon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>Theme</button>
<main class="login-layout">
	<div class="login-card">
		<section class="login-copy">
			<div class="login-brand">${logoMark("login-logo-mark")}<span class="login-wordmark"><strong>VEXIS</strong><small>SOLANA LIQUIDITY OPS</small></span></div>
			<h1>Observer access</h1>
			<p>Read-only access to dashboards and on-chain data.</p>
		</section>
		<section class="login-form">
			${error}
			<form method="post" action="/login">
				<label for="password">Dashboard password</label>
				<div class="login-input-wrap">
					<input id="password" type="password" name="password" placeholder="Enter password" autofocus required>
					<svg class="login-lock" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1" fill="currentColor" stroke="none"/></svg>
				</div>
				<button type="submit">Enter dashboard</button>
			</form>
			<p class="login-note"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3 19 6v5c0 4.5-2.7 8-7 10-4.3-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg><span>Read only. No keys. No transactions.</span></p>
		</section>
	</div>
</main>
<script>
(function () {
	var root = document.documentElement;
	if (localStorage.getItem('vexis-theme') === 'light') root.setAttribute('data-theme', 'light');
	window.toggleTheme = function () {
		var light = root.getAttribute('data-theme') === 'light';
		if (light) root.removeAttribute('data-theme');
		else root.setAttribute('data-theme', 'light');
		localStorage.setItem('vexis-theme', light ? 'dark' : 'light');
	};
})();
</script>
</body>
</html>`;
}
