import { Effect } from "effect";
import type {
	ClosedPool,
	OpenPool,
	PortfolioTotal,
	PositionPnLData,
} from "../../domain/index.js";
import { errorMessage } from "../../errors.js";
import { AppConfig } from "../../services/Config.js";
import { Dlmm } from "../../services/Dlmm.js";
import { MeteoraApi } from "../../services/MeteoraApi.js";
import { CHART_COLORS, lineChart } from "../charts.js";
import { errorBanner, escapeHtml, shortAddr } from "../layout.js";
import {
	type PortfolioSnapshot,
	readHistory,
	recordSnapshot,
} from "../portfolio-history.js";
import {
	badge,
	fmtPct,
	fmtSol,
	fmtUsd,
	meteoraUrl,
	pnlClass,
	statsGrid,
	summaryCard,
	table,
	tsLocal,
} from "../templates.js";

export interface PortfolioData {
	readonly total: PortfolioTotal;
	readonly open: readonly OpenPool[];
	readonly closed: readonly ClosedPool[];
}

const EMPTY_TOTAL: PortfolioTotal = {
	totalPnlUsd: "-",
	totalPnlSol: "-",
	totalPnlPctChange: "-",
	totalPnlSolPctChange: "-",
};

export function renderPortfolio(
	data: PortfolioData,
	history: readonly PortfolioSnapshot[] = [],
): string {
	const openBalance = data.open.reduce(
		(sum, pool) => sum + (parseFloat(pool.balances || "0") || 0),
		0,
	);
	const openFees = data.open.reduce(
		(sum, pool) => sum + (parseFloat(pool.unclaimedFees || "0") || 0),
		0,
	);
	const openCount = data.open.reduce(
		(sum, pool) => sum + pool.openPositionCount,
		0,
	);
	const oorPositions = data.open.reduce(
		(sum, pool) => sum + pool.positionsOutOfRange.length,
		0,
	);
	const oorPools = data.open.filter(
		(pool) => pool.outOfRange === true || pool.positionsOutOfRange.length > 0,
	).length;

	const cards = [
		summaryCard(
			"Total equity",
			fmtUsd(openBalance),
			`${data.open.length} open pools`,
		),
		`<div class="stat"><span class="eyebrow">PnL SOL</span><strong class="${pnlClass(parseFloat(data.total.totalPnlSol))}">${fmtSol(data.total.totalPnlSol)}</strong><span class="stat-sub ${pnlClass(parseFloat(data.total.totalPnlSolPctChange))}">${escapeHtml(fmtPct(data.total.totalPnlSolPctChange))}</span></div>`,
		`<div class="stat"><span class="eyebrow">Realized PnL</span><strong class="${pnlClass(parseFloat(data.total.totalPnlUsd))}">${fmtUsd(data.total.totalPnlUsd)}</strong><span class="stat-sub ${pnlClass(parseFloat(data.total.totalPnlPctChange))}">${escapeHtml(fmtPct(data.total.totalPnlPctChange))}</span></div>`,
		summaryCard(
			"Unclaimed fees",
			fmtUsd(openFees),
			`${openCount} active positions`,
		),
		summaryCard(
			"Out of range",
			String(oorPositions),
			`${oorPools} of ${data.open.length} pools`,
		),
	];
	return `<section>
${sectionHead(
	"ACCOUNT EQUITY",
	`Automated DLMM positions · ${data.open.length} pools / ${openCount} positions`,
)}
${statsGrid(cards, "portfolio-stats")}
<div class="grid-two">${equityPanel(history)}${allocationPanel(data.open, openBalance, openFees)}</div>
${renderOpen(data.open)}
${renderClosed(data.closed)}
</section>`;
}

function sectionHead(kicker: string, sub: string): string {
	return `<div class="section-head"><div><p class="kicker">${escapeHtml(kicker)}</p><p class="muted">${escapeHtml(sub)}</p></div></div>`;
}

