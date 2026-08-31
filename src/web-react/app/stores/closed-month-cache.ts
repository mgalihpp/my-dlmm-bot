import type { PositionPnLData } from "@vexis/domain/position.js";
import { create } from "zustand";

export type ClosedMonthEntry = {
	readonly data: readonly PositionPnLData[];
};

export type ClosedMonthState = {
	entries: Record<string, ClosedMonthEntry>;
	setMonths: (
		items: ReadonlyArray<{ key: string; data: readonly PositionPnLData[] }>,
	) => void;
	clear: () => void;
};

export const useClosedMonthStore = create<ClosedMonthState>()((set) => ({
	entries: {},
	setMonths: (items) =>
		set((state) => {
			const next = { ...state.entries };
			let changed = false;
			for (const { key, data } of items) {
				next[key] = { data };
				changed = true;
			}
			return changed ? { entries: next } : state;
		}),
	clear: () => set({ entries: {} }),
}));
