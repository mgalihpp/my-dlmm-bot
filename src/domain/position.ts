import { Schema } from "effect";
import { TokenAmount, TokenPairTotal } from "./common.js";

export const UnrealizedPnl = Schema.Struct({
  balances: Schema.Number,
  balancesSol: Schema.NullOr(Schema.String),
  balanceTokenX: TokenAmount,
  balanceTokenY: TokenAmount,
  unclaimedFeeTokenX: TokenAmount,
  unclaimedFeeTokenY: TokenAmount,
  unclaimedRewardTokenX: TokenAmount,
  unclaimedRewardTokenY: TokenAmount,
});
export type UnrealizedPnl = Schema.Schema.Type<typeof UnrealizedPnl>;

export const PositionPnLData = Schema.Struct({
  positionAddress: Schema.String,
  minPrice: Schema.String,
  maxPrice: Schema.String,
  lowerBinId: Schema.Number,
  upperBinId: Schema.Number,
  feePerTvl24h: Schema.String,
  isClosed: Schema.Boolean,
  pnlUsd: Schema.String,
  pnlPctChange: Schema.String,
  pnlSol: Schema.NullOr(Schema.Number),
  pnlSolPctChange: Schema.NullOr(Schema.Number),
  allTimeDeposits: TokenPairTotal,
  allTimeWithdrawals: TokenPairTotal,
  allTimeFees: TokenPairTotal,
  unrealizedPnl: Schema.optional(Schema.NullOr(UnrealizedPnl)),
  closedAt: Schema.NullOr(Schema.Number),
  createdAt: Schema.NullOr(Schema.Number),
  isOutOfRange: Schema.NullOr(Schema.Boolean),
  poolActiveBinId: Schema.NullOr(Schema.Number),
  poolActivePrice: Schema.NullOr(Schema.String),
});
export type PositionPnLData = Schema.Schema.Type<typeof PositionPnLData>;

export const PositionPnLResponse = Schema.Struct({
  totalCount: Schema.Number,
  page: Schema.Number,
  pageSize: Schema.Number,
  hasNext: Schema.Boolean,
  positions: Schema.Array(PositionPnLData),
  tokenX: Schema.NullOr(Schema.String),
  tokenXPrice: Schema.String,
  tokenY: Schema.NullOr(Schema.String),
  tokenYPrice: Schema.String,
  solPrice: Schema.NullOr(Schema.String),
  rewardTokenX: Schema.NullOr(Schema.String),
  rewardTokenXPrice: Schema.String,
  rewardTokenY: Schema.NullOr(Schema.String),
  rewardTokenYPrice: Schema.String,
});
export type PositionPnLResponse = Schema.Schema.Type<typeof PositionPnLResponse>;
