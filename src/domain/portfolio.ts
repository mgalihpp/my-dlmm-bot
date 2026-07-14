import { Schema } from "effect";

export const PortfolioTotal = Schema.Struct({
  totalPnlUsd: Schema.String,
  totalPnlSol: Schema.String,
  totalPnlPctChange: Schema.String,
  totalPnlSolPctChange: Schema.String,
});
export type PortfolioTotal = Schema.Schema.Type<typeof PortfolioTotal>;

export const OpenPortfolioTotals = Schema.Struct({
  totalPositions: Schema.Number,
  balances: Schema.String,
  balancesSol: Schema.NullOr(Schema.String),
  unclaimedFees: Schema.String,
  unclaimedFeesSol: Schema.NullOr(Schema.String),
  pnl: Schema.String,
  pnlPctChange: Schema.String,
  pnlSol: Schema.NullOr(Schema.String),
  pnlSolPctChange: Schema.NullOr(Schema.String),
});
export type OpenPortfolioTotals = Schema.Schema.Type<typeof OpenPortfolioTotals>;

export const PositionLiveEntry = Schema.Struct({
  address: Schema.String,
  amountX: Schema.String,
  amountY: Schema.String,
  feeX: Schema.String,
  feeY: Schema.String,
});
export type PositionLiveEntry = Schema.Schema.Type<typeof PositionLiveEntry>;

export const PositionPnlEntry = Schema.Struct({
  address: Schema.String,
  pnlUsd: Schema.String,
  pnlPctChange: Schema.String,
  pnlSol: Schema.NullOr(Schema.String),
  pnlSolPctChange: Schema.NullOr(Schema.String),
});
export type PositionPnlEntry = Schema.Schema.Type<typeof PositionPnlEntry>;

export const OpenPool = Schema.Struct({
  poolAddress: Schema.String,
  binStep: Schema.Number,
  baseFee: Schema.Number,
  tokenX: Schema.String,
  tokenY: Schema.String,
  tokenXMint: Schema.String,
  tokenYMint: Schema.String,
  balances: Schema.String,
  unclaimedFees: Schema.String,
  feePerTvl24h: Schema.String,
  pnl: Schema.String,
  pnlPctChange: Schema.String,
  pnlSol: Schema.NullOr(Schema.String),
  pnlSolPctChange: Schema.NullOr(Schema.String),
  totalDeposit: Schema.String,
  openPositionCount: Schema.Number,
  listPositions: Schema.Array(Schema.String),
  positionsOutOfRange: Schema.Array(Schema.String),
  positionsPnl: Schema.optional(Schema.Array(PositionPnlEntry)),
  positionsLive: Schema.optional(Schema.Array(PositionLiveEntry)),
  outOfRange: Schema.NullOr(Schema.Boolean),
  poolPrice: Schema.Number,
  poolStateUpdatedAtBlockTime: Schema.optional(Schema.NullOr(Schema.Number)),
  poolStateUpdatedAtSlot: Schema.optional(Schema.NullOr(Schema.Number)),
});
export type OpenPool = Schema.Schema.Type<typeof OpenPool>;

export const OpenPortfolioResponse = Schema.Struct({
  hasNext: Schema.Boolean,
  page: Schema.Number,
  pageSize: Schema.Number,
  totalCount: Schema.Number,
  totalPositions: Schema.Number,
  solPrice: Schema.NullOr(Schema.String),
  total: Schema.NullOr(OpenPortfolioTotals),
  pools: Schema.Array(OpenPool),
});
export type OpenPortfolioResponse = Schema.Schema.Type<typeof OpenPortfolioResponse>;

export const ClosedPool = Schema.Struct({
  poolAddress: Schema.String,
  binStep: Schema.Union(Schema.String, Schema.Number),
  baseFee: Schema.Union(Schema.String, Schema.Number),
  lastClosedAt: Schema.NullOr(Schema.Number),
  tokenX: Schema.String,
  tokenY: Schema.String,
  tokenXMint: Schema.String,
  tokenYMint: Schema.String,
  totalDeposit: Schema.String,
  totalWithdrawal: Schema.String,
  totalFee: Schema.String,
  pnlUsd: Schema.String,
  pnlSol: Schema.String,
  pnlSolPctChange: Schema.String,
  pnlPctChange: Schema.String,
});
export type ClosedPool = Schema.Schema.Type<typeof ClosedPool>;

export const ClosedPortfolioResponse = Schema.Struct({
  hasNext: Schema.Boolean,
  page: Schema.Number,
  pageSize: Schema.Number,
  totalCount: Schema.Number,
  totalPositions: Schema.Number,
  pools: Schema.Array(ClosedPool),
});
export type ClosedPortfolioResponse = Schema.Schema.Type<typeof ClosedPortfolioResponse>;
