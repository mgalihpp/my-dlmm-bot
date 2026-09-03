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

export interface PnlDelta {
	readonly ts: number;
	readonly delta: number;
}

export interface DailyBucket {
	readonly key: string;
	readonly label: string;
	readonly value: number;
}

export type DailyTimeframe = "daily" | "weekly" | "monthly";
export type PnlMode = "total" | "fees";

export function positionDelta(
	p: Pick<PositionPnLData, "closedAt" | "pnlSol" | "pnlUsd" | "allTimeFees">,
	currency: "sol" | "usd",
	mode: PnlMode,
): PnlDelta | null {
	if (p.closedAt == null) return null;
	const delta =
		mode === "fees"
			? toNum(
					currency === "sol"
						? (p.allTimeFees.total.sol ?? "0")
						: p.allTimeFees.total.usd,
				)
			: toNum(
					currency === "sol"
						? (p.pnlSol as string | number | null | undefined)
						: p.pnlUsd,
				);
	return { ts: p.closedAt, delta };
}

/** Pool-level delta for charts when position detail is not loaded yet. */
export function poolDelta(
	p: Pick<
		ClosedPool,
		"lastClosedAt" | "pnlSol" | "pnlUsd" | "totalFee" | "totalFeeSol"
	>,
	currency: "sol" | "usd",
	mode: PnlMode,
): PnlDelta | null {
	if (p.lastClosedAt == null) return null;
	const delta =
		mode === "fees"
			? toNum(
					currency === "sol"
						? ((p.totalFeeSol ?? p.totalFee) as string | undefined)
						: p.totalFee,
				)
			: toNum(currency === "sol" ? p.pnlSol : p.pnlUsd);
	return { ts: p.lastClosedAt, delta };
}

export function buildDailyBuckets(
	deltas: readonly PnlDelta[],
	timeframe: DailyTimeframe,
): DailyBucket[] {
	if (deltas.length === 0) return [];
	if (timeframe === "daily") {
		let minTs = Number.POSITIVE_INFINITY;
		let maxTs = Number.NEGATIVE_INFINITY;
		for (const d of deltas) {
			if (d.ts < minTs) minTs = d.ts;
			if (d.ts > maxTs) maxTs = d.ts;
		}
		const minDt = new Date(minTs * 1000);
		const maxDt = new Date(maxTs * 1000);
		const startUtc = Date.UTC(
			minDt.getUTCFullYear(),
			minDt.getUTCMonth(),
			minDt.getUTCDate(),
		);
		const endUtc = Date.UTC(
			maxDt.getUTCFullYear(),
			maxDt.getUTCMonth(),
			maxDt.getUTCDate(),
		);
		const spansYears = minDt.getUTCFullYear() !== maxDt.getUTCFullYear();
		const dayBuckets = new Map<string, { label: string; value: number }>();
		for (let t = startUtc; t <= endUtc; t += 86400000) {
			const dt = new Date(t);
			const key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}`;
			const label = dt.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: spansYears ? "2-digit" : undefined,
				timeZone: "UTC",
			});
			dayBuckets.set(key, { label, value: 0 });
		}
		for (const d of deltas) {
			const dt = new Date(d.ts * 1000);
			const key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}`;
			const entry = dayBuckets.get(key);
			if (entry) entry.value += d.delta;
		}
		return [...dayBuckets.entries()].map(([key, e]) => ({
			key,
			label: e.label,
			value: e.value,
		}));
	}
	if (timeframe === "weekly") {
		const map = new Map<string, { label: string; value: number; ts: number }>();
		for (const d of deltas) {
			const dt = new Date(d.ts * 1000);
			const jan1 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
			const week = Math.ceil(
				((dt.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7,
			);
			const key = `${dt.getUTCFullYear()}-W${week}`;
			const entry = map.get(key) ?? {
				label: `W${week}`,
				value: 0,
				ts: d.ts,
			};
			entry.value += d.delta;
			entry.ts = d.ts;
			map.set(key, entry);
		}
		return [...map.values()]
			.sort((a, b) => a.ts - b.ts)
			.slice(-12)
			.map((e) => ({ key: e.label, label: e.label, value: e.value }));
	}
	const map = new Map<string, { label: string; value: number; ts: number }>();
	for (const d of deltas) {
		const dt = new Date(d.ts * 1000);
		const key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`;
		const ts = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1);
		const label = dt.toLocaleDateString("en-US", {
			month: "short",
			year: "numeric",
			timeZone: "UTC",
		});
		const entry = map.get(key) ?? { label, value: 0, ts };
		entry.value += d.delta;
		map.set(key, entry);
	}
	return [...map.values()]
		.sort((a, b) => a.ts - b.ts)
		.slice(-12)
		.map((e) => ({ key: e.label, label: e.label, value: e.value }));
}
