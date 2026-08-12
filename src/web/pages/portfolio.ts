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
import { lineChart } from "../charts.js";
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
	const totalPnl = parseFloat(data.total.totalPnlUsd);
	const pnlPct = parseFloat(data.total.totalPnlPctChange);

	return `<section>
${sectionHead(
	"ACCOUNT EQUITY",
	`Automated DLMM positions · ${data.open.length} pools / ${openCount} positions`,
)}
${statsGrid(cards)}
<div class="grid-two">${equityPanel(history, totalPnl, pnlPct)}${allocationPanel(openBalance, openFees)}</div>
${renderOpen(data.open)}
${renderClosed(data.closed)}
</section>`;
}

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
	const tone = pnlClass(pnlPct);
	if (points.length < 2) {
		return `<div class="panel chart-panel"><div class="panel-head"><div><span class="eyebrow">EQUITY CURVE</span><b>${fmtUsd(totalPnl)} <em class="${tone}">${fmtPct(pnlPct)}</em></b></div><span class="muted small">${points.length} snapshot${points.length === 1 ? "" : "s"}</span></div><div class="empty">No equity history yet</div></div>`;
	}
	const first = points[0];
	const last = points[points.length - 1];
	return `<div class="panel chart-panel"><div class="panel-head"><div><span class="eyebrow">EQUITY CURVE</span><b>${fmtUsd(last.value)} <em class="${tone}">${fmtPct(pnlPct)}</em></b></div><span class="muted small">Updated ${escapeHtml(last.label)}</span></div>${lineChart(points)}<div class="chart-labels"><span>${escapeHtml(first.label)}</span><span>${escapeHtml(last.label)}</span></div></div>`;
}

function allocationPanel(balanceUsd: number, feesUsd: number): string {
	const total = balanceUsd + feesUsd;
	const balancePct = total > 0 ? (balanceUsd / total) * 100 : 0;
	const feesPct = total > 0 ? (feesUsd / total) * 100 : 0;
	const ring =
		total > 0
			? `background: conic-gradient(var(--profit) 0 ${balancePct.toFixed(1)}%, var(--gold) ${balancePct.toFixed(1)}% ${(balancePct + feesPct).toFixed(1)}%, var(--legend-muted) ${(balancePct + feesPct).toFixed(1)}% 100%)`
			: "background: var(--legend-muted)";
	return `<div class="panel allocation"><div class="panel-head"><span class="eyebrow">ALLOCATION</span><span class="muted small">Position value</span></div><div class="allocation-ring" style="${ring}"><div><b>${fmtUsd(total)}</b><small>POSITION VALUE</small></div></div><div class="legend"><span><i class="legend-green"></i>Balance<b>${fmtUsd(balanceUsd)}</b></span><span><i class="legend-gold"></i>Unclaimed fees<b>${fmtUsd(feesUsd)}</b></span></div></div>`;
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
		const link = `<a href="${escapeHtml(meteoraUrl(pool.poolAddress))}" target="_blank" rel="noopener">${escapeHtml(pair)}</a>`;
		return `<tr>
<td>${link}</td>
<td>${fmtUsd(pool.totalDeposit)}</td>
<td>${fmtUsd(pool.totalWithdrawal)}</td>
<td>${fmtUsd(pool.totalFee)}</td>
<td class="${pnlClass(pnlPct)}">${fmtUsd(pool.pnlUsd)}<div class="sub">${fmtPct(pnlPct)}</div></td>
<td>${fmtSol(pool.pnlSol)}</td>
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

	const toNum = (value: string): number | null => {
		const parsed = parseFloat(value);
		return Number.isNaN(parsed) ? null : parsed;
	};
	const openBalance = open.reduce(
		(sum, pool) => sum + parseFloat(pool.balances || "0"),
		0,
	);
	const openFees = open.reduce(
		(sum, pool) => sum + parseFloat(pool.unclaimedFees || "0"),
		0,
	);
	yield* Effect.sync(() =>
		recordSnapshot({
			ts: Math.floor(Date.now() / 1000),
			pnlUsd: toNum(total.totalPnlUsd),
			pnlSol: toNum(total.totalPnlSol),
			balanceUsd: openBalance,
			feesUsd: openFees,
		}),
	).pipe(Effect.catchAll(() => Effect.succeed(null)));

	return renderPortfolio({ total, open, closed }, readHistory());
}).pipe(
	Effect.catchAll((error) => Effect.succeed(errorBanner(errorMessage(error)))),
);
