export type FieldType = "number" | "string" | "boolean" | "enum" | "list";
export type Section = "general" | "agent" | "create" | "pools";

export interface EditableField {
	readonly path: string;
	readonly label: string;
	readonly type: FieldType;
	readonly values?: readonly string[];
	readonly section: Section;
	readonly itemType?: "number" | "string";
}

export interface SettingsPayload {
	readonly ok: boolean;
	readonly error?: string;
	readonly configPath: string | null;
	readonly wallet?: string;
	readonly rpc?: string;
	readonly agent: {
		readonly enabled: boolean;
		readonly running: boolean;
		readonly lastCycleAt: string | null;
	};
	readonly values: Record<string, unknown>;
}

export const SECRET_PATHS: readonly string[] = [
	"privateKey",
	"telegramBotToken",
	"telegramChatId",
	"web.password",
	"agent.llm.apiKey",
];

const field = (
	path: string,
	label: string,
	type: FieldType,
	section: Section,
	extra: Partial<EditableField> = {},
): EditableField => ({ path, label, type, section, ...extra });

export const EDITABLE_FIELDS: readonly EditableField[] = [
	// General
	field("wallet", "Wallet", "string", "general"),
	field("rpcUrl", "RPC URL", "string", "general"),
	field("dev", "Dev Mode", "boolean", "general"),
	field("stopLossPct", "Stop Loss %", "number", "general"),
	field("takeProfitPct", "Take Profit %", "number", "general"),
	field("alertInterval", "Alert Interval (min)", "number", "general"),
	field("pageSize", "Page Size", "number", "general"),
	// Agent
	field("agent.enabled", "Agent Enabled", "boolean", "agent"),
	field("agent.intervalMinutes", "Interval (min)", "number", "agent"),
	field("agent.maxCandidates", "Max Candidates", "number", "agent"),
	field("agent.maxSolPerPosition", "Max SOL / Position", "number", "agent"),
	field("agent.maxTotalSol", "Max Total SOL", "number", "agent"),
	field("agent.maxOpenPositions", "Max Open Positions", "number", "agent"),
	field("agent.txCooldownMs", "Tx Cooldown (ms)", "number", "agent"),
	field("agent.poolCooldownMs", "Pool Cooldown (ms)", "number", "agent"),
	field("agent.tpPct", "Take Profit %", "number", "agent"),
	field("agent.slPct", "Stop Loss %", "number", "agent"),
	field("agent.llm.baseUrl", "LLM Base URL", "string", "agent"),
	field("agent.llm.model", "LLM Model", "string", "agent"),
	field("agent.llm.timeoutMs", "LLM Timeout (ms)", "number", "agent"),
	field("agent.risks.enabled", "Guardrails Enabled", "boolean", "agent"),
	field(
		"agent.risks.minTokenFeesSol",
		"Min Token Fees (SOL)",
		"number",
		"agent",
	),
	field("agent.risks.maxBundlePct", "Max Bundle %", "number", "agent"),
	field("agent.risks.maxBotHoldersPct", "Max Bot Holders %", "number", "agent"),
	field("agent.risks.maxTop10Pct", "Max Top10 %", "number", "agent"),
	field("agent.risks.minFromAthPct", "Min From ATH %", "number", "agent"),
	field("agent.risks.maxRugScore", "Max RugCheck Score", "number", "agent"),
	field("agent.risks.blockWash", "Block Wash Trading", "boolean", "agent"),
	field("agent.risks.blockRugpull", "Block Rugpull", "boolean", "agent"),
	field(
		"agent.risks.blockDexScreenerPaid",
		"Block DexScreener Paid",
		"boolean",
		"agent",
	),
	field(
		"agent.risks.blockDevSoldAll",
		"Block Dev Sold All",
		"boolean",
		"agent",
	),
	field("agent.darwin.enabled", "Darwin Enabled", "boolean", "agent"),
	field("agent.darwin.windowDays", "Darwin Window (days)", "number", "agent"),
	field("agent.darwin.recalcEvery", "Darwin Recalc Every", "number", "agent"),
	field("agent.darwin.boostFactor", "Darwin Boost Factor", "number", "agent"),
	field("agent.darwin.decayFactor", "Darwin Decay Factor", "number", "agent"),
	field("agent.darwin.weightFloor", "Darwin Weight Floor", "number", "agent"),
	field(
		"agent.darwin.weightCeiling",
		"Darwin Weight Ceiling",
		"number",
		"agent",
	),
	field("agent.darwin.minSamples", "Darwin Min Samples", "number", "agent"),
	// Create
	field("create.strategy", "Strategy", "enum", "create", {
		values: ["spot", "bidask", "curve"],
	}),
	field("create.mode", "Mode", "enum", "create", {
		values: ["two-sided", "single-x", "single-y"],
	}),
	field("create.range.type", "Range Type", "enum", "create", {
		values: ["default", "bin", "pct"],
	}),
	field("create.range.minBin", "Range Min Bin", "number", "create"),
	field("create.range.maxBin", "Range Max Bin", "number", "create"),
	field("create.range.minPct", "Range Min %", "number", "create"),
	field("create.range.maxPct", "Range Max %", "number", "create"),
	field("create.amountPresets", "Amount Presets", "list", "create", {
		itemType: "number",
	}),
	field("create.xAmount", "Default X Amt", "number", "create"),
	field("create.yAmount", "Default Y Amt", "number", "create"),
	field("create.autoSwap", "Auto Swap", "boolean", "create"),
	field("create.slippageBps", "Slippage (bps)", "number", "create"),
	// Pools
	field("pools.pageSize", "Page Size", "number", "pools"),
	field("pools.timeframe", "Timeframe", "string", "pools"),
	field("pools.category", "Category", "string", "pools"),
	field(
		"pools.baseTokenHasHighSupplyConcentration",
		"High Supply Conc.",
		"boolean",
		"pools",
	),
	field(
		"pools.baseTokenHasHighSingleOwnership",
		"High Single Owner",
		"boolean",
		"pools",
	),
	field("pools.minMcap", "Min Market Cap", "number", "pools"),
	field("pools.maxMcap", "Max Market Cap", "number", "pools"),
	field("pools.minHolders", "Min Holders", "number", "pools"),
	field("pools.maxHolders", "Max Holders", "number", "pools"),
	field("pools.minOrganic", "Min Organic", "number", "pools"),
	field("pools.maxOrganic", "Max Organic", "number", "pools"),
	field("pools.minTokenAgeHours", "Min Token Age (h)", "number", "pools"),
	field("pools.maxTokenAgeHours", "Max Token Age (h)", "number", "pools"),
	field("pools.blockedLaunchpads", "Blocked Launchpads", "list", "pools", {
		itemType: "string",
	}),
	field("pools.minQuoteOrganic", "Min Quote Organic", "number", "pools"),
	field("pools.maxQuoteOrganic", "Max Quote Organic", "number", "pools"),
	field("pools.minTvl", "Min TVL", "number", "pools"),
	field("pools.maxTvl", "Max TVL", "number", "pools"),
	field("pools.minActiveTvl", "Min Active TVL", "number", "pools"),
	field("pools.maxActiveTvl", "Max Active TVL", "number", "pools"),
	field("pools.minVolume", "Min Volume", "number", "pools"),
	field("pools.maxVolume", "Max Volume", "number", "pools"),
	field("pools.minVolume24h", "Min Vol 24h", "number", "pools"),
	field("pools.maxVolume24h", "Max Vol 24h", "number", "pools"),
	field("pools.minFee", "Min Fee ($)", "number", "pools"),
	field("pools.maxFee", "Max Fee ($)", "number", "pools"),
	field("pools.minFeeActiveTvlRatio", "Min Fee/TVL", "number", "pools"),
	field("pools.maxFeeActiveTvlRatio", "Max Fee/TVL", "number", "pools"),
	field("pools.minBinStep", "Min Bin Step", "number", "pools"),
	field("pools.maxBinStep", "Max Bin Step", "number", "pools"),
	field("pools.minVolatility", "Min Volatility", "number", "pools"),
	field("pools.maxVolatility", "Max Volatility", "number", "pools"),
	field("pools.minPoolPrice", "Min Pool Price", "number", "pools"),
	field("pools.maxPoolPrice", "Max Pool Price", "number", "pools"),
	field("pools.minActivePositions", "Min Active Positions", "number", "pools"),
	field("pools.maxActivePositions", "Max Active Positions", "number", "pools"),
	field("pools.minOpenPositions", "Min Open Positions", "number", "pools"),
	field("pools.maxOpenPositions", "Max Open Positions", "number", "pools"),
	field("pools.minSwapCount", "Min Swaps", "number", "pools"),
	field("pools.maxSwapCount", "Max Swaps", "number", "pools"),
	field("pools.minUniqueTraders", "Min Traders", "number", "pools"),
	field("pools.maxUniqueTraders", "Max Traders", "number", "pools"),
	field("pools.minPriceChangePct", "Min Price Chg %", "number", "pools"),
	field("pools.maxPriceChangePct", "Max Price Chg %", "number", "pools"),
	field("pools.minVolumeChangePct", "Min Vol Chg %", "number", "pools"),
	field("pools.maxVolumeChangePct", "Max Vol Chg %", "number", "pools"),
	field("pools.priceTrend", "Price Trend", "string", "pools"),
	field("pools.solPairOnly", "SOL Pair Only", "boolean", "pools"),
	field("pools.displayLimit", "Display Limit", "number", "pools"),
];

export interface SettingsPayload {
	readonly ok: boolean;
	readonly error?: string;
	readonly configPath: string | null;
	readonly agent: {
		readonly enabled: boolean;
		readonly running: boolean;
		readonly lastCycleAt: string | null;
	};
	readonly values: Record<string, unknown>;
}
