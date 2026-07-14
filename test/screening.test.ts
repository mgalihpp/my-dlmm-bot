import { describe, it, expect } from "vitest";
import {
  parseTimeframe,
  buildDiscoveryFilter,
  scoreCandidate,
  condensePool,
  finalizeScreen,
} from "../src/lib/screening.js";
import type { DiscoveryPool } from "../src/domain/index.js";

const pool = (over: Partial<DiscoveryPool> = {}): DiscoveryPool =>
  ({
    pool_address: "PoolAddr",
    name: "AAA/SOL",
    pool_type: "dlmm",
    token_x: {
      address: "MintX",
      symbol: "AAA",
      name: "Alpha",
      decimals: 6,
      price: 1,
      market_cap: 1000000.4,
      holders: 1000,
      organic_score: 60,
      created_at: Date.now() - 5 * 3_600_000 - 60_000,
    },
    token_y: { address: "MintY", symbol: "SOL", name: "Solana", decimals: 9, price: 150, market_cap: 0, holders: 0, organic_score: 90 },
    tvl: 10000.6,
    active_tvl: 5000.4,
    pool_price: 0.5,
    volatility: 0.123456,
    volume: 10000,
    fee: 50.7,
    fee_active_tvl_ratio: 0.5,
    active_positions: 3,
    active_positions_pct: 50,
    open_positions: 4,
    base_token_has_critical_warnings: false,
    quote_token_has_critical_warnings: false,
    base_token_has_high_supply_concentration: false,
    base_token_has_high_single_ownership: false,
    dlmm_params: { bin_step: 20, collect_fee_mode: "both" },
    ...over,
  }) as DiscoveryPool;

describe("parseTimeframe", () => {
  it("normalizes valid timeframes", () => {
    expect(parseTimeframe("5m")).toBe("5m");
    expect(parseTimeframe("1H")).toBe("1h");
    expect(parseTimeframe(" 30m ")).toBe("30m");
  });
  it("rejects invalid", () => {
    expect(parseTimeframe("bad")).toBeNull();
    expect(parseTimeframe(undefined)).toBeNull();
  });
});

describe("buildDiscoveryFilter", () => {
  it("emits the fixed base filters when empty", () => {
    expect(buildDiscoveryFilter(undefined)).toBe(
      "base_token_has_critical_warnings=false&&quote_token_has_critical_warnings=false&&pool_type=dlmm",
    );
  });
  it("appends configured filters", () => {
    const f = buildDiscoveryFilter({ minTvl: 5000, minBinStep: 20, solPairOnly: true });
    expect(f).toContain("tvl>=5000");
    expect(f).toContain("dlmm_bin_step>=20");
    expect(f).toContain("So11111111111111111111111111111111111111112");
  });
});

describe("scoreCandidate", () => {
  it("uses the fixed weighting", () => {
    expect(scoreCandidate(pool())).toBeCloseTo(0.5 * 1000 + 60 * 10 + 10000 / 100 + 1000 / 100, 6);
  });
});

describe("condensePool", () => {
  it("rounds, fixes and falls back", () => {
    const c = condensePool(pool());
    expect(c.pool).toBe("PoolAddr");
    expect(c.tvl).toBe(10001);
    expect(c.mcap).toBe(1000000);
    expect(c.volatility).toBe(0.1235);
    expect(c.binStep).toBe(20);
    expect(c.priceChangePct).toBeNull();
    expect(c.tokenAgeHours).toBe(5);
  });
});

describe("finalizeScreen", () => {
  it("sorts by score desc and slices", () => {
    const low = pool({ pool_address: "low", fee_active_tvl_ratio: 0.1 });
    const high = pool({ pool_address: "high", fee_active_tvl_ratio: 0.9 });
    const r = finalizeScreen([low, high], 2, 1);
    expect(r.pools).toHaveLength(1);
    expect(r.pools[0].pool).toBe("high");
    expect(r.total).toBe(2);
  });
});
