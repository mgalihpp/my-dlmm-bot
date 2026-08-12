import { describe, expect, it } from "vitest";
import {
	contentRegion,
	errorBanner,
	escapeHtml,
	loginPage,
	pageShell,
	rpcHost,
	shortAddr,
} from "../src/web/layout.js";
import {
	badge,
	fmtPct,
	fmtSol,
	fmtUsd,
	meteoraUrl,
	pnlClass,
	solIcon,
	solscanUrl,
	sparkline,
	statsGrid,
	summaryCard,
	table,
	tsLocal,
} from "../src/web/templates.js";

describe("escapeHtml", () => {
	it("escapes HTML metacharacters", () => {
		expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
			"&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
		);
	});
});

describe("format helpers", () => {
	it("fmtUsd formats numbers and null", () => {
		expect(fmtUsd("1234.5")).toBe("$1,234.50");
		expect(fmtUsd(null)).toBe("-");
		expect(fmtUsd(undefined)).toBe("-");
	});

	it("fmtPct adds sign and dash for null", () => {
		expect(fmtPct(5.5)).toBe("+5.50%");
		expect(fmtPct(-3)).toBe("-3.00%");
		expect(fmtPct(null)).toBe("-");
	});

	it("fmtSol adds SOL icon", () => {
		expect(fmtSol("1.2345")).toBe(`1.235 ${solIcon()}`);
		expect(fmtSol(null)).toBe("-");
	});

	it("pnlClass maps sign to css class", () => {
		expect(pnlClass(1)).toBe("profit");
		expect(pnlClass(-1)).toBe("loss");
		expect(pnlClass(0)).toBe("zero");
	});
});

describe("tsLocal", () => {
	it("formats ISO string and unix seconds human-readable", () => {
		expect(tsLocal(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toMatch(
			/^(just now|\d+m ago|\d+h ago)$/,
		);
		expect(tsLocal(1_754_000_000)).toMatch(
			/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/,
		);
		expect(tsLocal(null)).toBe("-");
	});
});

describe("badge / summaryCard / table", () => {
	it("badge emits kind class", () => {
		expect(badge("OOR", "blocked")).toContain("badge");
		expect(badge("OOR", "blocked")).toContain("blocked");
	});

	it("summaryCard wraps value", () => {
		const card = summaryCard("PnL USD", "$12.34", "+5%");
		expect(card).toContain("PnL USD");
		expect(card).toContain("$12.34");
		expect(card).toContain("+5%");
		expect(card).toContain('class="stat"');
	});

	it("statsGrid groups stat components", () => {
		expect(statsGrid([summaryCard("A", "1", "one")])).toBe(
			'<div class="stats-grid"><div class="stat"><span class="eyebrow">A</span><strong>1</strong><span class="stat-sub">one</span></div></div>',
		);
	});

	it("table builds headers and rows", () => {
		const rendered = table(
			["A", "B"],
			["<tr><td>1</td><td>2</td></tr>"],
			"compact-table",
		);
		expect(rendered).toContain("<th>A</th>");
		expect(rendered).toContain("<td>1</td>");
		expect(rendered).toContain('class="compact-table"');
	});
});

describe("sparkline", () => {
	it("renders svg polyline for 2+ values", () => {
		const rendered = sparkline([1, 3, 2]);
		expect(rendered).toContain("<svg");
		expect(rendered).toContain("<polyline");
	});

	it("returns empty for less than 2 values", () => {
		expect(sparkline([1])).toBe("");
		expect(sparkline([])).toBe("");
	});
});

describe("links", () => {
	it("meteoraUrl and solscanUrl", () => {
		expect(meteoraUrl("abc123")).toBe("https://app.meteora.ag/dlmm/abc123");
		expect(solscanUrl("tx1")).toBe("https://solscan.io/tx/tx1");
	});
});

describe("layout pieces", () => {
	it("contentRegion adds hx attrs only with refreshPath", () => {
		const withRefresh = contentRegion({
			id: "page-content",
			inner: "x",
			refreshPath: "/partials/portfolio",
		});
		expect(withRefresh).toContain('id="page-content"');
		expect(withRefresh).toContain('hx-get="/partials/portfolio"');
		expect(withRefresh).toContain('hx-trigger="every 30s"');
		const withoutRefresh = contentRegion({
			id: "page-content",
			inner: "x",
			refreshPath: null,
		});
		expect(withoutRefresh).not.toContain("hx-get");
	});

	it("errorBanner contains message and retry", () => {
		const rendered = errorBanner("boom");
		expect(rendered).toContain("boom");
		expect(rendered).toContain("Retry");
	});

	it("pageShell includes terminal shell, htmx script, and body", () => {
		const rendered = pageShell({
			title: "Portfolio",
			active: "portfolio",
			body: "<p>hi</p>",
			rpc: "api.mainnet-beta.solana.com",
			wallet: "So11111111111111111111111111111111111111112",
		});
		expect(rendered).toContain("htmx.org");
		expect(rendered).toContain("<title>Portfolio // VEXIS</title>");
		expect(rendered).toContain('href="/portfolio"');
		expect(rendered).toContain("READ ONLY");
		expect(rendered).toContain("terminal");
		expect(rendered).toContain("--profit");
		expect(rendered).toContain("api.mainnet-beta.solana.com");
		expect(rendered).toContain("So11...1112");
		expect(rendered).toContain("scrim");
		expect(rendered).toContain("<p>hi</p>");
	});

	it("shortAddr and rpcHost normalize shell metadata", () => {
		expect(shortAddr("So11111111111111111111111111111111111111112")).toBe(
			"So11...1112",
		);
		expect(shortAddr("short")).toBe("short");
		expect(rpcHost("https://api.mainnet-beta.solana.com/rpc")).toBe(
			"api.mainnet-beta.solana.com",
		);
	});

	it("loginPage has form and escaped error", () => {
		const rendered = loginPage({ error: "bad <pw>" });
		expect(rendered).toContain('name="password"');
		expect(rendered).toContain("bad &lt;pw&gt;");
	});
});
