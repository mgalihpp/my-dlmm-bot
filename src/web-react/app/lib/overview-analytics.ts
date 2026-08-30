import type { ClosedPool } from "@vexis/domain/portfolio.js";
import { type ResolvedRange, secToLocalDate } from "./date-range.js";

type PortfolioSnapshot = { pnlSol: number | null; pnlUsd: number | null };

export type Currency = "sol" | "usd";

export type PnlRecord = {
	readonly pnlSol: string | number | null | undefined;
	readonly pnlUsd: string | number | null | undefined;
	readonly closedAt: number | null | undefined;
	readonly lastClosedAt?: number | null | undefined;
};

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

function toNum(value: string | number | null | undefined): number | null {
	if (value == null) return null;
	const n =
		typeof value === "number" ? value : Number.parseFloat(value as string);
	return Number.isNaN(n) ? null : n;
}

export function computeOverviewMetricsFromRecords(
	records: readonly PnlRecord[],
	history: readonly PortfolioSnapshot[],
	totalClosed: number,
	totalPnl?: { totalPnlSol: string; totalPnlUsd: string } | null,
	unrealized?: { sol: number; usd: number } | null,
	currency: Currency = "sol",
	resolvedRange?: ResolvedRange | null,
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
	const isBounded = resolvedRange?.kind === "bounded";
	const dailyPnl = isBounded ? new Map<string, number>() : null;

	for (const r of records) {
		const pnlSol = toNum(r.pnlSol as string | null | undefined);
		const pnlUsd = toNum(r.pnlUsd as string | null | undefined);
		const closedAt = r.closedAt ?? r.lastClosedAt ?? null;
		const primary = currency === "sol" ? pnlSol : pnlUsd;

		if (primary !== null) {
			if (primary > 0) {
				wins += 1;
			} else if (primary < 0) {
				losses += 1;
			}
			if (isBounded) {
				if (closedAt != null) {
					const key = secToLocalDate(closedAt);
					if (key !== null) {
						dailyPnl!.set(key, (dailyPnl!.get(key) ?? 0) + primary);
					}
				}
			} else if (closedAt != null && closedAt >= dayStart) {
				if (primary > 0) dayWins += 1;
				else if (primary < 0) dayLosses += 1;
			}
		}
		if (pnlSol !== null) {
			if (pnlSol > 0) grossProfitSol += pnlSol;
			else if (pnlSol < 0) grossLossSol += pnlSol;
		}
		if (pnlUsd !== null) {
			if (pnlUsd > 0) grossProfitUsd += pnlUsd;
			else if (pnlUsd < 0) grossLossUsd += pnlUsd;
		}
	}

	if (isBounded && dailyPnl !== null) {
		for (const sum of dailyPnl.values()) {
			if (sum > 0) dayWins += 1;
			else if (sum < 0) dayLosses += 1;
		}
	}

	const winLossTotal = wins + losses;
	const winPct = winLossTotal > 0 ? (wins / winLossTotal) * 100 : null;
	const dayTotal = dayWins + dayLosses;
	const dayWinPct = dayTotal > 0 ? (dayWins / dayTotal) * 100 : null;

	const isSol = currency === "sol";
	const grossProfitPrimary = isSol ? grossProfitSol : grossProfitUsd;
	const grossLossPrimary = isSol ? grossLossSol : grossLossUsd;
	const profitFactor =
		grossLossPrimary !== 0
			? grossProfitPrimary / Math.abs(grossLossPrimary)
			: null;
	const avgWinSol = wins > 0 ? grossProfitPrimary / wins : null;
	const avgLossSol = losses > 0 ? grossLossPrimary / losses : null;
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

export function computeOverviewMetrics(
	closed: readonly ClosedPool[],
	history: readonly PortfolioSnapshot[],
	totalClosed: number,
	totalPnl?: { totalPnlSol: string; totalPnlUsd: string } | null,
	unrealized?: { sol: number; usd: number } | null,
	currency: Currency = "sol",
	resolvedRange?: ResolvedRange | null,
): OverviewMetrics {
	const records: readonly PnlRecord[] = closed.map((p) => ({
		pnlSol: p.pnlSol,
		pnlUsd: p.pnlUsd,
		closedAt: p.lastClosedAt,
		lastClosedAt: p.lastClosedAt,
	}));
	return computeOverviewMetricsFromRecords(
		records,
		history,
		totalClosed,
		totalPnl,
		unrealized,
		currency,
		resolvedRange,
	);
}
