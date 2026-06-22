// Meteora DLMM Data API response types
// Docs: https://docs.meteora.ag/api-reference/dlmm/portfolio

// On-chain operation types
export type StrategyType = "spot" | "bidask" | "curve";

export interface CreatePositionParams {
  poolAddress: string;
  strategy: StrategyType;
  totalXAmount: string;
  totalYAmount: string;
  singleSidedX: boolean;
  // Range — provide EITHER absolute bin ids OR a price range.
  // Bin ids are anchored to the active bin via `relativeBins`.
  minBinId?: number;
  maxBinId?: number;
  // When true, minBinId/maxBinId are offsets relative to the active bin
  // (e.g. -34..34). When false/omitted they are treated as absolute bin ids.
  relativeBins?: boolean;
  // Price range (human units, e.g. USDC/SOL). Converted to bins via the SDK.
  // Takes precedence over minBinId/maxBinId when both are present.
  minPrice?: number;
  maxPrice?: number;
  // Percentage range relative to current price (signed fractions, e.g.
  // minPct -0.5 / maxPct 0 = "-50% up to current price"). Highest precedence —
  // chart-free, best for automated bots.
  minPct?: number;
  maxPct?: number;
  // When true, totalXAmount/totalYAmount are human amounts (e.g. "0.5 SOL")
  // and get scaled by the token decimals. When false they are atomic units.
  amountsAreHuman?: boolean;
  // When true, the missing side amount is auto-filled from the provided side
  // based on the active bin ratio (mirrors the UI "Auto-Fill" toggle).
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
}

export interface RemoveLiquidityParams {
  poolAddress: string;
  positionPubkey: string;
  bpsToRemove: number;
  shouldClaimAndClose: boolean;
}

// Portfolio data types
export interface PortfolioTotal {
  totalPnlUsd: string;
  totalPnlSol: string;
  totalPnlPctChange: string;
  totalPnlSolPctChange: string;
}

export interface OpenPortfolioTotals {
  totalPositions: number;
  balances: string;
  balancesSol: string | null;
  unclaimedFees: string;
  unclaimedFeesSol: string | null;
  pnl: string;
  pnlPctChange: string;
  pnlSol: string | null;
  pnlSolPctChange: string | null;
}

export interface OpenPool {
  poolAddress: string;
  binStep: number;
  baseFee: number;
  tokenX: string;
  tokenY: string;
  tokenXMint: string;
  tokenYMint: string;
  balances: string;
  unclaimedFees: string;
  feePerTvl24h: string;
  pnl: string;
  pnlPctChange: string;
  pnlSol: string | null;
  pnlSolPctChange: string | null;
  totalDeposit: string;
  openPositionCount: number;
  listPositions: string[];
  positionsOutOfRange: string[];
  outOfRange: boolean | null;
  poolPrice: number;
}

export interface OpenPortfolioResponse {
  hasNext: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPositions: number;
  solPrice: string | null;
  total: OpenPortfolioTotals | null;
  pools: OpenPool[];
}

export interface ClosedPool {
  poolAddress: string;
  binStep: string | number;
  baseFee: string | number;
  lastClosedAt: number | null;
  tokenX: string;
  tokenY: string;
  tokenXMint: string;
  tokenYMint: string;
  totalDeposit: string;
  totalWithdrawal: string;
  totalFee: string;
  pnlUsd: string;
  pnlSol: string;
  pnlPctChange: string;
}

export interface ClosedPortfolioResponse {
  hasNext: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPositions: number;
  pools: ClosedPool[];
}

// Pool info types
export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  price: number;
  is_verified: boolean;
  holders: number;
  market_cap: number;
}

export interface TimeWindowData {
  "30m": number;
  "1h": number;
  "2h": number;
  "4h": number;
  "12h": number;
  "24h": number;
}

export interface DlmmPool {
  address: string;
  name: string;
  token_x: TokenInfo;
  token_y: TokenInfo;
  tvl: number;
  current_price: number;
  apr: number;
  apy: number;
  farm_apr: number;
  has_farm: boolean;
  dynamic_fee_pct: number;
  pool_config: {
    bin_step: number;
    base_fee_pct: number;
    max_fee_pct: number;
    protocol_fee_pct: number;
  };
  volume: TimeWindowData;
  fees: TimeWindowData;
  protocol_fees: TimeWindowData;
  fee_tvl_ratio: TimeWindowData;
  cumulative_metrics: {
    volume: number;
    fees: number;
  };
}

export interface DlmmPoolsResponse {
  total: number;
  pages: number;
  current_page: number;
  page_size: number;
  data: DlmmPool[];
}

export interface PoolHistoricalVolume {
  timestamp: number;
  volume: number;
}
