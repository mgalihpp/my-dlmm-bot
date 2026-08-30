import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router";
import type { Currency } from "~/lib/currency";
import {
	POOLS_CURRENCY_STORAGE_KEY,
	PORTFOLIO_CURRENCY_STORAGE_KEY,
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "~/lib/currency";
import { usePreferenceStore } from "~/stores/preference";

type CurrencyScope = "portfolio" | "pools";

const KEY_MAP: Record<CurrencyScope, string> = {
	portfolio: PORTFOLIO_CURRENCY_STORAGE_KEY,
	pools: POOLS_CURRENCY_STORAGE_KEY,
};

export function useStoredCurrency(scope: CurrencyScope) {
	const [searchParams, setSearchParams] = useSearchParams();
	const portfolioCurrency = usePreferenceStore((s) => s.portfolioCurrency);
	const poolsCurrency = usePreferenceStore((s) => s.poolsCurrency);
	const setCurrencyStore = usePreferenceStore((s) => s.setCurrency);

	const stored = scope === "portfolio" ? portfolioCurrency : poolsCurrency;

	useEffect(() => {
		if (stored !== null) return;
		try {
			const fromStorage = readStoredCurrency(localStorage, KEY_MAP[scope]);
			if (fromStorage) setCurrencyStore(scope, fromStorage);
		} catch {}
	}, [scope, stored, setCurrencyStore]);

	useEffect(() => {
		usePreferenceStore.persist.rehydrate();
	}, []);

	const currency = resolveCurrency(searchParams.get("currency"), stored);

	const setCurrency = useCallback(
		(value: Currency) => {
			try {
				writeStoredCurrency(localStorage, KEY_MAP[scope], value);
			} catch {}
			setCurrencyStore(scope, value);
			setSearchParams(
				(current) => {
					const next = new URLSearchParams(current);
					if (value === "usd") next.delete("currency");
					else next.set("currency", value);
					return next;
				},
				{ preventScrollReset: true },
			);
		},
		[scope, setCurrencyStore, setSearchParams],
	);

	return [currency, setCurrency] as const;
}
