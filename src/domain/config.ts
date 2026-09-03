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
	minVolume24h?: number;
	maxVolume24h?: number;
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
	xAmount?: number | null;
	yAmount?: number | null;
	autoSwap?: boolean;
	slippageBps?: number;
}

export interface AgentLlmConfig {
	baseUrl?: string;
	apiKey?: string;
	model?: string;
	timeoutMs?: number;
}

export interface AgentRiskConfig {
	enabled?: boolean;
	minTokenFeesSol?: number;
	maxBundlePct?: number;
	maxBotHoldersPct?: number;
	maxTop10Pct?: number;
	/** Min distance below ATH (%) — block opens closer than this. */
	minFromAthPct?: number;
	maxRugScore?: number;
	blockWash?: boolean;
	blockRugpull?: boolean;
	blockDexScreenerPaid?: boolean;
	blockDevSoldAll?: boolean;
}

export interface AgentDarwinConfig {
	enabled?: boolean;
	windowDays?: number;
	recalcEvery?: number;
	boostFactor?: number;
	decayFactor?: number;
	weightFloor?: number;
	weightCeiling?: number;
	minSamples?: number;
}

export type NotifLevel = "verbose" | "normal" | "errors-only";

export interface AgentConfig {
	enabled?: boolean;
	intervalMinutes?: number;
	maxCandidates?: number;
	/** @deprecated No longer gates opening — the LLM decides. Kept for config-file compatibility. */
	minCandidate?: number;
	maxSolPerPosition?: number;
	maxTotalSol?: number;
	maxOpenPositions?: number;
	txCooldownMs?: number;
	poolCooldownMs?: number;
	tpPct?: number;
	slPct?: number;
	/** @deprecated Notifications are always sent; kept for config-file compatibility. */
	notifLevel?: NotifLevel;
	llm?: AgentLlmConfig;
	risks?: AgentRiskConfig;
	darwin?: AgentDarwinConfig;
}

export interface WebConfig {
	port?: number | null;
	password?: string;
}

export interface VexisConfig {
	wallet?: string;
	privateKey?: string;
	rpcUrl?: string;
	dev?: boolean;
	pageSize?: number | null;
	telegramBotToken?: string;
	telegramChatId?: string;
	alertInterval?: number | null;
	stopLossPct?: number | null;
	takeProfitPct?: number | null;
	create?: CreateConfig;
	pools?: PoolsConfig;
	agent?: AgentConfig;
	web?: WebConfig;
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
	xAmount?: number | null;
	yAmount?: number | null;
	autoSwap: boolean;
	slippageBps: number;
}
