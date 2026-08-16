import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VexisConfig } from "@vexis/domain/config.js";
import { loadConfigSync } from "@vexis/services/Config.js";
import type { AgentState } from "@vexis/telegram/agent/state.js";
import { loadState } from "@vexis/telegram/agent/state.js";
import { z } from "zod";
import { repoRoot } from "~/lib/server/env.server";

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

export function getNested(obj: unknown, path: string): unknown {
	return path
		.split(".")
		.reduce<unknown>(
			(o, k) =>
				o !== null && typeof o === "object"
					? (o as Record<string, unknown>)[k]
					: undefined,
			obj,
		);
}

export function setNested(
	obj: Record<string, unknown>,
	path: string,
	value: unknown,
): void {
	const keys = path.split(".");
	let cur = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		const k = keys[i];
		if (cur[k] === null || typeof cur[k] !== "object") cur[k] = {};
		cur = cur[k] as Record<string, unknown>;
	}
	cur[keys[keys.length - 1]] = value;
}

export function stripSecrets(config: VexisConfig): void {
	for (const path of SECRET_PATHS) {
		const keys = path.split(".");
		let cur = config as unknown as Record<string, unknown>;
		for (let i = 0; i < keys.length - 1; i++) {
			const next = cur[keys[i]];
			if (next === null || typeof next !== "object") {
				cur = {};
				break;
			}
			cur = next as Record<string, unknown>;
		}
		delete cur[keys[keys.length - 1]];
	}
}

function listSchema(
	itemType: "number" | "string" | undefined,
): z.ZodType<unknown> {
	const base =
		itemType === "number"
			? z.array(z.coerce.number().finite())
			: z.array(z.string());
	return z.preprocess(
		(v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()) : v),
		base,
	);
}

export function parseFieldValue(field: EditableField, raw: unknown): unknown {
	const base = (() => {
		switch (field.type) {
			case "number":
				return z.coerce.number().finite();
			case "boolean":
				return z.union([
					z.boolean(),
					z.literal("true").transform(() => true),
					z.literal("false").transform(() => false),
				]);
			case "string":
				return z.string();
			case "enum":
				return z.enum(field.values as [string, ...string[]]);
			case "list":
				return listSchema(field.itemType);
		}
	})();
	return base.parse(raw);
}

export function buildSettingsPayload(
	config: VexisConfig,
	configPath: string | null,
	agentState: AgentState,
): SettingsPayload {
	stripSecrets(config);
	const values: Record<string, unknown> = {};
	for (const f of EDITABLE_FIELDS) {
		values[f.path] = getNested(config, f.path) ?? null;
	}
	return {
		ok: true,
		configPath,
		agent: {
			enabled: agentState.enabled,
			running: agentState.running,
			lastCycleAt: agentState.lastCycleAt,
		},
		values,
	};
}

function agentFile(): string {
	return join(repoRoot(), ".vexis-agent.json");
}

export function fetchSettings(): SettingsPayload {
	const { config, path } = loadConfigSync();
	return buildSettingsPayload(config, path, loadState(agentFile()));
}

function persist(config: VexisConfig, configPath: string): void {
	writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

export function saveField(
	configPath: string,
	field: EditableField,
	value: unknown,
): SettingsPayload {
	const { config } = loadConfigSync();
	const next = structuredClone(config);
	setNested(next as Record<string, unknown>, field.path, value);
	persist(next, configPath);
	return buildSettingsPayload(next, configPath, loadState(agentFile()));
}

export function resetField(
	configPath: string,
	field: EditableField,
): SettingsPayload {
	const { config } = loadConfigSync();
	const next = structuredClone(config);
	setNested(next as Record<string, unknown>, field.path, null);
	persist(next, configPath);
	return buildSettingsPayload(next, configPath, loadState(agentFile()));
}

export function setAgentEnabled(
	configPath: string,
	enabled: boolean,
): SettingsPayload {
	const { config } = loadConfigSync();
	const next = structuredClone(config);
	next.agent = { ...next.agent, enabled };
	persist(next, configPath);
	return buildSettingsPayload(next, configPath, loadState(agentFile()));
}
