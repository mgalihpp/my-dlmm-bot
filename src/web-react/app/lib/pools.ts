import type { ScreenedPool } from "@vexis/domain/index.js";
import type { ScreenResult } from "@vexis/lib/screening.js";
import { fmtSol, fmtUsd } from "~/lib/format";

export const TIMEFRAMES = [
	"5m",
	"30m",
	"1h",
	"2h",
	"4h",
	"12h",
	"24h",
] as const;

export type Currency = "usd" | "sol";
export type OrganicBucket = "all" | "pass" | "review" | "blocked";
export type SortDir = "asc" | "desc";
export type PoolSortKey =
	| "pool"
	| "price"
	| "mcap"
	| "tvl"
	| "volume"
	| "fee"
	| "binStep"
	| "organicScore"
	| "rugScore"
	| "fromAthPct"
	| "priceChangePct";

export interface PoolsPayload {
	readonly ok: boolean;
	readonly error?: string;
	readonly timeframe: string;
	readonly total: number;
	readonly filtered: number;
	readonly pools: readonly ScreenedPool[];
	readonly solPrice: number | null;
	readonly fetchedAt: number;
	readonly wallet?: string;
	readonly rpc?: string;
}

export function organicBucket(score: number): "pass" | "review" | "blocked" {
	if (score >= 80) return "pass";
	if (score >= 60) return "review";
	return "blocked";
}

export function rugBucket(
	score: number | null | undefined,
): "pass" | "review" | "blocked" | "na" {
	if (score === null || score === undefined) return "na";
	if (score <= 250) return "pass";
	if (score <= 1250) return "review";
	return "blocked";
}

export function toSol(
	usd: number | null | undefined,
	solPrice: number | null,
): number | null {
	if (usd === null || usd === undefined || !solPrice || solPrice <= 0) {
		return null;
	}
	return usd / solPrice;
}

export function fmtAmount(
	usd: number | null | undefined,
	currency: Currency,
	solPrice: number | null,
): string {
	const sol = toSol(usd, solPrice);
	if (currency === "sol" && sol !== null) return fmtSol(sol);
	if (currency === "sol") return "-";
	return fmtUsd(usd);
}

export function matchesSearch(pool: ScreenedPool, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q.length === 0) return true;
	return (
		pool.name.toLowerCase().includes(q) ||
		pool.baseSymbol.toLowerCase().includes(q) ||
		pool.quoteSymbol.toLowerCase().includes(q) ||
		pool.pool.toLowerCase().includes(q)
	);
}

export function organicFilter(
	pool: ScreenedPool,
	bucket: OrganicBucket,
): boolean {
	if (bucket === "all") return true;
	return organicBucket(pool.organicScore) === bucket;
}

const VALUE: Record<PoolSortKey, (p: ScreenedPool) => number | string> = {
	pool: (p) => (p.name || p.baseSymbol).toLowerCase(),
	price: (p) => p.price,
	mcap: (p) => p.mcap,
	tvl: (p) => p.tvl,
	volume: (p) => p.volume,
	fee: (p) => p.fee,
	binStep: (p) => p.binStep,
	organicScore: (p) => p.organicScore,
	rugScore: (p) => p.rugScore ?? Number.POSITIVE_INFINITY,
	fromAthPct: (p) => p.fromAthPct ?? -1,
	priceChangePct: (p) => p.priceChangePct ?? Number.NEGATIVE_INFINITY,
};

export function sortPools(
	pools: readonly ScreenedPool[],
	key: PoolSortKey,
	dir: SortDir,
): ScreenedPool[] {
	const get = VALUE[key];
	const sign = dir === "asc" ? 1 : -1;
	return [...pools].sort((a, b) => {
		const av = get(a);
		const bv = get(b);
		if (typeof av === "string" || typeof bv === "string") {
			return String(av).localeCompare(String(bv)) * sign;
		}
		return (av - bv) * sign;
	});
}

export function buildPoolsPayload(
	result: ScreenResult,
	solPrice: number | null,
	timeframe: string,
): PoolsPayload {
	return {
		ok: true,
		timeframe,
		total: result.total,
		filtered: result.filtered,
		pools: result.pools,
		solPrice,
		fetchedAt: Date.now(),
	};
}
