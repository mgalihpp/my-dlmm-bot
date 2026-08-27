import type { ClosedPool } from "../domain/portfolio.js";
import type { PnlCardStats } from "./types.js";

export const PNL_GREEN = "#22c55e";
export const PNL_RED = "#ef4444";
export const PNL_NEUTRAL = "#94a3b8";

export function pnlCardSign(value: string | number | null | undefined): number {
	if (value === null || value === undefined) return 0;
	const n =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (Number.isNaN(n) || n === 0) return 0;
	return n > 0 ? 1 : -1;
}

export function pnlCardColor(
	value: string | number | null | undefined,
): string {
	const s = pnlCardSign(value);
	if (s > 0) return PNL_GREEN;
	if (s < 0) return PNL_RED;
	return PNL_NEUTRAL;
}

export function formatCardUsd(
	value: string | number | null | undefined,
): string {
	if (value === null || value === undefined) return "n/a";
	const n =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (Number.isNaN(n)) return String(value);
	const abs = Math.abs(n).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	if (n > 0) return `+$${abs}`;
	if (n < 0) return `-$${abs}`;
	return `$${abs}`;
}

export function formatCardPct(
	value: string | number | null | undefined,
): string {
	if (value === null || value === undefined) return "n/a";
	const n =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (Number.isNaN(n)) return String(value);
	const sign = n > 0 ? "+" : "";
	return `${sign}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function computeClosedStats(pools: readonly ClosedPool[]): PnlCardStats {
	const totalClosed = pools.length;
	if (totalClosed === 0) {
		return {
			winRate: null,
			totalClosed: 0,
			avgPnlUsd: null,
			bestUsd: null,
			worstUsd: null,
		};
	}
	let wins = 0;
	let sum = 0;
	let best: number | null = null;
	let worst: number | null = null;
	let validCount = 0;

	for (const p of pools) {
		const n = Number.parseFloat(p.pnlUsd);
		if (Number.isNaN(n)) continue;
		validCount += 1;
		sum += n;
		if (n > 0) wins += 1;
		if (best === null || n > best) best = n;
		if (worst === null || n < worst) worst = n;
	}

	if (validCount === 0) {
		return {
			winRate: null,
			totalClosed,
			avgPnlUsd: null,
			bestUsd: null,
			worstUsd: null,
		};
	}

	const winRate = wins / validCount;
	const avg = sum / validCount;

	return {
		winRate,
		totalClosed,
		avgPnlUsd: formatCardUsd(avg),
		bestUsd: best !== null ? formatCardUsd(best) : null,
		worstUsd: worst !== null ? formatCardUsd(worst) : null,
	};
}
