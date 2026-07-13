import type {
  OpenPortfolioResponse,
  OpenPool,
  ClosedPortfolioResponse,
  PortfolioTotal,
  DlmmPool,
  DlmmPoolsResponse,
  PoolHistoricalVolume,
  DiscoveryPoolsResponse,
  PositionPnLResponse,
} from "./types.js";

type PositionStatus = "open" | "closed" | "all";

const PROD = "https://dlmm.datapi.meteora.ag";
const DEV = "https://dlmm.dev.metdev.io";
const DISCOVERY_API = "https://pool-discovery-api.datapi.meteora.ag";

export interface ClientOptions {
  dev?: boolean;
}

export class MeteoraClient {
  private base: string;

  constructor(opts: ClientOptions = {}) {
    this.base = opts.dev ? DEV : PROD;
  }

  private async get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(path, this.base);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Meteora API ${res.status} ${res.statusText} for ${path}${body ? `: ${body}` : ""}`);
    }
    return (await res.json()) as T;
  }

  totalPnl(user: string): Promise<PortfolioTotal> {
    return this.get<PortfolioTotal>("/portfolio/total", { user });
  }

  openPortfolio(user: string, page = 1, pageSize = 50): Promise<OpenPortfolioResponse> {
    return this.get<OpenPortfolioResponse>("/portfolio/open", {
      user,
      page,
      page_size: pageSize,
    });
  }

  closedPortfolio(user: string, page = 1, pageSize = 50): Promise<ClosedPortfolioResponse> {
    return this.get<ClosedPortfolioResponse>("/portfolio", {
      user,
      page,
      page_size: pageSize,
    });
  }

  pool(address: string): Promise<DlmmPool> {
    return this.get<DlmmPool>(`/pools/${address}`, {});
  }

  async pools(opts?: {
    sortBy?: string;
    query?: string;
    page?: number;
    pageSize?: number;
    filterBy?: string;
  }): Promise<DlmmPoolsResponse> {
    const sortBy = opts?.sortBy?.includes(":") ? opts.sortBy : (opts?.sortBy ? `${opts.sortBy}:desc` : "fee_tvl_ratio_24h:desc");
    const res = await this.get<DlmmPoolsResponse>("/pools", {
      sort_by: sortBy,
      query: opts?.query,
      page: opts?.page ?? 1,
      page_size: opts?.pageSize,
      filter_by: opts?.filterBy,
    });
    return res;
  }

  positionPnl(
    poolAddress: string,
    user: string,
    status?: PositionStatus,
    page?: number,
    pageSize?: number,
  ): Promise<PositionPnLResponse> {
    return this.get<PositionPnLResponse>(`/positions/${poolAddress}/pnl`, {
      user,
      status: status ?? "all",
      page: page ?? 1,
      page_size: pageSize ?? 100,
    });
  }

  /** Enrich pool-level PnL with per-position aggregated PnL for accuracy. */
  async enrichOpenPortfolioPnl(
    pools: OpenPool[],
    wallet: string,
  ): Promise<OpenPool[]> {
    const enriched = pools.map(p => ({ ...p }));

    await Promise.allSettled(
      enriched.map(async (pool) => {
        try {
          const originalPnlPctChange = pool.pnlPctChange;
          const originalPnlSolPctChange = pool.pnlSolPctChange;
          const res = await this.positionPnl(pool.poolAddress, wallet, "open");
          if (res.positions.length === 0) return;

          let totalPnlUsd = 0, totalDepositsUsd = 0;
          let totalPnlSol = 0, totalDepositsSol = 0;

          for (const pos of res.positions) {
            totalPnlUsd += parseFloat(pos.pnlUsd || "0");
            totalDepositsUsd += parseFloat(pos.allTimeDeposits.total.usd || "0");
            totalPnlSol += pos.pnlSol ?? 0;
            totalDepositsSol += parseFloat(pos.allTimeDeposits.total.sol ?? "0");
          }

          pool.pnl = String(totalPnlUsd);
          pool.pnlSol = String(totalPnlSol);
          pool.pnlPctChange = originalPnlPctChange;
          pool.pnlSolPctChange = originalPnlSolPctChange;
          pool.positionsPnl = res.positions.map((pos) => ({
            address: pos.positionAddress,
            pnlUsd: pos.pnlUsd,
            pnlPctChange: pos.pnlPctChange,
            pnlSol: pos.pnlSol != null ? String(pos.pnlSol) : null,
            pnlSolPctChange: pos.pnlSolPctChange != null ? String(pos.pnlSolPctChange) : null,
          }));
        } catch {
          // keep original pool-level PnL if position fetch fails
        }
      })
    );

    return enriched;
  }

  poolHistoricalVolume(address: string): Promise<PoolHistoricalVolume[]> {
    return this.get<PoolHistoricalVolume[]>(`/pools/${address}/historical-volume`, {});
  }

  async discoverPools(opts?: {
    pageSize?: number;
    filterBy?: string;
    timeframe?: string;
    category?: string;
  }): Promise<DiscoveryPoolsResponse> {
    const url = new URL("/pools", DISCOVERY_API);
    url.searchParams.set("page_size", String(opts?.pageSize ?? 50));
    if (opts?.filterBy) url.searchParams.set("filter_by", opts.filterBy);
    if (opts?.timeframe) url.searchParams.set("timeframe", opts.timeframe);
    if (opts?.category) url.searchParams.set("category", opts.category);
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Pool Discovery API ${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
    }
    return (await res.json()) as DiscoveryPoolsResponse;
  }
}
