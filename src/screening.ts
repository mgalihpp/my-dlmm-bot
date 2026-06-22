import type { MeteoraClient } from "./api.js";
import type { VexisConfig } from "./config.js";
import type { DiscoveryPool, ScreenedPool } from "./types.js";

/** Valid screening timeframes. */
const VALID_TIMEFRAMES = ["5m", "15m", "30m", "1h", "2h", "4h", "12h", "24h"];

/** Parse a timeframe string, return null if invalid. */
export function parseTimeframe(input: string | undefined): string | null {
  if (!input) return null;
  const tf = input.trim().toLowerCase();
  return VALID_TIMEFRAMES.includes(tf) ? tf : null;
}

/** Build the filter_by string for Pool Discovery API from screening config. */
export function buildDiscoveryFilter(cfg: VexisConfig["pools"], timeframe?: string): string {
  const s = cfg ?? {};
  const now = Date.now();
  const filters: (string | null)[] = [
    "base_token_has_critical_warnings=false",
    "quote_token_has_critical_warnings=false",
    s.excludeHighSupplyConcentration !== false
      ? "base_token_has_high_supply_concentration=false"
      : null,
    "base_token_has_high_single_ownership=false",
    "pool_type=dlmm",
    `base_token_market_cap>=${s.minMcap ?? 150_000}`,
    `base_token_market_cap<=${s.maxMcap ?? 10_000_000}`,
    `base_token_holders>=${s.minHolders ?? 500}`,
    `volume>=${s.minVolume ?? 500}`,
    `tvl>=${s.minTvl ?? 10_000}`,
    s.maxTvl != null ? `tvl<=${s.maxTvl}` : null,
    `dlmm_bin_step>=${s.minBinStep ?? 80}`,
    `dlmm_bin_step<=${s.maxBinStep ?? 125}`,
    `fee_active_tvl_ratio>=${s.minFeeActiveTvlRatio ?? 0.05}`,
    `base_token_organic_score>=${s.minOrganic ?? 60}`,
    `quote_token_organic_score>=${s.minQuoteOrganic ?? 60}`,
    s.minTokenAgeHours != null
      ? `base_token_created_at<=${now - s.minTokenAgeHours * 3_600_000}`
      : null,
    s.maxTokenAgeHours != null
      ? `base_token_created_at>=${now - s.maxTokenAgeHours * 3_600_000}`
      : null,
    Array.isArray(s.blockedLaunchpads) && s.blockedLaunchpads.length > 0
      ? `base_token_launchpad=[${s.blockedLaunchpads.join(",")}]`
      : null,
  ];
  return filters.filter((f): f is string => f !== null).join("&&");
}

