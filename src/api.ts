import type {
  OpenPortfolioResponse,
  ClosedPortfolioResponse,
  PortfolioTotal,
  DlmmPool,
  DlmmPoolsResponse,
  PoolHistoricalVolume,
} from "./types.js";

const PROD = "https://dlmm.datapi.meteora.ag";
const DEV = "https://dlmm.dev.metdev.io";

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
    minMarketCap?: number;
    minHolders?: number;
    verified?: boolean;
  }): Promise<DlmmPoolsResponse> {
    const sortBy = opts?.sortBy?.includes(":") ? opts.sortBy : (opts?.sortBy ? `${opts.sortBy}:desc` : "fee_tvl_ratio_24h:desc");
    const res = await this.get<DlmmPoolsResponse>("/pools", {
      sort_by: sortBy,
      query: opts?.query,
      page: opts?.page ?? 1,
      page_size: opts?.pageSize,
      min_market_cap: opts?.minMarketCap,
      min_holders: opts?.minHolders,
      verified: opts?.verified === true ? 1 : undefined,
    });
    return res;
  }

  poolHistoricalVolume(address: string): Promise<PoolHistoricalVolume[]> {
    return this.get<PoolHistoricalVolume[]>(`/pools/${address}/historical-volume`, {});
  }
}
