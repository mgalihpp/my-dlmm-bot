import type { ScreenedPool } from "../../domain/screened.js";

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Deterministic 0-100 quality score from discovery metrics. */
export function heuristicScore(pool: ScreenedPool): number {
	const feeTvl = clamp(pool.feeActiveTvlRatio / 0.05);
	const organic = clamp(pool.organicScore / 100);
	const holders = clamp(pool.holders / 1000);
	const volume = clamp(pool.volume / 100_000);
	const binStep = clamp(1 - pool.binStep / 125);
	const raw =
		100 *
		(0.35 * feeTvl +
			0.25 * organic +
			0.1 * holders +
			0.1 * volume +
			0.2 * binStep);
	return Math.round(clamp(raw, 0, 100));
}

export function rankPools(
	pools: readonly ScreenedPool[],
	opts: { minCandidate: number; maxCandidates: number },
): ScreenedPool[] {
	return pools
		.map((p) => ({ p, h: heuristicScore(p) }))
		.sort((a, b) => b.h - a.h)
		.filter((r) => r.h >= opts.minCandidate)
		.slice(0, opts.maxCandidates)
		.map((r) => r.p);
}
