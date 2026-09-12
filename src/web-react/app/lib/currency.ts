export type Currency = "usd" | "sol" | "idr";

export const CURRENCY_STORAGE_KEY = "vexis-currency";

export const PORTFOLIO_CURRENCY_STORAGE_KEY = "vexis:portfolio:currency";

export const POOLS_CURRENCY_STORAGE_KEY = "vexis:pools:currency";

type StorageAdapter = Pick<Storage, "getItem" | "setItem">;

export function readStoredCurrency(
	storage: StorageAdapter,
	key: string = CURRENCY_STORAGE_KEY,
): Currency | null {
	const value = storage.getItem(key);
	if (value === "usd" || value === "sol" || value === "idr") return value;
	if (key !== CURRENCY_STORAGE_KEY) {
		const legacy = storage.getItem(CURRENCY_STORAGE_KEY);
		if (legacy === "usd" || legacy === "sol" || legacy === "idr") return legacy;
	}
	return null;
}

export function writeStoredCurrency(
	storage: StorageAdapter,
	keyOrCurrency: string,
	currency?: Currency,
): void {
	// Support legacy call: writeStoredCurrency(storage, "sol")
	if (currency === undefined) {
		const maybeCurrency = keyOrCurrency as Currency;
		storage.setItem(CURRENCY_STORAGE_KEY, maybeCurrency);
		return;
	}
	storage.setItem(keyOrCurrency, currency);
}

export function resolveCurrency(
	urlCurrency: string | null,
	storedCurrency: string | null,
): Currency {
	if (urlCurrency === "sol" || urlCurrency === "usd" || urlCurrency === "idr")
		return urlCurrency;
	if (storedCurrency === "sol" || storedCurrency === "idr")
		return storedCurrency;
	return "usd";
}