function numeric(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isUsableVolatility(value: unknown): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

/** Reject reason string if pool fails hard filter, null if passes. */
function getRejectReason(pool: DiscoveryPool, cfg: VexisConfig["pools"]): string | null {
  const s = cfg ?? {};
  const base = pool.token_x;
  const binStep = numeric(pool.dlmm_params?.bin_step);
  const tvl = numeric(pool.tvl ?? pool.active_tvl);
  const feeRatio = numeric(pool.fee_active_tvl_ratio);
  const volatility = numeric(pool.volatility);
  const volume = numeric(pool.volume);
  const holders = numeric(base?.holders);
  const mcap = numeric(base?.market_cap);
  const baseOrganic = numeric(base?.organic_score);
  const quoteOrganic = numeric(pool.token_y?.organic_score);
  const createdAt = numeric(base?.created_at);

  if (pool.base_token_has_critical_warnings) return "base token has critical warnings";
  if (pool.quote_token_has_critical_warnings) return "quote token has critical warnings";
  if (s.excludeHighSupplyConcentration !== false && pool.base_token_has_high_supply_concentration) {
    return "base token has high supply concentration";
  }
  if (pool.base_token_has_high_single_ownership) return "base token has high single ownership";
  if (pool.pool_type && pool.pool_type !== "dlmm") return `pool_type ${pool.pool_type} is not dlmm`;

  if (mcap == null || mcap < (s.minMcap ?? 150_000)) return `mcap ${mcap ?? "unknown"} below min`;
  if (mcap > (s.maxMcap ?? 10_000_000)) return `mcap ${mcap} above max`;
  if (holders == null || holders < (s.minHolders ?? 500)) return `holders ${holders ?? "unknown"} below min`;
  if (volume == null || volume < (s.minVolume ?? 500)) return `volume ${volume ?? "unknown"} below min`;
  if (tvl == null || tvl < (s.minTvl ?? 10_000)) return `TVL ${tvl ?? "unknown"} below min`;
  if (s.maxTvl != null && tvl > s.maxTvl) return `TVL ${tvl} above max`;
  if (binStep == null || binStep < (s.minBinStep ?? 80)) return `bin_step ${binStep ?? "unknown"} below min`;
  if (binStep > (s.maxBinStep ?? 125)) return `bin_step ${binStep} above max`;
  if (feeRatio == null || feeRatio < (s.minFeeActiveTvlRatio ?? 0.05)) {
    return `fee/TVL ${feeRatio ?? "unknown"} below min`;
  }
  if (!isUsableVolatility(volatility)) return `volatility ${volatility ?? "unknown"} unusable`;
  if (baseOrganic == null || baseOrganic < (s.minOrganic ?? 60)) {
    return `base organic ${baseOrganic ?? "unknown"} below min`;
  }
  if (quoteOrganic == null || quoteOrganic < (s.minQuoteOrganic ?? 60)) {
    return `quote organic ${quoteOrganic ?? "unknown"} below min`;
  }
  if (s.minTokenAgeHours != null) {
    const maxCreated = Date.now() - s.minTokenAgeHours * 3_600_000;
    if (createdAt == null || createdAt > maxCreated) return `token age below ${s.minTokenAgeHours}h`;
  }
  if (s.maxTokenAgeHours != null) {
    const minCreated = Date.now() - s.maxTokenAgeHours * 3_600_000;
    if (createdAt == null || createdAt < minCreated) return `token age above ${s.maxTokenAgeHours}h`;
  }
  return null;
}

/** Score a candidate pool. Higher = better. */
function scoreCandidate(pool: DiscoveryPool): number {
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

/** Condense a raw DiscoveryPool into a ScreenedPool for display. */
function condensePool(pool: DiscoveryPool): ScreenedPool {
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
    baseFeePct: pool.pool_config?.base_fee_pct ?? 0,
    volume: round(pool.volume) ?? 0,
    fee: round(pool.fee) ?? 0,
    activePositions: pool.active_positions ?? 0,
    openPositions: pool.open_positions ?? 0,
    tokenAgeHours: createdAt != null
      ? Math.floor((Date.now() - createdAt) / 3_600_000)
      : null,
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

export interface RugCheckResult {
  pass: boolean;
  reason?: string;
  rugScore: number | null;
}

/** Check token via rugcheck.xyz API. Returns pass/fail + score. */
async function rugCheck(mint: string): Promise<RugCheckResult> {
  if (!mint) return { pass: true, rugScore: null };
  try {
    const url = `https://api.rugcheck.xyz/v1/tokens/${mint}/report?key=3a6fc5a4-9de6-41b9-9632-6b00459d6b35`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { pass: true, rugScore: null };
    const data = await res.json() as {
      rugged?: boolean;
      score?: number;
      topHolders?: Array<{ pct?: number; percentage?: number }>;
    };
    if (data.rugged) return { pass: false, reason: "rugcheck: token is rugged", rugScore: null };
    const score = data.score ?? 0;
    if (score > 50_000) return { pass: false, reason: `rugcheck: score too high (${score})`, rugScore: score };
    const topHolders = data.topHolders ?? [];
    const top10Pct = topHolders
      .slice(0, 10)
      .reduce((sum, h) => sum + (h.pct ?? h.percentage ?? 0), 0);
    if (top10Pct > 60) return { pass: false, reason: `rugcheck: top10 holders ${top10Pct.toFixed(1)}% > 60%`, rugScore: score };
    return { pass: true, rugScore: score };
  } catch {
    return { pass: true, rugScore: null };
  }
}

/**
 * Run full screening pipeline: discover → hard-filter → rugcheck → score → sort → condense.
 */
export async function screenPools(
  client: MeteoraClient,
  config: VexisConfig,
  overrideTimeframe?: string,
): Promise<ScreenResult> {
  const poolCfg = config.pools ?? {};

  const timeframe = overrideTimeframe ?? poolCfg.timeframe ?? "5m";
  const category = poolCfg.category ?? "trending";
  const pageSize = poolCfg.pageSize ?? 50;
  const displayLimit = poolCfg.displayLimit ?? 15;

  const filterBy = buildDiscoveryFilter(poolCfg, timeframe);
  const res = await client.discoverPools({ pageSize, filterBy, timeframe, category });

  const rawPools = Array.isArray(res.data) ? res.data : [];
  const screened: ScreenedPool[] = [];
  let filteredCount = 0;

  for (const pool of rawPools) {
    const reason = getRejectReason(pool, poolCfg);
    if (reason) {
      filteredCount++;
      continue;
    }
    screened.push(condensePool(pool));
  }

  // Rugcheck: verify each candidate isn't rugged / too risky
  if (screened.length > 0) {
    const rugResults = await Promise.allSettled(
      screened.map((p) => rugCheck(p.baseMint)),
    );

    const passed: ScreenedPool[] = [];
    for (let i = 0; i < screened.length; i++) {
      const result = rugResults[i];
      if (result.status !== "fulfilled") {
        passed.push(screened[i]);
        continue;
      }
      const { pass, reason, rugScore } = result.value;
      screened[i].rugScore = rugScore;
      if (!pass) {
        filteredCount++;
        continue;
      }
      passed.push(screened[i]);
    }
    screened.length = 0;
    screened.push(...passed);
  }

  screened.sort((a, b) => b.score - a.score);
  const top = screened.slice(0, displayLimit);

  return {
    pools: top,
    total: res.total ?? rawPools.length,
    filtered: filteredCount,
  };
}
