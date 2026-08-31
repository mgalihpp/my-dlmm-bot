import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Currency } from "~/lib/currency";

type CurrencyState = {
	currency: Currency | null;
	portfolioCurrency: Currency | null;
	poolsCurrency: Currency | null;
	setCurrency: (key: "portfolio" | "pools", value: Currency) => void;
	setGeneralCurrency: (value: Currency | null) => void;
};

export const useCurrencyStore = create<CurrencyState>()(
	persist(
		(set) => ({
			currency: null,
			portfolioCurrency: null,
			poolsCurrency: null,
			setCurrency: (key, value) =>
				set(() => {
					if (key === "portfolio") return { portfolioCurrency: value };
					if (key === "pools") return { poolsCurrency: value };
					return {};
				}),
			setGeneralCurrency: (value) => set({ currency: value }),
		}),
		{
			name: "vexis:currency",
			partialize: (s) => ({
				currency: s.currency,
				portfolioCurrency: s.portfolioCurrency,
				poolsCurrency: s.poolsCurrency,
			}),
		},
	),
);
