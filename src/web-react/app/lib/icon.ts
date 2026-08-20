const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

function isHttpUrl(value: string): boolean {
	return value.startsWith("https://") || value.startsWith("http://");
}

function isBareCid(value: string): boolean {
	return /^(bafy[a-z0-9]{50,}|bafk[a-z0-9]{50,}|Qm[1-9A-HJ-NP-Za-km-z]{44,})([//?#].*)?$/i.test(
		value,
	);
}

export function toGatewayUrl(raw: string | null | undefined): string | null {
	if (raw == null) return null;
	const s = raw.trim();
	if (!s) return null;
	if (s.startsWith("data:") || s.startsWith("blob:")) return s;
	if (isHttpUrl(s)) return s;
	if (s.startsWith("ipfs://")) {
		const rest = s.slice(7).replace(/^ipfs\//, "");
		return `${IPFS_GATEWAY}${rest}`;
	}
	if (isBareCid(s)) return `${IPFS_GATEWAY}${s}`;
	return s;
}

export function proxiedIconUrl(raw: string | null | undefined): string | null {
	const gateway = toGatewayUrl(raw);
	if (!gateway) return null;
	if (gateway.startsWith("data:") || gateway.startsWith("blob:"))
		return gateway;
	// Same-origin proxy bypasses CORP/COEP + handles IPFS gateways that send same-origin
	return `/api/icon?url=${encodeURIComponent(gateway)}`;
}
