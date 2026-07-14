import { Context, Effect, Layer, Ref } from "effect";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import type { CreatePreset, VexisConfig } from "../domain/config.js";
import { ConfigError, SignerError, WalletError } from "../errors.js";

function candidatePaths(): string[] {
  const paths: string[] = [];
  if (process.env.VEXIS_CONFIG) paths.push(process.env.VEXIS_CONFIG);
  paths.push(join(process.cwd(), "vexis.config.json"));
  paths.push(join(homedir(), ".vexis", "config.json"));
  return paths;
}

export function loadConfigSync(): { config: VexisConfig; path: string | null } {
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

export interface AppConfigService {
  readonly get: Effect.Effect<VexisConfig>;
  readonly path: string | null;
  readonly update: (patch: (c: VexisConfig) => VexisConfig) => Effect.Effect<VexisConfig, ConfigError>;
  readonly save: Effect.Effect<void, ConfigError>;
  readonly wallet: (arg?: string) => Effect.Effect<string, WalletError>;
  readonly keypair: Effect.Effect<Keypair, SignerError>;
  readonly rpcUrl: Effect.Effect<string>;
  readonly botToken: Effect.Effect<string, ConfigError>;
  readonly chatId: Effect.Effect<string | undefined>;
  readonly createPreset: Effect.Effect<CreatePreset>;
}

export class AppConfig extends Context.Tag("AppConfig")<AppConfig, AppConfigService>() {}

export const resolveKeypairFrom = (config: VexisConfig): Keypair => {
  const rawKey = process.env.VEXIS_PRIVATE_KEY || config.privateKey;
  if (!rawKey) {
    throw new Error("No private key found. Set VEXIS_PRIVATE_KEY env var or privateKey in vexis.config.json.");
  }
  try {
    return Keypair.fromSecretKey(Buffer.from(rawKey, "base64"));
  } catch {}
  try {
    return Keypair.fromSecretKey(bs58.decode(rawKey));
  } catch {}
  throw new Error("Invalid private key format (expected base64 or base58).");
};

export const resolveCreatePresetFrom = (config: VexisConfig): CreatePreset => {
  const c = config.create ?? {};
  return {
    strategy: c.strategy ?? "bidask",
    mode: c.mode ?? "single-y",
    range: c.range ?? { type: "default" },
    amountPresets: c.amountPresets && c.amountPresets.length > 0 ? c.amountPresets : [0.1, 0.25, 0.5, 1],
    xAmount: c.xAmount,
    yAmount: c.yAmount,
    autoSwap: c.autoSwap ?? false,
    slippageBps: c.slippageBps ?? 100,
  };
};

const make = (initial: VexisConfig, path: string | null): Effect.Effect<AppConfigService> =>
  Effect.gen(function* () {
    const ref = yield* Ref.make(initial);

    const persist = (config: VexisConfig): Effect.Effect<void, ConfigError> =>
      path === null
        ? Effect.fail(new ConfigError({ message: "No config file to save to. Create vexis.config.json first." }))
        : Effect.try({
            try: () => writeFileSync(path, JSON.stringify(config, null, 2), "utf8"),
            catch: (e) => new ConfigError({ message: `Failed to save config: ${e instanceof Error ? e.message : e}` }),
          });

    const service: AppConfigService = {
      get: Ref.get(ref),
      path,
      update: (patch) =>
        Ref.updateAndGet(ref, patch).pipe(
          Effect.tap((c) => persist(c)),
        ),
      save: Ref.get(ref).pipe(Effect.flatMap(persist)),
      wallet: (arg?: string) =>
        Ref.get(ref).pipe(
          Effect.flatMap((c) => {
            if (arg) return Effect.succeed(arg);
            if (c.wallet) return Effect.succeed(c.wallet);
            return Effect.fail(
              new WalletError({
                message: "No wallet given and no default in config. Pass a wallet address or set one in vexis.config.json.",
              }),
            );
          }),
        ),
      keypair: Ref.get(ref).pipe(
        Effect.flatMap((c) =>
          Effect.try({
            try: () => resolveKeypairFrom(c),
            catch: (e) => new SignerError({ message: e instanceof Error ? e.message : String(e) }),
          }),
        ),
      ),
      rpcUrl: Ref.get(ref).pipe(Effect.map((c) => c.rpcUrl || "https://api.mainnet-beta.solana.com")),
      botToken: Ref.get(ref).pipe(
        Effect.flatMap((c) => {
          const token = process.env.TELEGRAM_BOT_TOKEN || c.telegramBotToken;
          if (!token) {
            return Effect.fail(
              new ConfigError({
                message: "No Telegram bot token. Set TELEGRAM_BOT_TOKEN env var or telegramBotToken in vexis.config.json.",
              }),
            );
          }
          return Effect.succeed(token);
        }),
      ),
      chatId: Ref.get(ref).pipe(Effect.map((c) => process.env.TELEGRAM_CHAT_ID || c.telegramChatId)),
      createPreset: Ref.get(ref).pipe(Effect.map(resolveCreatePresetFrom)),
    };
    return service;
  });

export const AppConfigLive = Layer.effect(
  AppConfig,
  Effect.try({
    try: () => loadConfigSync(),
    catch: (e) => new ConfigError({ message: e instanceof Error ? e.message : String(e) }),
  }).pipe(Effect.flatMap(({ config, path }) => make(config, path))),
);

export const AppConfigTest = (config: VexisConfig, path: string | null = null) =>
  Layer.effect(AppConfig, make(config, path));
