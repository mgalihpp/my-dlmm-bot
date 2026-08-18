export type Currency = "usd" | "sol";

export const CURRENCY_STORAGE_KEY = "vexis-currency";

type StorageAdapter = Pick<Storage, "getItem" | "setItem">;

export function readStoredCurrency(storage: StorageAdapter): Currency | null {
	const value = storage.getItem(CURRENCY_STORAGE_KEY);
	return value === "usd" || value === "sol" ? value : null;
}

export function writeStoredCurrency(
	storage: StorageAdapter,
	currency: Currency,
): void {
	storage.setItem(CURRENCY_STORAGE_KEY, currency);
}

export function resolveCurrency(
	urlCurrency: string | null,
	storedCurrency: string | null,
): Currency {
	if (urlCurrency === "sol" || urlCurrency === "usd") return urlCurrency;
	return storedCurrency === "sol" ? "sol" : "usd";
}
