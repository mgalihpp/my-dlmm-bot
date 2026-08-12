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
import { errorBanner, escapeHtml } from "../layout.js";
import {
	badge,
	fmtPct,
	fmtSol,
	fmtUsd,
	meteoraUrl,
	pnlClass,
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

export function renderPortfolio(data: PortfolioData): string {
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

	const cards = [
		summaryCard(
			"PnL USD",
			fmtUsd(data.total.totalPnlUsd),
			fmtPct(data.total.totalPnlPctChange),
		),
		summaryCard(
			"PnL SOL",
			fmtSol(data.total.totalPnlSol),
			fmtPct(data.total.totalPnlSolPctChange),
		),
		summaryCard(
			"Open Balance",
			fmtUsd(openBalance),
			`${openCount} active positions`,
		),
		summaryCard(
			"Unclaimed Fees",
			fmtUsd(openFees),
			`${data.closed.length} closed pools`,
		),
	].join("\n");

	return `<section>
<div class="section-kicker">WALLET SNAPSHOT // LIVE READOUT</div>
<h1>Portfolio</h1>
<div class="cards">${cards}</div>
${renderOpen(data.open)}
${renderClosed(data.closed)}
</section>`;
}

function renderOpen(pools: readonly OpenPool[]): string {
	if (pools.length === 0) {
		return `<h2>Open Positions <span class="sub">// 0</span></h2><div class="empty">No open positions</div>`;
	}

	const rows = pools.map((pool) => {
		const pair = `${pool.tokenX ?? "?"}/${pool.tokenY ?? "?"}`;
		const pnlPct = parseFloat(pool.pnlPctChange);
		const range = pool.outOfRange
			? badge("OOR", "danger")
			: badge("IN RANGE", "ok");
		const link = `<a href="${escapeHtml(meteoraUrl(pool.poolAddress))}" target="_blank" rel="noopener">${escapeHtml(pair)}</a>`;
		return `<tr>
<td>${link}<div class="sub mono">${escapeHtml(pool.poolAddress.slice(0, 8))}...</div></td>
<td>${escapeHtml(String(pool.binStep))}</td>
<td>${fmtUsd(pool.balances)}</td>
<td>${fmtUsd(pool.unclaimedFees)}</td>
<td class="${pnlClass(pnlPct)}">${fmtUsd(pool.pnl)}<div class="sub">${fmtPct(pnlPct)}</div></td>
<td>${range}<div class="sub">${pool.openPositionCount} position${pool.openPositionCount === 1 ? "" : "s"}</div></td>
</tr>`;
	});

	return `<h2>Open Positions <span class="sub">// ${pools.length} pools</span></h2>${table(
		["Pool", "Bin", "Balance", "Fees", "PnL", "Range"],
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

	return renderPortfolio({ total, open, closed });
}).pipe(
	Effect.catchAll((error) => Effect.succeed(errorBanner(errorMessage(error)))),
);
