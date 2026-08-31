import type { PositionPnLData } from "@vexis/domain/position.js";
import { create } from "zustand";

export const CURRENT_MONTH_TTL_MS = 5 * 60 * 1000;

export type ClosedMonthEntry = {
	readonly data: readonly PositionPnLData[];
	readonly at: number;
};

export type ClosedMonthState = {
	entries: Record<string, ClosedMonthEntry>;
	setMonths: (
		items: ReadonlyArray<{ key: string; data: readonly PositionPnLData[] }>,
	) => void;
};

function utcMonthKey(timestampMs: number): string {
	const at = new Date(timestampMs);
	return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const useClosedMonthStore = create<ClosedMonthState>()((set) => ({
	entries: {},
	setMonths: (items) =>
		set((state) => {
			const now = Date.now();
			const currentKey = utcMonthKey(now);
			const next = { ...state.entries };
			let changed = false;
			for (const { key, data } of items) {
				const existing = next[key];
				if (existing) {
					if (key !== currentKey) continue;
					if (now - existing.at < CURRENT_MONTH_TTL_MS) continue;
				}
				next[key] = { data, at: now };
				changed = true;
			}
			return changed ? { entries: next } : state;
		}),
}));

export function selectMonthStatus(
	state: ClosedMonthState,
	monthKey: string,
	currentMonthKey: string,
	now: number,
): "fresh" | "stale" | "missing" {
	const entry = state.entries[monthKey];
	if (!entry) return "missing";
	if (monthKey !== currentMonthKey) return "fresh";
	return now - entry.at < CURRENT_MONTH_TTL_MS ? "fresh" : "stale";
}

export function selectMissingChartMonths(
	state: ClosedMonthState,
	chartMonths: readonly string[],
	currentMonthKey: string,
): string {
	const missing = chartMonths.filter(
		(month) => !(month in state.entries) && month !== currentMonthKey,
	);
	return missing.length === 0 ? "" : missing.join(",");
}