function equityPanel(history: readonly PortfolioSnapshot[]): string {
	const points = history
		.filter((snap) => snap.pnlSol !== null)
		.slice(-48)
		.map((snap) => ({
			label: tsLocal(snap.ts),
			value: snap.pnlSol as number,
		}));
	if (points.length < 2) {
		return `<div class="panel chart-panel"><div class="panel-head"><div><span class="eyebrow">PNL SOL</span><b>${fmtSol(points.at(-1)?.value)}</b></div><span class="muted small">${points.length} snapshot${points.length === 1 ? "" : "s"}</span></div><div class="empty">No PnL history yet</div></div>`;
	}
	const first = points[0];
	const last = points[points.length - 1];
	const changePct = last.value * 100;
	const stroke = last.value >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss;
	return `<div class="panel chart-panel"><div class="panel-head"><div><span class="eyebrow">PNL SOL</span><b>${fmtSol(last.value)} <em class="${pnlClass(changePct)}">${fmtPct(changePct)}</em></b></div><span class="muted small">Updated ${escapeHtml(last.label)}</span></div>${lineChart(points, { stroke })}<div class="chart-labels"><span>${escapeHtml(first.label)}</span><span>${escapeHtml(last.label)}</span></div></div>`;
}

function allocationPanel(
	open: readonly OpenPool[],
	balanceUsd: number,
	feesUsd: number,
): string {
	const total = balanceUsd + feesUsd;
	const balancePct = total > 0 ? (balanceUsd / total) * 100 : 0;
	const feesPct = total > 0 ? (feesUsd / total) * 100 : 0;
	const ring =
		total > 0
			? `background: conic-gradient(var(--profit) 0 ${balancePct.toFixed(1)}%, var(--gold) ${balancePct.toFixed(1)}% ${(balancePct + feesPct).toFixed(1)}%, var(--legend-muted) ${(balancePct + feesPct).toFixed(1)}% 100%)`
			: "background: var(--legend-muted)";
	const rows = open.map((pool) => {
		const sol = pool.pnlSol != null ? parseFloat(pool.pnlSol) : NaN;
		const value = Number.isNaN(sol) ? null : sol;
		return `<span><b class="pair">${escapeHtml(pool.tokenX ?? "?")}/${escapeHtml(pool.tokenY ?? "?")}</b><em class="${value !== null ? pnlClass(value) : ""}">${value !== null ? fmtSol(value) : "-"}</em></span>`;
	});
	const totalSol = open.reduce((sum, pool) => {
		if (pool.pnlSol == null) return sum;
		const n = parseFloat(pool.pnlSol);
		return Number.isNaN(n) ? sum : sum + n;
	}, 0);
	if (open.length === 0) {
		return `<div class="panel allocation"><div class="panel-head"><span class="eyebrow">OPEN POSITIONS</span><span class="muted small">0 pools</span></div><div class="allocation-ring" style="${ring}"><div><b>${fmtUsd(total)}</b><small>POSITION VALUE</small></div></div><div class="empty">No open positions</div></div>`;
	}
	return `<div class="panel allocation"><div class="panel-head"><span class="eyebrow">OPEN POSITIONS</span><span class="muted small">${open.length} pools</span></div><div class="allocation-ring" style="${ring}"><div><b>${fmtUsd(total)}</b><small>POSITION VALUE</small></div></div><div class="legend"><span><i class="legend-green"></i>Balance<b>${fmtUsd(balanceUsd)}</b></span><span><i class="legend-gold"></i>Unclaimed fees<b>${fmtUsd(feesUsd)}</b></span></div><div class="allocation-list">${rows.join("\n")}</div><div class="allocation-total"><span>TOTAL PNL</span><b class="${pnlClass(totalSol)}">${fmtSol(totalSol)}</b></div></div>`;
}

