import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChartPnlMode = "total" | "fees";
export type ChartTimeframe = "daily" | "weekly" | "monthly";

type ChartPreferenceState = {
	mode: ChartPnlMode;
	timeframe: ChartTimeframe;
	setMode: (mode: ChartPnlMode) => void;
	setTimeframe: (timeframe: ChartTimeframe) => void;
};

export const useChartPreferenceStore = create<ChartPreferenceState>()(
	persist(
		(set) => ({
			mode: "total",
			timeframe: "daily",
			setMode: (mode) => set({ mode }),
			setTimeframe: (timeframe) => set({ timeframe }),
		}),
		{
			name: "vexis:chart-preference",
			skipHydration: true,
			partialize: (s) => ({
				mode: s.mode,
				timeframe: s.timeframe,
			}),
		},
	),
);
