export interface ScreenedPool {
  pool: string;
  name: string;
  baseSymbol: string;
  baseMint: string;
  quoteSymbol: string;
  tvl: number;
  activeTvl: number;
  mcap: number;
  holders: number;
  organicScore: number;
  quoteOrganic: number;
  feeActiveTvlRatio: number;
  volatility: number;
  binStep: number;
  baseFeePct: number;
  volume: number;
  fee: number;
  activePositions: number;
  openPositions: number;
  tokenAgeHours: number | null;
  score: number;
  price: number;
  priceChangePct: number | null;
  volumeChangePct: number | null;
  tokenXAddress: string;
  rugScore?: number | null;
}
