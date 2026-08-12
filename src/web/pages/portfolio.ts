import { Effect } from "effect";
import type {
	ClosedPool,
	OpenPool,
	PortfolioTotal,
} from "../../domain/index.js";
import { errorMessage } from "../../errors.js";
import { AppConfig } from "../../services/Config.js";
import { Dlmm } from "../../services/Dlmm.js";
import { MeteoraApi } from "../../services/MeteoraApi.js";
import { CHART_COLORS, lineChart } from "../charts.js";
import { errorBanner, escapeHtml } from "../layout.js";
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
	const changePct =
		first.value !== 0 ? ((last.value - first.value) / first.value) * 100 : 0;
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
		const pnlPct = parseFloat(pool.pnlPctChange);
		const pnlSolPct =
			pool.pnlSolPctChange != null ? parseFloat(pool.pnlSolPctChange) : NaN;
		const range = pool.outOfRange
			? badge("OOR", "blocked")
			: badge("IN RANGE", "pass");
		const link = `<a href="${escapeHtml(meteoraUrl(pool.poolAddress))}" target="_blank" rel="noopener">${escapeHtml(pair)}</a>`;
		return `<tr>
<td>${link}<div class="sub mono">${escapeHtml(pool.poolAddress.slice(0, 8))}...</div></td>
<td>${escapeHtml(String(pool.binStep))}</td>
<td>${fmtUsd(pool.balances)}</td>
<td>${fmtUsd(pool.unclaimedFees)}</td>
<td class="${pnlClass(pnlPct)}">${fmtUsd(pool.pnl)}<div class="sub">${fmtPct(pnlPct)}</div></td>
<td class="${pnlClass(pnlSolPct)}">${fmtSol(pool.pnlSol)}<div class="sub">${pool.pnlSolPctChange != null ? fmtPct(pnlSolPct) : "-"}</div></td>
<td>${range}<div class="sub">${pool.openPositionCount} position${pool.openPositionCount === 1 ? "" : "s"}</div></td>
</tr>`;
	});

	return `<h2>Open Positions <span class="sub">// ${pools.length} pools</span></h2>${table(
		["Pool", "Bin", "Balance", "Fees", "PnL", "PnL SOL", "Range"],
		rows,
	)}`;
}

function renderClosed(pools: readonly ClosedPool[]): string {
	if (pools.length === 0) {
		return `<h2>Closed Positions <span class="sub">// 0</span></h2><div class="empty">No closed positions</div>`;
	}

	const rows = pools.map((pool) => {
		const pair = `${pool.tokenX ?? "?"}/${pool.tokenY ?? "?"}`;
		const pnlPct = parseFloat(pool.pnlPctChange);
		const pnlSol = parseFloat(pool.pnlSol);
		const link = `<a href="${escapeHtml(meteoraUrl(pool.poolAddress))}" target="_blank" rel="noopener">${escapeHtml(pair)}</a>`;
		return `<tr>
<td>${link}</td>
<td>${fmtUsd(pool.totalDeposit)}</td>
<td>${fmtUsd(pool.totalWithdrawal)}</td>
<td>${fmtUsd(pool.totalFee)}</td>
<td class="${pnlClass(pnlPct)}">${fmtUsd(pool.pnlUsd)}<div class="sub">${fmtPct(pnlPct)}</div></td>
<td class="${pnlClass(pnlSol)}">${fmtSol(pool.pnlSol)}</td>
<td class="mono">${escapeHtml(tsLocal(pool.lastClosedAt))}</td>
</tr>`;
	});

	return `<h2>Closed Positions <span class="sub">// ${pools.length} pools</span></h2>${table(
		["Pool", "Deposit", "Withdraw", "Fees", "PnL USD", "PnL SOL", "Closed"],
		rows,
	)}`;
}

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