function renderOpen(pools: readonly OpenPool[]): string {
	if (pools.length === 0) {
		return `<h2>Open Positions <span class="sub">// 0</span></h2><div class="empty">No open positions</div>`;
	}

	const rows = pools.map((pool) => {
		const pair = `${pool.tokenX ?? "?"}/${pool.tokenY ?? "?"}`;
		const avatarText = escapeHtml(
			(pool.tokenX ?? "?").slice(0, 2).toUpperCase(),
		);
		const pnlPct = parseFloat(pool.pnlPctChange);
		const pnlSolPct =
			pool.pnlSolPctChange != null ? parseFloat(pool.pnlSolPctChange) : NaN;
		const range = pool.outOfRange
			? badge("OOR", "blocked")
			: badge("IN RANGE", "pass");
		const rangeChart = positionRangeChart(pool);
		const link = `<a href="${escapeHtml(meteoraUrl(pool.poolAddress))}" target="_blank" rel="noopener">${escapeHtml(pair)}</a>`;
		return `<tr class="portfolio-position-row">
<td><div class="pool-identity"><span class="pool-avatar" aria-hidden="true">${avatarText}</span><span><strong>${link}</strong><span class="sub mono">${escapeHtml(pool.poolAddress.slice(0, 8))}... <span class="copy-mark" aria-hidden="true">&#10697;</span></span></span></div></td>
<td>${escapeHtml(String(pool.binStep))}</td>
<td>${fmtUsd(pool.balances)}</td>
<td>${fmtUsd(pool.unclaimedFees)}</td>
<td class="${pnlClass(pnlPct)}">${fmtUsd(pool.pnl)}<div class="sub">${fmtPct(pnlPct)}</div></td>
<td class="${pnlClass(pnlSolPct)}">${fmtSol(pool.pnlSol)}<div class="sub">${pool.pnlSolPctChange != null ? fmtPct(pnlSolPct) : "-"}</div></td>
<td class="range-status">${range}<div class="sub">${pool.openPositionCount} position${pool.openPositionCount === 1 ? "" : "s"}</div></td>
<td class="visual-range-cell">${rangeChart}</td>
</tr>`;
	});

	return `<h2>Open Positions <span class="sub">// ${pools.length} pools</span></h2>${table(
		[
			"Pool",
			"Bin",
			"Balance",
			"Fees",
			"PnL",
			"PnL SOL",
			"Range",
			"Visual Range",
		],
		rows,
		"portfolio-positions",
	)}`;
}

function positionRangeChart(pool: OpenPool): string {
	const ranges = pool.positionsRange ?? [];
	const prices = ranges.flatMap((position) => [
		Number(position.minPrice),
		Number(position.maxPrice),
	]);
	const min = Math.min(...prices);
	const max = Math.max(...prices);
	const current = pool.poolPrice;
	if (
		ranges.length === 0 ||
		!Number.isFinite(min) ||
		!Number.isFinite(max) ||
		!Number.isFinite(current) ||
		max <= min
	) {
		return "";
	}

	const width = 300;
	const height = 86;
	const baseline = 61;
	const chartMin = min - (max - min) * 0.04;
	const chartMax = max + (max - min) * 0.04;
	const xFor = (price: number) =>
		((price - chartMin) / (chartMax - chartMin)) * width;
	const currentX = Math.max(0, Math.min(width, xFor(current)));
	const barCount = 48;
	const barWidth = width / barCount;
	const bars = Array.from({ length: barCount }, (_, index) => {
		const price = chartMin + ((index + 0.5) / barCount) * (chartMax - chartMin);
		const inRange = ranges.some(
			(position) =>
				price >= Number(position.minPrice) &&
				price <= Number(position.maxPrice),
		);
		if (!inRange) return "";
		const progress = index / (barCount - 1);
		const barHeight = 11 + (1 - progress) * 28;
		const side = price < current ? "left" : "right";
		return `<rect class="range-bar-${side}" x="${(index * barWidth + 1).toFixed(1)}" y="${(baseline - barHeight).toFixed(1)}" width="${Math.max(1, barWidth - 1.25).toFixed(1)}" height="${barHeight.toFixed(1)}" rx="0.8"/>`;
	}).join("");
	const formatPrice = (price: number) =>
		price >= 1 ? price.toFixed(3) : price.toFixed(5);
	const labelX = Math.min(width - 39, Math.max(39, currentX));
	return `<div class="position-range-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Position price range chart"><line class="range-axis" x1="0" y1="${baseline}" x2="${width}" y2="${baseline}"/><g class="range-bars">${bars}</g><line class="range-price-line" x1="${currentX.toFixed(1)}" y1="7" x2="${currentX.toFixed(1)}" y2="${baseline + 3}"/><rect class="range-price-label" x="${(labelX - 39).toFixed(1)}" y="2" width="78" height="22" rx="5"/><text class="range-price-title" x="${labelX.toFixed(1)}" y="11" text-anchor="middle">Pool Price</text><text class="range-price-value" x="${labelX.toFixed(1)}" y="20" text-anchor="middle">${escapeHtml(formatPrice(current))}</text><text class="range-label" x="0" y="78">${escapeHtml(formatPrice(min))}</text><text class="range-label" x="${(width / 2).toFixed(1)}" y="78" text-anchor="middle">${escapeHtml(formatPrice((min + max) / 2))}</text><text class="range-label" x="${width}" y="78" text-anchor="end">${escapeHtml(formatPrice(max))}</text></svg></div>`;
}

