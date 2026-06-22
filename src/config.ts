// Config loading. Looks for a config file in (first match wins):
//   1. $VEXIS_CONFIG (explicit path)
//   2. ./vexis.config.json   (current directory)
//   3. ~/.vexis/config.json  (home directory)
import { readFileSync, existsSync } from "node:fs";
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
  /** Pool screening and display config. */
  pools?: {
    /** Page size for API requests (default: 50). */
    pageSize?: number;
    /** Screening timeframe (default: "5m"). */
    timeframe?: string;
    /** Pool category: "trending" | "new" | "top" (default: "trending"). */
    category?: string;

    // --- Screening thresholds ---
    minMcap?: number;
    maxMcap?: number;
    minHolders?: number;
    minVolume?: number;
    minTvl?: number;
    maxTvl?: number;
    minBinStep?: number;
    maxBinStep?: number;
    minFeeActiveTvlRatio?: number;
    minOrganic?: number;
    minQuoteOrganic?: number;
    excludeHighSupplyConcentration?: boolean;
    minTokenAgeHours?: number | null;
    maxTokenAgeHours?: number | null;
    blockedLaunchpads?: string[];

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
