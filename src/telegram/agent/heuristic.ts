import type { ScreenedPool } from "../../domain/screened.js";

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

// [signalName, baseWeight]; weights sum to 1.
const COMPONENTS: ReadonlyArray<[string, number]> = [
	["feeActiveTvlRatio", 0.28],
	["organicScore", 0.2],
	["holders", 0.08],
	["volume", 0.08],
	["binStep", 0.16],
	["priceVsAthPct", 0.05],
	["rugScore", 0.05],
	["top10Pct", 0.03],
	["bundlePct", 0.02],
	["botHoldersPct", 0.02],
	["activePositions", 0.03],
];

/** Deterministic 0-100 quality score from discovery + risk metrics. */
export function heuristicScore(
	pool: ScreenedPool,
	weights?: Record<string, number>,
): number {
	const w = (name: string, fallback = 1) => weights?.[name] ?? fallback;
	const feeTvl = clamp(pool.feeActiveTvlRatio / 0.05);
	const organic = clamp(pool.organicScore / 100);
	const holders = clamp(pool.holders / 1000);
	const volume = clamp(pool.volume / 100_000);
	const binStep = clamp(1 - pool.binStep / 125);
	const athPct =
		pool.priceVsAthPct ??
		(pool.fromAthPct != null ? (1 - pool.fromAthPct) * 100 : null);
	const athSafe = athPct != null ? clamp((100 - athPct) / 100) : 0.5;
	const rug = pool.rugScore != null ? clamp(1 - pool.rugScore / 2500) : 0.5;
	const top10 = pool.top10Pct != null ? clamp(1 - pool.top10Pct / 100) : 0.5;
	const bundle = pool.bundlePct != null ? clamp(1 - pool.bundlePct / 100) : 0.5;
	const bot =
		pool.botHoldersPct != null ? clamp(1 - pool.botHoldersPct / 100) : 0.5;
	const crowd = clamp(pool.activePositions / 500);

	const vals = [
		feeTvl,
		organic,
		holders,
		volume,
		binStep,
		athSafe,
		rug,
		top10,
		bundle,
		bot,
		crowd,
	];

	let weightedSum = 0;
	let totalWeight = 0;
	for (let i = 0; i < COMPONENTS.length; i++) {
		const [name, baseW] = COMPONENTS[i];
		const eff = w(name);
		weightedSum += vals[i] * baseW * eff;
		totalWeight += baseW * eff;
	}
	if (totalWeight <= 0) return 0;
	return Math.round(clamp((weightedSum / totalWeight) * 100, 0, 100));
}

export function rankPools(
	pools: readonly ScreenedPool[],
	opts: {
		minCandidate: number;
		maxCandidates: number;
		weights?: Record<string, number>;
	},
): ScreenedPool[] {
	return pools
		.map((p) => ({ p, h: heuristicScore(p, opts.weights) }))
		.sort((a, b) => b.h - a.h)
		.filter((r) => r.h >= opts.minCandidate)
		.slice(0, opts.maxCandidates)
		.map((r) => r.p);
}
