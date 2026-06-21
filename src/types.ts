// Meteora DLMM Data API response types
// Docs: https://docs.meteora.ag/api-reference/dlmm/portfolio

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
