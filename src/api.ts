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

function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: number): string {
  return Number.isFinite(value) ? String(value) : "0";
}

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

  async openPortfolioWithLivePnl(user: string, page = 1, pageSize = 50): Promise<OpenPortfolioResponse> {
    const portfolio = await this.openPortfolio(user, page, pageSize);
    const pools = await Promise.all(
      portfolio.pools.map((pool) => this.refreshOpenPoolPnl(pool, user)),
    );
    const total = portfolio.total
      ? {
          ...portfolio.total,
          pnl: str(pools.reduce((sum, p) => sum + num(p.pnl), 0)),
          pnlSol: pools.some((p) => p.pnlSol !== null)
            ? str(pools.reduce((sum, p) => sum + num(p.pnlSol), 0))
            : portfolio.total.pnlSol,
        }
      : portfolio.total;
    return { ...portfolio, pools, total };
  }

  private async refreshOpenPoolPnl(pool: OpenPool, user: string): Promise<OpenPool> {
    try {
      const pdata = await this.positionPnl(pool.poolAddress, user, "open");
      const positions = pdata.positions.filter((p) => !p.isClosed);
      if (positions.length === 0) return pool;

      const pnlUsd = positions.reduce((sum, p) => sum + num(p.pnlUsd), 0);
      const depositUsd = positions.reduce((sum, p) => sum + num(p.allTimeDeposits.total.usd), 0);
      const pnlSolValues = positions.map((p) => p.pnlSol).filter((v): v is number => v !== null && Number.isFinite(v));
      const pnlSol = pnlSolValues.length > 0 ? pnlSolValues.reduce((sum, v) => sum + v, 0) : null;
      const depositSol = positions.reduce((sum, p) => sum + num(p.allTimeDeposits.total.sol), 0);

      const rangeKnown = positions.some((p) => p.isOutOfRange !== null);
      return {
        ...pool,
        pnl: str(pnlUsd),
        pnlPctChange: depositUsd > 0 ? str((pnlUsd / depositUsd) * 100) : pool.pnlPctChange,
        pnlSol: pnlSol === null ? pool.pnlSol : str(pnlSol),
        pnlSolPctChange: pnlSol !== null && depositSol > 0 ? str((pnlSol / depositSol) * 100) : pool.pnlSolPctChange,
        positionsOutOfRange: positions.filter((p) => p.isOutOfRange).map((p) => p.positionAddress),
        outOfRange: rangeKnown ? positions.some((p) => p.isOutOfRange) : null,
      };
    } catch (e) {
      console.warn("[meteora] Failed to refresh live position PnL for pool", pool.poolAddress, e);
      return pool;
    }
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
