import type { ClosedPool } from "@vexis/domain/portfolio.js";
import type { PositionPnLData } from "@vexis/domain/position.js";

export interface CumulativePoint {
	readonly ts: number;
	readonly label: string;
	readonly cumPnl: number;
	readonly cumFees: number;
}

function toNum(s: string | undefined | null | number): number {
	const n = Number(s);
	return Number.isFinite(n) ? n : 0;
}

export function buildCumulative(
	closed: readonly ClosedPool[],
	currency: "sol" | "usd",
): CumulativePoint[] {
	const sorted = [...closed].sort(
		(a, b) => (a.lastClosedAt ?? 0) - (b.lastClosedAt ?? 0),
	);
	let cumPnl = 0;
	let cumFees = 0;
	return sorted.map((p) => {
		const pnl = currency === "sol" ? toNum(p.pnlSol) : toNum(p.pnlUsd);
		const fee =
			currency === "sol"
				? toNum((p as { totalFeeSol?: string }).totalFeeSol ?? p.totalFee)
				: toNum(p.totalFee);
		cumPnl += pnl;
		cumFees += fee;
		return {
			ts: p.lastClosedAt ?? 0,
			label: p.lastClosedAt
				? new Date(p.lastClosedAt * 1000).toLocaleDateString()
				: "",
			cumPnl: Math.round(cumPnl * 1e6) / 1e6,
			cumFees: Math.round(cumFees * 1e6) / 1e6,
		};
	});
}

export function buildCumulativeFromPositions(
	positions: readonly PositionPnLData[],
	currency: "sol" | "usd",
): CumulativePoint[] {
	const sorted = [...positions].sort(
		(a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0),
	);
	let cumPnl = 0;
	let cumFees = 0;
	return sorted.map((p) => {
		const pnl =
			currency === "sol"
				? toNum(p.pnlSol as string | number | null | undefined)
				: toNum(p.pnlUsd);
		const fee =
			currency === "sol"
				? toNum(p.allTimeFees.total.sol ?? "0")
				: toNum(p.allTimeFees.total.usd);
		cumPnl += pnl;
		cumFees += fee;
		return {
			ts: p.closedAt ?? 0,
			label: p.closedAt ? new Date(p.closedAt * 1000).toLocaleDateString() : "",
			cumPnl: Math.round(cumPnl * 1e6) / 1e6,
			cumFees: Math.round(cumFees * 1e6) / 1e6,
		};
	});
}
