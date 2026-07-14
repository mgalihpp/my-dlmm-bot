import { Schema } from "effect";

export const DiscoveryTokenInfo = Schema.Struct({
  address: Schema.String,
  symbol: Schema.String,
  name: Schema.String,
  decimals: Schema.Number,
  price: Schema.Number,
  market_cap: Schema.Number,
  holders: Schema.Number,
  organic_score: Schema.Number,
  created_at: Schema.Number,
  dev: Schema.optional(Schema.String),
  launchpad: Schema.optional(Schema.String),
  warnings: Schema.optional(Schema.Array(Schema.String)),
});
export type DiscoveryTokenInfo = Schema.Schema.Type<typeof DiscoveryTokenInfo>;

export const DiscoveryPool = Schema.Struct({
  pool_address: Schema.String,
  name: Schema.String,
  pool_type: Schema.String,
  token_x: DiscoveryTokenInfo,
  token_y: DiscoveryTokenInfo,
  tvl: Schema.Number,
  active_tvl: Schema.Number,
  pool_price: Schema.Number,
  volatility: Schema.Number,
  volume: Schema.Number,
  fee: Schema.Number,
  fee_active_tvl_ratio: Schema.Number,
  active_positions: Schema.Number,
  active_positions_pct: Schema.Number,
  open_positions: Schema.Number,
  pool_config: Schema.optional(
    Schema.Struct({
      bin_step: Schema.Number,
      base_fee_pct: Schema.Number,
    }),
  ),
  dlmm_params: Schema.optional(
    Schema.Struct({
      bin_step: Schema.Number,
      collect_fee_mode: Schema.String,
    }),
  ),
  base_token_has_critical_warnings: Schema.Boolean,
  quote_token_has_critical_warnings: Schema.Boolean,
  base_token_has_high_supply_concentration: Schema.Boolean,
  base_token_has_high_single_ownership: Schema.Boolean,
  pool_price_change_pct: Schema.optional(Schema.Number),
  volume_change_pct: Schema.optional(Schema.Number),
  fee_change_pct: Schema.optional(Schema.Number),
  swap_count: Schema.optional(Schema.Number),
  unique_traders: Schema.optional(Schema.Number),
  min_price: Schema.optional(Schema.Number),
  max_price: Schema.optional(Schema.Number),
  price_trend: Schema.optional(Schema.String),
  fee_pct: Schema.optional(Schema.Number),
});
export type DiscoveryPool = Schema.Schema.Type<typeof DiscoveryPool>;

export const DiscoveryPoolsResponse = Schema.Struct({
  total: Schema.Number,
  pages: Schema.Number,
  current_page: Schema.Number,
  page_size: Schema.Number,
  data: Schema.Array(DiscoveryPool),
});
export type DiscoveryPoolsResponse = Schema.Schema.Type<typeof DiscoveryPoolsResponse>;
