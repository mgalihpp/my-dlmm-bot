import type { PoolsConfig } from "../domain/config.js";
import type { DiscoveryPool, ScreenedPool } from "../domain/index.js";

const VALID_TIMEFRAMES = ["5m", "30m", "1h", "2h", "4h", "12h", "24h"];

export function parseTimeframe(input: string | undefined): string | null {
  if (!input) return null;
  const tf = input.trim().toLowerCase();
  return VALID_TIMEFRAMES.includes(tf) ? tf : null;
}

export function buildDiscoveryFilter(cfg: PoolsConfig | undefined, _timeframe?: string): string {
  const s = cfg ?? {};
  const filters: string[] = [
    "base_token_has_critical_warnings=false",
    "quote_token_has_critical_warnings=false",
    "pool_type=dlmm",
  ];
  if (s.baseTokenHasHighSupplyConcentration != null) filters.push(`base_token_has_high_supply_concentration=${s.baseTokenHasHighSupplyConcentration}`);
  if (s.baseTokenHasHighSingleOwnership != null) filters.push(`base_token_has_high_single_ownership=${s.baseTokenHasHighSingleOwnership}`);
  if (s.minMcap != null) filters.push(`base_token_market_cap>=${s.minMcap}`);
  if (s.maxMcap != null) filters.push(`base_token_market_cap<=${s.maxMcap}`);
  if (s.minHolders != null) filters.push(`base_token_holders>=${s.minHolders}`);
  if (s.maxHolders != null) filters.push(`base_token_holders<=${s.maxHolders}`);
  if (s.minOrganic != null) filters.push(`base_token_organic_score>=${s.minOrganic}`);
  if (s.maxOrganic != null) filters.push(`base_token_organic_score<=${s.maxOrganic}`);
  if (s.minTokenAgeHours != null) {
    filters.push(`base_token_created_at<=${Date.now() - s.minTokenAgeHours * 3_600_000}`);
  }
  if (s.maxTokenAgeHours != null) {
    filters.push(`base_token_created_at>=${Date.now() - s.maxTokenAgeHours * 3_600_000}`);
  }
  if (Array.isArray(s.blockedLaunchpads) && s.blockedLaunchpads.length > 0) {
    filters.push(`base_token_launchpad=[${s.blockedLaunchpads.join(",")}]`);
  }
  if (s.minQuoteOrganic != null) filters.push(`quote_token_organic_score>=${s.minQuoteOrganic}`);
  if (s.maxQuoteOrganic != null) filters.push(`quote_token_organic_score<=${s.maxQuoteOrganic}`);
  if (s.minTvl != null) filters.push(`tvl>=${s.minTvl}`);
  if (s.maxTvl != null) filters.push(`tvl<=${s.maxTvl}`);
  if (s.minActiveTvl != null) filters.push(`active_tvl>=${s.minActiveTvl}`);
  if (s.maxActiveTvl != null) filters.push(`active_tvl<=${s.maxActiveTvl}`);
  if (s.minVolume != null) filters.push(`volume>=${s.minVolume}`);
  if (s.maxVolume != null) filters.push(`volume<=${s.maxVolume}`);
  if (s.minFee != null) filters.push(`fee>=${s.minFee}`);
  if (s.maxFee != null) filters.push(`fee<=${s.maxFee}`);
  if (s.minFeeActiveTvlRatio != null) filters.push(`fee_active_tvl_ratio>=${s.minFeeActiveTvlRatio}`);
  if (s.maxFeeActiveTvlRatio != null) filters.push(`fee_active_tvl_ratio<=${s.maxFeeActiveTvlRatio}`);
  if (s.minBinStep != null) filters.push(`dlmm_bin_step>=${s.minBinStep}`);
  if (s.maxBinStep != null) filters.push(`dlmm_bin_step<=${s.maxBinStep}`);
  if (s.minVolatility != null) filters.push(`volatility>=${s.minVolatility}`);
  if (s.maxVolatility != null) filters.push(`volatility<=${s.maxVolatility}`);
  if (s.minPoolPrice != null) filters.push(`pool_price>=${s.minPoolPrice}`);
  if (s.maxPoolPrice != null) filters.push(`pool_price<=${s.maxPoolPrice}`);
  if (s.minActivePositions != null) filters.push(`active_positions>=${s.minActivePositions}`);
  if (s.maxActivePositions != null) filters.push(`active_positions<=${s.maxActivePositions}`);
  if (s.minOpenPositions != null) filters.push(`open_positions>=${s.minOpenPositions}`);
  if (s.maxOpenPositions != null) filters.push(`open_positions<=${s.maxOpenPositions}`);
  if (s.minSwapCount != null) filters.push(`swap_count>=${s.minSwapCount}`);
  if (s.maxSwapCount != null) filters.push(`swap_count<=${s.maxSwapCount}`);
  if (s.minUniqueTraders != null) filters.push(`unique_traders>=${s.minUniqueTraders}`);
  if (s.maxUniqueTraders != null) filters.push(`unique_traders<=${s.maxUniqueTraders}`);
  if (s.minPriceChangePct != null) filters.push(`pool_price_change_pct>=${s.minPriceChangePct}`);
  if (s.maxPriceChangePct != null) filters.push(`pool_price_change_pct<=${s.maxPriceChangePct}`);
  if (s.minVolumeChangePct != null) filters.push(`volume_change_pct>=${s.minVolumeChangePct}`);
  if (s.maxVolumeChangePct != null) filters.push(`volume_change_pct<=${s.maxVolumeChangePct}`);
  if (s.priceTrend != null) filters.push(`price_trend=${s.priceTrend}`);
  if (s.solPairOnly === true) {
    filters.push("(token_x=So11111111111111111111111111111111111111112||token_y=So11111111111111111111111111111111111111112)");
  }
  return filters.join("&&");
}

