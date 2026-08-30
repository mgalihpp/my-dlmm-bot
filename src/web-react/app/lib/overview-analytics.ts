import type { ClosedPool } from "@vexis/domain/portfolio.js";

type PortfolioSnapshot = { pnlSol: number | null; pnlUsd: number | null };

export interface OverviewMetrics {
	readonly netPnlSol: number | null;
	readonly netPnlUsd: number | null;
	readonly totalClosed: number;
	readonly wins: number;
	readonly losses: number;
	readonly winPct: number | null;
	readonly grossProfitSol: number;
	readonly grossLossSol: number;
	readonly grossProfitUsd: number;
	readonly grossLossUsd: number;
	readonly profitFactor: number | null;
	readonly avgWinSol: number | null;
	readonly avgLossSol: number | null;
	readonly avgRatio: number | null;
	readonly dayWins: number;
	readonly dayLosses: number;
	readonly dayWinPct: number | null;
}

function toNum(value: string | null | undefined): number | null {
	if (value == null) return null;
	const n = Number.parseFloat(value);
	return Number.isNaN(n) ? null : n;
}

export function computeOverviewMetrics(
	closed: readonly ClosedPool[],
	history: readonly PortfolioSnapshot[],
	totalClosed: number,
	totalPnl?: { totalPnlSol: string; totalPnlUsd: string } | null,
	unrealized?: { sol: number; usd: number } | null,
): OverviewMetrics {
	let wins = 0;
	let losses = 0;
	let grossProfitSol = 0;
	let grossLossSol = 0;
	let grossProfitUsd = 0;
	let grossLossUsd = 0;

	let dayWins = 0;
	let dayLosses = 0;
	const nowSec = Math.floor(Date.now() / 1000);
	const dayStart = nowSec - 86400;

	for (const pool of closed) {
		const pnlSol = toNum(pool.pnlSol);
		const pnlUsd = toNum(pool.pnlUsd);
		if (pnlSol !== null) {
			if (pnlSol > 0) {
				wins += 1;
				grossProfitSol += pnlSol;
			} else if (pnlSol < 0) {
				losses += 1;
				grossLossSol += pnlSol;
			}
			if (pool.lastClosedAt != null && pool.lastClosedAt >= dayStart) {
				if (pnlSol > 0) dayWins += 1;
				else if (pnlSol < 0) dayLosses += 1;
			}
		}
		if (pnlUsd !== null) {
			if (pnlUsd > 0) grossProfitUsd += pnlUsd;
			else if (pnlUsd < 0) grossLossUsd += pnlUsd;
		}
	}

	const winLossTotal = wins + losses;
	const winPct = winLossTotal > 0 ? (wins / winLossTotal) * 100 : null;
	const dayTotal = dayWins + dayLosses;
	const dayWinPct = dayTotal > 0 ? (dayWins / dayTotal) * 100 : winPct;

	const profitFactor =
		grossLossSol !== 0 ? grossProfitSol / Math.abs(grossLossSol) : null;
	const avgWinSol = wins > 0 ? grossProfitSol / wins : null;
	const avgLossSol = losses > 0 ? grossLossSol / losses : null;
	const avgRatio =
		avgWinSol !== null && avgLossSol !== null && avgLossSol !== 0
			? avgWinSol / Math.abs(avgLossSol)
			: null;
	const last = history.at(-1);
	const baseSol = last?.pnlSol ?? toNum(totalPnl?.totalPnlSol);
	const baseUsd = last?.pnlUsd ?? toNum(totalPnl?.totalPnlUsd);
	const realizedSol = grossProfitSol + grossLossSol;
	const realizedUsd = grossProfitUsd + grossLossUsd;
	const withUnrealizedSol =
		unrealized != null
			? realizedSol + unrealized.sol
			: (baseSol ?? realizedSol);
	const withUnrealizedUsd =
		unrealized != null
			? realizedUsd + unrealized.usd
			: (baseUsd ?? realizedUsd);
	const netPnlSol = withUnrealizedSol ?? null;
	const netPnlUsd = withUnrealizedUsd ?? null;

	return {
		netPnlSol,
		netPnlUsd,
		totalClosed,
		wins,
		losses,
		winPct,
		grossProfitSol,
		grossLossSol,
		grossProfitUsd,
		grossLossUsd,
		profitFactor,
		avgWinSol,
		avgLossSol,
		avgRatio,
		dayWins,
		dayLosses,
		dayWinPct,
	};
}