function renderClosed(pools: readonly ClosedPool[]): string {
	if (pools.length === 0) {
		return `<h2>Closed Positions <span class="sub">// 0</span></h2><div class="empty">No closed positions</div>`;
	}

	const rows = pools.map((pool) => {
		const pair = `${pool.tokenX ?? "?"}/${pool.tokenY ?? "?"}`;
		const pnlPct = parseFloat(pool.pnlPctChange);
		const pnlSol = parseFloat(pool.pnlSol);
		const detailUrl = `/partials/closed-positions?pool=${encodeURIComponent(pool.poolAddress)}&pair=${encodeURIComponent(pair)}`;
		const chevron = `<button type="button" class="chevron" data-closed-detail="${escapeHtml(detailUrl)}" aria-label="Show closed positions for ${escapeHtml(pair)}">&#9656;</button>`;
		const link = `<a href="${escapeHtml(meteoraUrl(pool.poolAddress))}" target="_blank" rel="noopener">${escapeHtml(pair)}</a>`;
		return `<tr class="closed-row">
<td>${chevron}${link}</td>
<td>${fmtUsd(pool.totalDeposit)}</td>
<td>${fmtUsd(pool.totalWithdrawal)}</td>
<td>${fmtUsd(pool.totalFee)}</td>
<td class="${pnlClass(pnlPct)}">${fmtUsd(pool.pnlUsd)}<div class="sub">${fmtPct(pnlPct)}</div></td>
<td class="${pnlClass(pnlSol)}">${fmtSol(pool.pnlSol)}</td>
<td class="mono">${escapeHtml(tsLocal(pool.lastClosedAt))}</td>
</tr>
<tr class="detail-row" hidden><td colspan="7"><div class="detail-inner"></div></td></tr>`;
	});

	return `<h2>Closed Positions <span class="sub">// ${pools.length} pools</span></h2>${table(
		["Pool", "Deposit", "Withdraw", "Fees", "PnL USD", "PnL SOL", "Closed"],
		rows,
	)}${closedDetailScript()}`;
}

function closedDetailScript(): string {
	return `<script>
(function () {
	if (window.__vexisClosedBound) return;
	window.__vexisClosedBound = true;
	document.addEventListener("click", function (e) {
		var row = e.target && e.target.closest ? e.target.closest("tr.closed-row") : null;
		if (!row) return;
		if (e.target.closest("a")) return;
		var btn = row.querySelector(".chevron");
		var detail = row.nextElementSibling;
		if (!btn || !detail || !detail.classList.contains("detail-row")) return;
		var inner = detail.querySelector(".detail-inner");
		if (detail.classList.contains("loaded")) {
			detail.hidden = !detail.hidden;
			btn.classList.toggle("open");
			return;
		}
		fetch(btn.getAttribute("data-closed-detail"))
			.then(function (res) { return res.text(); })
			.then(function (html) {
				inner.innerHTML = html;
				detail.hidden = false;
				btn.classList.add("open");
				detail.classList.add("loaded");
			});
	});
})();
</script>`;
}

