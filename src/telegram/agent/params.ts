import type { CreatePreset } from "../../domain/config.js";
import type {
	CreatePositionParams,
	StrategyType,
} from "../../domain/onchain.js";

const DEFAULT_SOL_BINS = { minBin: -69, maxBin: 0 } as const;

export function buildCreateParams(input: {
	poolAddress: string;
	strategy: StrategyType;
	range: CreatePreset["range"];
	amountSol: number;
}): CreatePositionParams {
	const r = input.range ?? { type: "default" };
	const base = {
		poolAddress: input.poolAddress,
		strategy: input.strategy,
		totalXAmount: "0",
		totalYAmount: String(input.amountSol),
		singleSidedX: false,
		singleSidedY: true,
		amountsAreHuman: true,
	};
	if (r.type === "pct" && r.minPct != null && r.maxPct != null) {
		return { ...base, minPct: r.minPct, maxPct: r.maxPct };
	}
	if (r.type === "bin" && r.minBin != null && r.maxBin != null) {
		return {
			...base,
			minBinId: r.minBin,
			maxBinId: r.maxBin,
			relativeBins: true,
		};
	}
	return {
		...base,
		minBinId: DEFAULT_SOL_BINS.minBin,
		maxBinId: DEFAULT_SOL_BINS.maxBin,
		relativeBins: true,
	};
}
