const BASE58_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidSolanaAddress(value: string): boolean {
	return BASE58_PATTERN.test(value);
}
