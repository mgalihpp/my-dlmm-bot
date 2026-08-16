export function formatNum(value: string | number, decimals = 2): string {
	const n = typeof value === "number" ? value : parseFloat(value);
	if (Number.isNaN(n)) return String(value);
	return n.toLocaleString("en-US", {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
}

export function fmtUsd(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "-";
	const n = typeof value === "number" ? value : parseFloat(value);
	if (Number.isNaN(n)) return "-";
	return `$${formatNum(n)}`;
}

export function fmtPct(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "-";
	const n = typeof value === "number" ? value : parseFloat(value);
	if (Number.isNaN(n)) return "-";
	const sign = n > 0 ? "+" : "";
	return `${sign}${formatNum(n)}%`;
}

export function fmtSol(value: string | number | null | undefined): string {
	if (value === null || value === undefined) return "-";
	const n = typeof value === "number" ? value : parseFloat(value);
	if (Number.isNaN(n)) return "-";
	const decimals = Math.abs(n) >= 0.001 ? 4 : 8;
	return `${formatNum(n, decimals)} SOL`;
}

export function shortAddr(addr: string, len = 4): string {
	if (!addr || addr.length <= len * 2 + 2) return addr;
	return `${addr.slice(0, len)}…${addr.slice(-len)}`;
}

export function pair(
	x: string | null | undefined,
	y: string | null | undefined,
): string {
	return `${x ?? "?"}/${y ?? "?"}`;
}

export function tsLocal(timestamp: string | number | null | undefined): string {
	if (timestamp === null || timestamp === undefined) return "-";
	const n = typeof timestamp === "number" ? timestamp : Number(timestamp);
	if (Number.isNaN(n)) return "-";
	return new Date(n * 1000).toLocaleString();
}

export function timeAgo(unixSeconds: number | null | undefined): string {
	if (!unixSeconds) return "-";
	const diff = Date.now() / 1000 - unixSeconds;
	if (diff < 0) return "just now";
	const units: [number, string][] = [
		[86400, "d"],
		[3600, "h"],
		[60, "m"],
	];
	for (const [secs, label] of units) {
		if (diff >= secs) return `${Math.floor(diff / secs)}${label} ago`;
	}
	return "just now";
}

export function pnlSign(value: string | number | null | undefined): number {
	if (value === null || value === undefined) return 0;
	const n = typeof value === "number" ? value : parseFloat(value);
	if (Number.isNaN(n)) return 0;
	return n > 0 ? 1 : n < 0 ? -1 : 0;
}

export function pnlClass(value: number): string {
	return value > 0
		? "text-emerald-500"
		: value < 0
			? "text-red-500"
			: "text-muted-foreground";
}

export function meteoraUrl(poolAddress: string): string {
	return `https://app.meteora.ag/dlmm/${poolAddress}`;
}

export function solscanUrl(address: string): string {
	return `https://solscan.io/account/${address}`;
}

export function formatPrice(price: number): string {
	return price >= 1 ? price.toFixed(3) : price.toFixed(5);
}
