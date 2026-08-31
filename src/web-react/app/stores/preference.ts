import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Currency } from "~/lib/currency";
import type { ViewMode } from "~/lib/view-preference";

type PreferenceState = {
	currency: Currency | null;
	portfolioCurrency: Currency | null;
	poolsCurrency: Currency | null;
	viewModes: Record<string, ViewMode>;
	setCurrency: (key: "portfolio" | "pools", value: Currency) => void;
	setGeneralCurrency: (value: Currency | null) => void;
	setViewMode: (key: string, mode: ViewMode) => void;
	getViewMode: (key: string) => ViewMode;
};

export const usePreferenceStore = create<PreferenceState>()(
	persist(
		(set, get) => ({
			currency: null,
			portfolioCurrency: null,
			poolsCurrency: null,
			viewModes: {},
			setCurrency: (key, value) =>
				set(() => {
					if (key === "portfolio") return { portfolioCurrency: value };
					if (key === "pools") return { poolsCurrency: value };
					return {};
				}),
			setGeneralCurrency: (value) => set({ currency: value }),
			setViewMode: (key, mode) =>
				set((s) => ({ viewModes: { ...s.viewModes, [key]: mode } })),
			getViewMode: (key) => {
				const stored = get().viewModes[key];
				if (stored) return stored;
				return "table";
			},
		}),
		{
			name: "vexis:preference",
			skipHydration: true,
			partialize: (s) => ({
				currency: s.currency,
				portfolioCurrency: s.portfolioCurrency,
				poolsCurrency: s.poolsCurrency,
				viewModes: s.viewModes,
			}),
		},
	),
);
