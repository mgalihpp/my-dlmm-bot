import { lookup } from "node:dns/promises";

function isPrivateIPv4(ip: string): boolean {
	const parts = ip.split(".");
	if (parts.length !== 4) return true;
	const octets = parts.map((p) =>
		/^\d{1,3}$/.test(p) ? Number.parseInt(p, 10) : -1,
	);
	if (octets.some((n) => n < 0 || n > 255)) return true;
	const a = octets[0];
	const b = octets[1];
	if (a === 0 || a === 10 || a === 127) return true;
	if (a === 100 && b >= 64 && b <= 127) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	return false;
}

function ipv4ToGroups(part: string): [number, number] | null {
	const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(part);
	if (!m) return null;
	const [o1, o2, o3, o4] = m.slice(1).map((s) => Number.parseInt(s, 10));
	if ([o1, o2, o3, o4].some((n) => n > 255)) return null;
	return [((o1 ?? 0) << 8) | (o2 ?? 0), ((o3 ?? 0) << 8) | (o4 ?? 0)];
}

function expandIPv6Groups(addr: string): number[] | null {
	const sides = addr.split("::");
	if (sides.length > 2) return null;
	const parseSide = (side: string): number[] | null => {
		if (side === "") return [];
		const out: number[] = [];
		for (const part of side.split(":")) {
			if (part.includes(".")) {
				const v4 = ipv4ToGroups(part);
				if (!v4 || out.length > 6) return null;
				out.push(v4[0], v4[1]);
			} else if (/^[0-9a-f]{1,4}$/.test(part)) {
				out.push(Number.parseInt(part, 16));
			} else {
				return null;
			}
		}
		return out;
	};
	const head = parseSide(sides[0]);
	if (!head) return null;
	const tail = sides.length === 2 ? parseSide(sides[1]) : null;
	if (sides.length === 2 && tail === null) return null;
	const tailGroups = tail ?? [];
	const missing = 8 - head.length - tailGroups.length;
	if (missing < 0 || (sides.length === 1 && missing !== 0)) return null;
	return [...head, ...new Array<number>(missing).fill(0), ...tailGroups];
}

export function isPrivateAddress(ip: string): boolean {
	const addr = ip.toLowerCase().split("%")[0];
	if (!addr.includes(":")) return isPrivateIPv4(addr);
	const groups = expandIPv6Groups(addr);
	if (!groups) return true;
	const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
	if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0) {
		if (g5 === 0xffff) {
			const hi = g6;
			const lo = g7;
			return isPrivateIPv4(
				`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`,
			);
		}
		return true;
	}
	return (g0 >= 0xfc00 && g0 <= 0xfdff) || (g0 >= 0xfe80 && g0 <= 0xfebf);
}

export async function assertPublicHost(hostname: string): Promise<void> {
	const records = await lookup(hostname, { all: true, verbatim: true });
	for (const record of records) {
		if (isPrivateAddress(record.address)) {
			throw new Error(`blocked host: ${hostname}`);
		}
	}
}
