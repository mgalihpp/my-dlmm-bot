import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ViewMode } from "~/lib/view-preference";

type ViewModeState = {
	viewModes: Record<string, ViewMode>;
	setViewMode: (key: string, mode: ViewMode) => void;
	getViewMode: (key: string) => ViewMode;
};

export const useViewModeStore = create<ViewModeState>()(
	persist(
		(set, get) => ({
			viewModes: {},
			setViewMode: (key, mode) =>
				set((s) => ({ viewModes: { ...s.viewModes, [key]: mode } })),
			getViewMode: (key) => {
				const stored = get().viewModes[key];
				if (stored) return stored;
				return "table";
			},
		}),
		{
			name: "vexis:view-modes",
			partialize: (s) => ({
				viewModes: s.viewModes,
			}),
		},
	),
);
