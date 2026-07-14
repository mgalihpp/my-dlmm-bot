import { Schema } from "effect";
import { TimeWindowData } from "./common.js";

export const TokenInfo = Schema.Struct({
  address: Schema.String,
  name: Schema.String,
  symbol: Schema.String,
  decimals: Schema.Number,
  price: Schema.Number,
  is_verified: Schema.Boolean,
  holders: Schema.Number,
  market_cap: Schema.Number,
});
export type TokenInfo = Schema.Schema.Type<typeof TokenInfo>;

export const DlmmPool = Schema.Struct({
  address: Schema.String,
  name: Schema.String,
  token_x: TokenInfo,
  token_y: TokenInfo,
  tvl: Schema.Number,
  current_price: Schema.Number,
  apr: Schema.Number,
  apy: Schema.Number,
  farm_apr: Schema.Number,
  has_farm: Schema.Boolean,
  dynamic_fee_pct: Schema.Number,
  pool_config: Schema.Struct({
    bin_step: Schema.Number,
    base_fee_pct: Schema.Number,
    max_fee_pct: Schema.Number,
    protocol_fee_pct: Schema.Number,
  }),
  volume: TimeWindowData,
  fees: TimeWindowData,
  protocol_fees: TimeWindowData,
  fee_tvl_ratio: TimeWindowData,
  cumulative_metrics: Schema.Struct({
    volume: Schema.Number,
    fees: Schema.Number,
  }),
});
export type DlmmPool = Schema.Schema.Type<typeof DlmmPool>;

export const DlmmPoolsResponse = Schema.Struct({
  total: Schema.Number,
  pages: Schema.Number,
  current_page: Schema.Number,
  page_size: Schema.Number,
  data: Schema.Array(DlmmPool),
});
export type DlmmPoolsResponse = Schema.Schema.Type<typeof DlmmPoolsResponse>;

export const PoolHistoricalVolume = Schema.Struct({
  timestamp: Schema.Number,
  volume: Schema.Number,
});
export type PoolHistoricalVolume = Schema.Schema.Type<typeof PoolHistoricalVolume>;

export const PoolHistoricalVolumeArray = Schema.Array(PoolHistoricalVolume);
