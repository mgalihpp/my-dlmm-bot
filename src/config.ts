// Config loading. Looks for a config file in (first match wins):
//   1. $VEXIS_CONFIG (explicit path)
//   2. ./vexis.config.json   (current directory)
//   3. ~/.vexis/config.json  (home directory)
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";

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
  const privateKeyBase58 = process.env.VEXIS_PRIVATE_KEY || config.privateKey;
  if (!privateKeyBase58) {
    throw new Error(
      "No private key found. Set VEXIS_PRIVATE_KEY env var or privateKey in vexis.config.json."
    );
  }
  try {
    return Keypair.fromSecretKey(Buffer.from(privateKeyBase58, "base64"));
  } catch {
    throw new Error("Invalid private key format (expected base64 or solana CLI base58).");
  }
}

/** Get RPC URL: config.rpcUrl → mainnet-beta default. */
export function resolveRpc(config: VexisConfig): string {
  return config.rpcUrl || "https://api.mainnet-beta.solana.com";
}
