export type Currency = "usd" | "sol";

export function resolveCurrency(
	urlCurrency: string | null,
	storedCurrency: string | null,
): Currency {
	if (urlCurrency === "sol" || urlCurrency === "usd") return urlCurrency;
	return storedCurrency === "sol" ? "sol" : "usd";
}
