export interface PoolsConfig {
  pageSize?: number;
  timeframe?: string;
  category?: string;

  baseTokenHasHighSupplyConcentration?: boolean;
  baseTokenHasHighSingleOwnership?: boolean;
  minMcap?: number;
  maxMcap?: number;
  minHolders?: number;
  maxHolders?: number;
  minOrganic?: number;
  maxOrganic?: number;
  minTokenAgeHours?: number | null;
  maxTokenAgeHours?: number | null;
  blockedLaunchpads?: string[];

  minQuoteOrganic?: number;
  maxQuoteOrganic?: number;

  minTvl?: number;
  maxTvl?: number;
  minActiveTvl?: number;
  maxActiveTvl?: number;
  minVolume?: number;
  maxVolume?: number;
  minFee?: number;
  maxFee?: number;
  minFeeActiveTvlRatio?: number;
  maxFeeActiveTvlRatio?: number;
  minBinStep?: number;
  maxBinStep?: number;
  minVolatility?: number;
  maxVolatility?: number;
  minPoolPrice?: number;
  maxPoolPrice?: number;
  minActivePositions?: number;
  maxActivePositions?: number;
  minOpenPositions?: number;
  maxOpenPositions?: number;
  minSwapCount?: number;
  maxSwapCount?: number;
  minUniqueTraders?: number;
  maxUniqueTraders?: number;
  minPriceChangePct?: number;
  maxPriceChangePct?: number;
  minVolumeChangePct?: number;
  maxVolumeChangePct?: number;
  priceTrend?: string;
  solPairOnly?: boolean;

  displayLimit?: number;
}

export interface CreateConfig {
  strategy?: "spot" | "bidask" | "curve";
  mode?: "two-sided" | "single-x" | "single-y";
  range?: {
    type: "default" | "bin" | "pct";
    minBin?: number;
    maxBin?: number;
    minPct?: number;
    maxPct?: number;
  };
  amountPresets?: number[];
  xAmount?: number;
  yAmount?: number;
  autoSwap?: boolean;
  slippageBps?: number;
}

export interface VexisConfig {
  wallet?: string;
  privateKey?: string;
  rpcUrl?: string;
  dev?: boolean;
  pageSize?: number;
  telegramBotToken?: string;
  telegramChatId?: string;
  alertInterval?: number;
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  create?: CreateConfig;
  pools?: PoolsConfig;
}

export interface CreatePreset {
  strategy: "spot" | "bidask" | "curve";
  mode: "two-sided" | "single-x" | "single-y";
  range: {
    type: "default" | "bin" | "pct";
    minBin?: number;
    maxBin?: number;
    minPct?: number;
    maxPct?: number;
  };
  amountPresets: number[];
  xAmount?: number;
  yAmount?: number;
  autoSwap: boolean;
  slippageBps: number;
}