export function renderClosedDetail(
	pair: string,
	positions: readonly PositionPnLData[],
): string {
	const closed = positions.filter((pos) => pos.isClosed);
	if (closed.length === 0) {
		return `<span class="muted">No closed positions</span>`;
	}
	const rows = closed.map((pos) => {
		const pnlPct = parseFloat(pos.pnlPctChange);
		const pnlSol = pos.pnlSol != null ? parseFloat(String(pos.pnlSol)) : NaN;
		const addrLink = `<a href="${escapeHtml(`https://solscan.io/account/${pos.positionAddress}`)}" target="_blank" rel="noopener" class="mono">${escapeHtml(shortAddr(pos.positionAddress))}</a>`;
		return `<tr>
<td>${addrLink}</td>
<td>${fmtUsd(pos.allTimeDeposits.total.usd)}</td>
<td>${fmtUsd(pos.allTimeWithdrawals.total.usd)}</td>
<td>${fmtUsd(pos.allTimeFees.total.usd)}</td>
<td class="${pnlClass(pnlPct)}">${fmtUsd(pos.pnlUsd)}<div class="sub">${fmtPct(pnlPct)}</div></td>
<td class="${pnlClass(pnlSol)}">${fmtSol(pos.pnlSol)}</td>
<td class="mono">${escapeHtml(tsLocal(pos.closedAt))}</td>
</tr>`;
	});
	return `<span class="detail-head">CLOSED POSITIONS // ${escapeHtml(pair)}</span>${table(
		["Position", "Deposit", "Withdraw", "Fees", "PnL USD", "PnL SOL", "Closed"],
		rows,
		"detail-table",
	)}`;
}

export const closedPositionsContent = (
	pool: string,
	pair: string,
): Effect.Effect<string, never, AppConfig | MeteoraApi> =>
	Effect.gen(function* () {
		if (!pool) return "";
		const config = yield* AppConfig;
		const wallet = yield* config.wallet();
		const api = yield* MeteoraApi;
		const res = yield* api
			.positionPnl(pool, wallet, "closed", 1, 100)
			.pipe(Effect.catchAll(() => Effect.succeed(null)));
		if (res === null) {
			return `<div class="detail-error">Failed to load closed positions</div>`;
		}
		return renderClosedDetail(pair, res.positions);
	}).pipe(
		Effect.catchAll((error) =>
			Effect.succeed(errorBanner(errorMessage(error))),
		),
	);

export const portfolioContent: Effect.Effect<
	string,
	never,
	AppConfig | MeteoraApi | Dlmm
> = Effect.gen(function* () {
	const config = yield* AppConfig;
	const wallet = yield* config.wallet();
	const api = yield* MeteoraApi;
	const dlmm = yield* Dlmm;

	const open = yield* api.openPortfolio(wallet, 1, 10).pipe(
		Effect.flatMap((response) =>
			api.enrichOpenPortfolioPnl(response.pools, wallet, {
				withRanges: true,
			}),
		),
		Effect.flatMap((enriched) => dlmm.attachLivePositions(enriched, wallet)),
		Effect.catchAll(() => Effect.succeed([] as OpenPool[])),
	);

	const closed = yield* api.closedPortfolio(wallet, 1, 10).pipe(
		Effect.map((response) => response.pools),
		Effect.catchAll(() => Effect.succeed([] as ClosedPool[])),
	);

	const total = yield* api
		.totalPnl(wallet)
		.pipe(Effect.catchAll(() => Effect.succeed(EMPTY_TOTAL)));

	const openBalance = open.reduce(
		(sum, pool) => sum + parseFloat(pool.balances || "0"),
		0,
	);
	const openFees = open.reduce(
		(sum, pool) => sum + parseFloat(pool.unclaimedFees || "0"),
		0,
	);
	const unrealizedUsd = open.reduce((sum, pool) => {
		const n = parseFloat(pool.pnl);
		return Number.isNaN(n) ? sum : sum + n;
	}, 0);
	const unrealizedSol = open.reduce((sum, pool) => {
		if (pool.pnlSol == null) return sum;
		const n = parseFloat(pool.pnlSol);
		return Number.isNaN(n) ? sum : sum + n;
	}, 0);
	yield* Effect.sync(() =>
		recordSnapshot({
			ts: Math.floor(Date.now() / 1000),
			pnlUsd: unrealizedUsd,
			pnlSol: unrealizedSol,
			balanceUsd: openBalance,
			feesUsd: openFees,
		}),
	).pipe(Effect.catchAll(() => Effect.succeed(null)));

	return renderPortfolio({ total, open, closed }, readHistory());
}).pipe(
	Effect.catchAll((error) => Effect.succeed(errorBanner(errorMessage(error)))),
);
