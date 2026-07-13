// Config loading. Looks for a config file in (first match wins):
//   1. $VEXIS_CONFIG (explicit path)
//   2. ./vexis.config.json   (current directory)
//   3. ~/.vexis/config.json  (home directory)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export interface VexisConfig {
  /** Default wallet address used when none is passed on the CLI. */
  wallet?: string;
  /** Private key (base58) for on-chain operations. */
  privateKey?: string;
  /** RPC endpoint (defaults to mainnet-beta if not set). */
  rpcUrl?: string;
  /** Use the dev API server by default. */
  dev?: boolean;
  /** Default page size (max 50). */
  pageSize?: number;
  /** Telegram bot token (from @BotFather). */
  telegramBotToken?: string;
  /** Authorized Telegram chat ID — bot ignores all other chats. */
  telegramChatId?: string;
  /** Periodic portfolio alert interval in hours (0 = off). */
  alertInterval?: number;
  /** Global stop-loss threshold on PnL % (SOL). Alerts when any open position's
   *  PnL % ≤ this value. null/undefined = off. e.g. -10 */
  stopLossPct?: number | null;
  /** Global take-profit threshold on PnL % (SOL). Alerts when any open position's
   *  PnL % ≥ this value. null/undefined = off. e.g. 25 */
  takeProfitPct?: number | null;
  /** Default preset for /create — powers the ⚡ Quick button and amount presets. */
  create?: {
    /** Default strategy. Default: "spot". */
    strategy?: "spot" | "bidask" | "curve";
    /** Default side/mode. Default: "two-sided". */
    mode?: "two-sided" | "single-x" | "single-y";
    /** Default range. type "default" uses the built-in bins for the mode. */
    range?: {
      type: "default" | "bin" | "pct";
      /** Relative bin ids (type "bin"), e.g. minBin -35, maxBin 34. */
      minBin?: number;
      maxBin?: number;
      /** Percent vs current price (type "pct"), as human percent e.g. -50, 0. */
      minPct?: number;
      maxPct?: number;
    };
    /** Tap-to-pick amount buttons for the primary side, e.g. [0.1, 0.25, 0.5, 1]. */
    amountPresets?: number[];
    /** Optional default X (base/meme) amount — enables one-tap Quick for two-sided. */
    xAmount?: number;
    /** Optional default Y (SOL/stable) amount — enables one-tap Quick. */
    yAmount?: number;
    /** Enable the ⚡🔄 Quick+Swap button: swap SOL→tokenX then deposit two-sided. */
    autoSwap?: boolean;
    /** Slippage tolerance for the auto-swap, in basis points (default 100 = 1%). */
    slippageBps?: number;
  };
  /** Pool screening and display config. */
  pools?: {
    /** Page size for API requests (default: 50). */
    pageSize?: number;
    /** Screening timeframe (default: "5m"). */
    timeframe?: string;
    /** Pool category: "trending" | "new" | "top" (default: "trending"). */
    category?: string;

    // --- Base token filters ---
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

    // --- Quote token filters ---
    minQuoteOrganic?: number;
    maxQuoteOrganic?: number;

    // --- Pool metrics filters ---
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

    // --- Display ---
    displayLimit?: number;
  };
}

function candidatePaths(): string[] {
  const paths: string[] = [];
  if (process.env.VEXIS_CONFIG) paths.push(process.env.VEXIS_CONFIG);
  paths.push(join(process.cwd(), "vexis.config.json"));
  paths.push(join(homedir(), ".vexis", "config.json"));
  return paths;
}

export function loadConfig(): { config: VexisConfig; path: string | null } {
  for (const p of candidatePaths()) {
    if (existsSync(p)) {
      try {
        const config = JSON.parse(readFileSync(p, "utf8")) as VexisConfig;
        return { config, path: p };
      } catch (e) {
        throw new Error(`Failed to parse config at ${p}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  return { config: {}, path: null };
}

/** Save config to disk (overwrites the file). */
export function saveConfig(configPath: string, config: VexisConfig): void {
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

/** Resolve which wallet to use: CLI arg → config default. */
export function resolveWallet(arg: string | undefined, config: VexisConfig): string {
  if (arg) return arg;
  if (config.wallet) return config.wallet;
  throw new Error(
    "No wallet given and no default in config. Pass a wallet address or set one in vexis.config.json."
  );
}

/** Load keypair for signing: env VEXIS_PRIVATE_KEY → config.privateKey. */
export function resolveKeypair(config: VexisConfig): Keypair {
  const rawKey = process.env.VEXIS_PRIVATE_KEY || config.privateKey;
  if (!rawKey) {
    throw new Error(
      "No private key found. Set VEXIS_PRIVATE_KEY env var or privateKey in vexis.config.json."
    );
  }
  // Try base64 first (wallet adapter format), then base58 (Solana CLI format)
  try {
    return Keypair.fromSecretKey(Buffer.from(rawKey, "base64"));
  } catch { /* not base64 */ }
  try {
    return Keypair.fromSecretKey(bs58.decode(rawKey));
  } catch { /* not base58 either */ }
  throw new Error("Invalid private key format (expected base64 or base58).");
}

/** Get RPC URL: config.rpcUrl → mainnet-beta default. */
export function resolveRpc(config: VexisConfig): string {
  return config.rpcUrl || "https://api.mainnet-beta.solana.com";
}

/** Get Telegram bot token: env TELEGRAM_BOT_TOKEN → config.telegramBotToken. */
export function resolveBotToken(config: VexisConfig): string {
  const token = process.env.TELEGRAM_BOT_TOKEN || config.telegramBotToken;
  if (!token) {
    throw new Error(
      "No Telegram bot token. Set TELEGRAM_BOT_TOKEN env var or telegramBotToken in vexis.config.json."
    );
  }
  return token;
}

/** Get authorized chat ID: env TELEGRAM_CHAT_ID → config.telegramChatId. */
export function resolveChatId(config: VexisConfig): string | undefined {
  return process.env.TELEGRAM_CHAT_ID || config.telegramChatId;
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

/** Resolve the /create preset, filling defaults for any missing field. */
export function resolveCreatePreset(config: VexisConfig): CreatePreset {
  const c = config.create ?? {};
  return {
    strategy: c.strategy ?? "bidask",
    mode: c.mode ?? "single-y",
    range: c.range ?? { type: "default" },
    amountPresets:
      c.amountPresets && c.amountPresets.length > 0
        ? c.amountPresets
        : [0.1, 0.25, 0.5, 1],
    xAmount: c.xAmount,
    yAmount: c.yAmount,
    autoSwap: c.autoSwap ?? false,
    slippageBps: c.slippageBps ?? 100,
  };
}
