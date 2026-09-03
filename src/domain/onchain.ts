export type StrategyType = "spot" | "bidask" | "curve";

export interface CreatePositionParams {
	poolAddress: string;
	strategy: StrategyType;
	totalXAmount: string;
	totalYAmount: string;
	singleSidedX: boolean;
	singleSidedY?: boolean;
	minBinId?: number;
	maxBinId?: number;
	relativeBins?: boolean;
	minPct?: number;
	maxPct?: number;
	amountsAreHuman?: boolean;
	autoFill?: boolean;
	slippageBps?: number;
}

export interface CreatePositionResult {
	signatures: string[];
	positions: string[];
	minBinId: number;
	maxBinId: number;
	binCount: number;
}

export interface QuotePositionCostParams {
	poolAddress: string;
	strategy: StrategyType;
	minBinId?: number;
	maxBinId?: number;
	relativeBins?: boolean;
	minPct?: number;
	maxPct?: number;
}

export interface PositionCostQuote {
	positionCount: number;
	positionCost: number;
	positionReallocCost: number;
	bitmapExtensionCost: number;
	binArraysCount: number;
	binArrayCost: number;
	transactionCount: number;
	totalCost: number;
	nonRefundableCost: number;
	refundableCost: number;
}

export interface AddLiquidityParams {
	poolAddress: string;
	positionPubkey: string;
	totalXAmount: string;
	totalYAmount: string;
	strategy: StrategyType;
	minBinId: number;
	maxBinId: number;
	amountsAreHuman?: boolean;
	slippageBps?: number;
}

export interface RemoveLiquidityParams {
	poolAddress: string;
	positionPubkey: string;
	bpsToRemove: number;
	shouldClaimAndClose: boolean;
}