function numeric(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function scoreCandidate(pool: DiscoveryPool): number {
  const feeTvl = Number(pool.fee_active_tvl_ratio || 0);
  const organic = Number(pool.token_x?.organic_score || 0);
  const volume = Number(pool.volume || 0);
  const holders = Number(pool.token_x?.holders || 0);
  return feeTvl * 1000 + organic * 10 + volume / 100 + holders / 100;
}

function round(n: number | null | undefined): number | null {
  return n != null ? Math.round(n) : null;
}

function fix(n: number | null | undefined, decimals: number): number | null {
  if (n == null) return null;
  const v = Number(n);
  return Number.isFinite(v) ? Number(v.toFixed(decimals)) : null;
}

export function condensePool(pool: DiscoveryPool): ScreenedPool {
  const createdAt = numeric(pool.token_x?.created_at);
  return {
    pool: pool.pool_address,
    name: pool.name,
    baseSymbol: pool.token_x?.symbol ?? "?",
    baseMint: pool.token_x?.address ?? "",
    quoteSymbol: pool.token_y?.symbol ?? "?",
    tvl: round(pool.tvl) ?? 0,
    activeTvl: round(pool.active_tvl) ?? 0,
    mcap: round(pool.token_x?.market_cap) ?? 0,
    holders: round(pool.token_x?.holders) ?? 0,
    organicScore: Math.round(pool.token_x?.organic_score ?? 0),
    quoteOrganic: Math.round(pool.token_y?.organic_score ?? 0),
    feeActiveTvlRatio: fix(pool.fee_active_tvl_ratio, 4) ?? 0,
    volatility: fix(pool.volatility, 4) ?? 0,
    binStep: pool.dlmm_params?.bin_step ?? pool.pool_config?.bin_step ?? 0,
    baseFeePct: pool.fee_pct ?? pool.pool_config?.base_fee_pct ?? 0,
    volume: round(pool.volume) ?? 0,
    fee: round(pool.fee) ?? 0,
    activePositions: pool.active_positions ?? 0,
    openPositions: pool.open_positions ?? 0,
    tokenAgeHours: createdAt != null ? Math.floor((Date.now() - createdAt) / 3_600_000) : null,
    score: scoreCandidate(pool),
    price: pool.pool_price ?? 0,
    priceChangePct: fix(pool.pool_price_change_pct, 1),
    volumeChangePct: fix(pool.volume_change_pct, 1),
    tokenXAddress: pool.token_x?.address ?? "",
  };
}

export interface ScreenResult {
  pools: ScreenedPool[];
  total: number;
  filtered: number;
}

export function finalizeScreen(
  rawPools: readonly DiscoveryPool[],
  total: number | undefined,
  displayLimit: number,
): ScreenResult {
  const screened: ScreenedPool[] = rawPools.map(condensePool);
  screened.sort((a, b) => b.score - a.score);
  const top = screened.slice(0, displayLimit);
  return {
    pools: top,
    total: total ?? rawPools.length,
    filtered: 0,
  };
}
