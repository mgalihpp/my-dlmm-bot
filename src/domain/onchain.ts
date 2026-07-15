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
}

export interface CreatePositionResult {
  signatures: string[];
  positions: string[];
  minBinId: number;
  maxBinId: number;
  binCount: number;
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
}

export interface RemoveLiquidityParams {
  poolAddress: string;
  positionPubkey: string;
  bpsToRemove: number;
  shouldClaimAndClose: boolean;
}
