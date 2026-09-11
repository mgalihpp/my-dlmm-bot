import type { StrategyType } from "../domain/onchain.js";

// Strategy is deposit-time-only in the Meteora SDK and never stored onchain,
// so this infers the effective shape from live bin weights. The result drifts
// with price action and the original intent is not recoverable onchain.
export function inferStrategyFromBinWeights(
	weights: readonly number[],
): StrategyType | null {
	let total = 0;
	let nonzero = 0;
	let peak = 0;
	let peakIndex = -1;
	for (let i = 0; i < weights.length; i++) {
		const w = weights[i];
		if (w === undefined || !Number.isFinite(w) || w < 0) return null;
		total += w;
		if (w > 0) nonzero += 1;
		if (w > peak) {
			peak = w;
			peakIndex = i;
		}
	}
	if (total <= 0 || nonzero < 2) return null;
	const n = weights.length;
	if (peak / (total / n) <= 1.5) return "spot";
	const first = weights[0];
	const last = weights[n - 1];
	if (
		first !== undefined &&
		last !== undefined &&
		peakIndex >= n / 3 &&
		peakIndex < (2 * n) / 3 &&
		first < peak * 0.5 &&
		last < peak * 0.5
	) {
		return "curve";
	}
	return "bidask";
}
