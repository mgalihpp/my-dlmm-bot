import type { ClosedPool } from "../domain/portfolio.js";
import type { PnlCardStats, PnlTimeRange } from "./types.js";

export const PNL_GREEN = "#22c55e";
export const PNL_RED = "#ef4444";
export const PNL_NEUTRAL = "#94a3b8";

export function pnlCardSign(value: string | number | null | undefined): number {
	if (value === null || value === undefined) return 0;
	if (typeof value === "number") {
		if (Number.isNaN(value) || value === 0) return 0;
		return value > 0 ? 1 : -1;
	}
	const raw = value.replace(/[^0-9.\-+]/g, "");
	if (raw === "" || raw === "-" || raw === "+") return 0;
	const n = Number.parseFloat(raw);
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

export function formatSolCompact(
	value: string | number | null | undefined,
): string {
	if (value === null || value === undefined) return "n/a";
	const n =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (Number.isNaN(n)) return String(value);
	const abs = Math.abs(n).toLocaleString("en-US", {
		minimumFractionDigits: 4,
		maximumFractionDigits: 4,
	});
	if (n > 0) return `+${abs} SOL`;
	if (n < 0) return `-${abs} SOL`;
	return `${abs} SOL`;
}

export function formatClosedAgo(lastClosedAt: number | null): string | null {
	if (lastClosedAt === null || lastClosedAt === undefined) return null;
	const now = Date.now();
	const ts = lastClosedAt > 1e12 ? lastClosedAt : lastClosedAt * 1000;
	const diff = now - ts;
	if (diff < 0) return "0M AGO";
	const mins = Math.floor(diff / 60000);
	if (mins < 60) return `${mins}M AGO`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}H AGO`;
	const days = Math.floor(hours / 24);
	return `${days}D AGO`;
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

export function sumSolField(
	pools: readonly ClosedPool[],
	field: "totalFeeSol" | "totalDepositSol" | "totalWithdrawalSol",
	fallback: "totalFee" | "totalDeposit" | "totalWithdrawal",
): string {
	let sum = 0;
	for (const p of pools) {
		const v = p[field] ?? p[fallback];
		const n = Number.parseFloat(v);
		if (!Number.isNaN(n)) sum += n;
	}
	return sum.toLocaleString("en-US", {
		minimumFractionDigits: 4,
		maximumFractionDigits: 4,
	});
}
export function filterByTimeRange(
	pools: readonly ClosedPool[],
	range: PnlTimeRange,
): readonly ClosedPool[] {
	if (range === "allTime") return pools;
	const nowMs = Date.now();
	let windowMs: number;
	switch (range) {
		case "daily":
			windowMs = 24 * 60 * 60 * 1000;
			break;
		case "weekly":
			windowMs = 7 * 24 * 60 * 60 * 1000;
			break;
		case "monthly":
			windowMs = 30 * 24 * 60 * 60 * 1000;
			break;
		case "yearly":
			windowMs = 365 * 24 * 60 * 60 * 1000;
			break;
		default:
			return pools;
	}
	const cutoff = nowMs - windowMs;
	return pools.filter((p) => {
		if (p.lastClosedAt === null || p.lastClosedAt === undefined) return false;
		const ts = p.lastClosedAt > 1e12 ? p.lastClosedAt : p.lastClosedAt * 1000;
		return ts >= cutoff;
	});
}
