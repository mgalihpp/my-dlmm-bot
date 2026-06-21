// Meteora DLMM Data API response types
// Docs: https://docs.meteora.ag/api-reference/dlmm/portfolio

// On-chain operation types
export type StrategyType = "spot" | "bidask" | "curve";

export interface CreatePositionParams {
  poolAddress: string;
  strategy: StrategyType;
  totalXAmount: string;
  totalYAmount: string;
  minBinId: number;
  maxBinId: number;
  singleSidedX: boolean;
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
  symbol: string;
  decimals: number;
  price: number;
  is_verified: boolean;
  holders: number;
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
