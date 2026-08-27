import { existsSync, readFileSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { Context, Effect, Layer, Ref } from "effect";
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
				throw new Error(
					`Failed to parse config at ${p}: ${e instanceof Error ? e.message : e}`,
				);
			}
		}
	}
	return { config: {}, path: null };
}

export function reloadConfigFile(path: string): VexisConfig {
	return JSON.parse(readFileSync(path, "utf8")) as VexisConfig;
}

export function agentEnabledTransition(
	prev: VexisConfig,
	next: VexisConfig,
): "start" | "stop" | null {
	const before = prev.agent?.enabled ?? false;
	const after = next.agent?.enabled ?? false;
	if (before === after) return null;
	return after ? "start" : "stop";
}

export interface AppConfigService {
	readonly get: Effect.Effect<VexisConfig>;
	readonly path: string | null;
	readonly update: (
		patch: (c: VexisConfig) => VexisConfig,
	) => Effect.Effect<VexisConfig, ConfigError>;
	readonly save: Effect.Effect<void, ConfigError>;
	readonly wallet: (arg?: string) => Effect.Effect<string, WalletError>;
	readonly keypair: Effect.Effect<Keypair, SignerError>;
	readonly rpcUrl: Effect.Effect<string>;
	readonly botToken: Effect.Effect<string, ConfigError>;
	readonly chatId: Effect.Effect<string | undefined>;
	readonly onChange: (
		cb: (prev: VexisConfig, next: VexisConfig) => void,
	) => Effect.Effect<() => void>;
}

export class AppConfig extends Context.Tag("AppConfig")<
	AppConfig,
	AppConfigService
>() {}

export const resolveKeypairFrom = (config: VexisConfig): Keypair => {
	const rawKey = process.env.VEXIS_PRIVATE_KEY || config.privateKey;
	if (!rawKey) {
		throw new Error(
			"No private key found. Set VEXIS_PRIVATE_KEY env var or privateKey in vexis.config.json.",
		);
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
		amountPresets:
			c.amountPresets && c.amountPresets.length > 0
				? c.amountPresets
				: [0.1, 0.25, 0.5, 1],
		xAmount: c.xAmount,
		yAmount: c.yAmount,
		autoSwap: c.autoSwap ?? false,
		slippageBps: c.slippageBps ?? 100,
	};
};

export interface ResolvedAgentLlm {
	baseUrl: string;
	model: string;
	apiKey: string;
	timeoutMs: number;
}

export interface ResolvedAgentRisks {
	enabled: boolean;
	minTokenFeesSol: number;
	maxBundlePct: number;
	maxBotHoldersPct: number;
	maxTop10Pct: number;
	minFromAthPct: number;
	maxRugScore: number;
	blockWash: boolean;
	blockRugpull: boolean;
	blockDexScreenerPaid: boolean;
	blockDevSoldAll: boolean;
}

export interface ResolvedAgentDarwin {
	enabled: boolean;
	windowDays: number;
	recalcEvery: number;
	boostFactor: number;
	decayFactor: number;
	weightFloor: number;
	weightCeiling: number;
	minSamples: number;
}

export interface ResolvedBlockedSessions {
	timezone: "UTC" | "WIB";
	windows: { name: string; start: string; end: string }[];
}

export interface ResolvedAgentConfig {
	enabled: boolean;
	intervalMinutes: number;
	maxCandidates: number;
	minCandidate: number;
	maxSolPerPosition: number;
	maxTotalSol: number;
	maxOpenPositions: number;
	txCooldownMs: number;
	poolCooldownMs: number;
	tpPct: number;
	slPct: number;
	llm: ResolvedAgentLlm;
	risks: ResolvedAgentRisks;
	darwin: ResolvedAgentDarwin;
	blockedSessions: ResolvedBlockedSessions;
}

export const resolveAgentConfigFrom = (
	c: VexisConfig,
	env: Record<string, string | undefined> = process.env,
): ResolvedAgentConfig => {
	const a = c.agent ?? {};
	const apiKey = a.llm?.apiKey ?? env.OPENAI_API_KEY ?? "";
	const r = a.risks ?? {};
	const d = a.darwin ?? {};
	const bs = a.blockedSessions;
	const rawTz = bs?.timezone;
	const timezone: "UTC" | "WIB" = rawTz === "WIB" ? "WIB" : "UTC";
	const windows = Array.isArray(bs?.windows)
		? bs.windows.filter(
				(w): w is { name: string; start: string; end: string } =>
					typeof w.name === "string" &&
					typeof w.start === "string" &&
					typeof w.end === "string",
			)
		: [];
	return {
		enabled: a.enabled ?? false,
		intervalMinutes: Math.max(1, a.intervalMinutes ?? 15),
		maxCandidates: a.maxCandidates ?? 5,
		minCandidate: a.minCandidate ?? 70,
		maxSolPerPosition: a.maxSolPerPosition ?? 0.5,
		maxTotalSol: a.maxTotalSol ?? 3,
		maxOpenPositions: a.maxOpenPositions ?? 4,
		txCooldownMs: a.txCooldownMs ?? 300_000,
		poolCooldownMs: a.poolCooldownMs ?? 24 * 3_600_000,
		tpPct: a.tpPct ?? c.takeProfitPct ?? 25,
		slPct: a.slPct ?? c.stopLossPct ?? -10,
		llm: {
			baseUrl: (a.llm?.baseUrl ?? "https://api.openai.com/v1").replace(
				/\/$/,
				"",
			),
			model: a.llm?.model ?? "gpt-4o-mini",
			apiKey,
			timeoutMs: a.llm?.timeoutMs ?? 120_000,
		},
		risks: {
			enabled: r.enabled ?? true,
			minTokenFeesSol: r.minTokenFeesSol ?? 30,
			maxBundlePct: r.maxBundlePct ?? 30,
			maxBotHoldersPct: r.maxBotHoldersPct ?? 30,
			maxTop10Pct: r.maxTop10Pct ?? 60,
			minFromAthPct: r.minFromAthPct ?? 30,
			maxRugScore: r.maxRugScore ?? 500,
			blockWash: r.blockWash ?? true,
			blockRugpull: r.blockRugpull ?? true,
			blockDexScreenerPaid: r.blockDexScreenerPaid ?? true,
			blockDevSoldAll: r.blockDevSoldAll ?? true,
		},
		darwin: {
			enabled: d.enabled ?? true,
			windowDays: d.windowDays ?? 60,
			recalcEvery: d.recalcEvery ?? 5,
			boostFactor: d.boostFactor ?? 1.05,
			decayFactor: d.decayFactor ?? 0.95,
			weightFloor: d.weightFloor ?? 0.3,
			weightCeiling: d.weightCeiling ?? 2.5,
			minSamples: d.minSamples ?? 10,
		},
		blockedSessions: { timezone, windows },
	};
};

const make = (
	initial: VexisConfig,
	path: string | null,
	watchFile = false,
): Effect.Effect<AppConfigService> =>
	Effect.gen(function* () {
		const ref = yield* Ref.make(initial);
		const listeners = new Set<(prev: VexisConfig, next: VexisConfig) => void>();
		const notify = (prev: VexisConfig, next: VexisConfig) => {
			for (const cb of listeners) cb(prev, next);
		};

		if (path !== null && watchFile) {
			let timer: NodeJS.Timeout | null = null;
			const watcher = watch(path, () => {
				if (timer != null) clearTimeout(timer);
				timer = setTimeout(() => {
					timer = null;
					try {
						const prev = Effect.runSync(Ref.get(ref));
						const next = reloadConfigFile(path);
						Effect.runSync(Ref.set(ref, next));
						notify(prev, next);
					} catch (e) {
						console.error(
							`[config] reload failed, keeping previous config: ${
								e instanceof Error ? e.message : e
							}`,
						);
					}
				}, 150);
			});
			process.once("exit", () => watcher.close());
		}

		const persist = (config: VexisConfig): Effect.Effect<void, ConfigError> =>
			path === null
				? Effect.fail(
						new ConfigError({
							message:
								"No config file to save to. Create vexis.config.json first.",
						}),
					)
				: Effect.try({
						try: () =>
							writeFileSync(path, JSON.stringify(config, null, 2), "utf8"),
						catch: (e) =>
							new ConfigError({
								message: `Failed to save config: ${e instanceof Error ? e.message : e}`,
							}),
					});

		const service: AppConfigService = {
			get: Ref.get(ref),
			path,
			update: (patch) =>
				Effect.gen(function* () {
					const prev = yield* Ref.get(ref);
					const next = yield* Ref.updateAndGet(ref, patch);
					yield* persist(next);
					yield* Effect.sync(() => notify(prev, next));
					return next;
				}),
			save: Ref.get(ref).pipe(Effect.flatMap(persist)),
			onChange: (cb) =>
				Effect.sync(() => {
					listeners.add(cb);
					return () => listeners.delete(cb);
				}),
			wallet: (arg?: string) =>
				Ref.get(ref).pipe(
					Effect.flatMap((c) => {
						if (arg) return Effect.succeed(arg);
						if (c.wallet) return Effect.succeed(c.wallet);
						return Effect.fail(
							new WalletError({
								message:
									"No wallet given and no default in config. Pass a wallet address or set one in vexis.config.json.",
							}),
						);
					}),
				),
			keypair: Ref.get(ref).pipe(
				Effect.flatMap((c) =>
					Effect.try({
						try: () => resolveKeypairFrom(c),
						catch: (e) =>
							new SignerError({
								message: e instanceof Error ? e.message : String(e),
							}),
					}),
				),
			),
			rpcUrl: Ref.get(ref).pipe(
				Effect.map((c) => c.rpcUrl || "https://api.mainnet-beta.solana.com"),
			),
			botToken: Ref.get(ref).pipe(
				Effect.flatMap((c) => {
					const token = process.env.TELEGRAM_BOT_TOKEN || c.telegramBotToken;
					if (!token) {
						return Effect.fail(
							new ConfigError({
								message:
									"No Telegram bot token. Set TELEGRAM_BOT_TOKEN env var or telegramBotToken in vexis.config.json.",
							}),
						);
					}
					return Effect.succeed(token);
				}),
			),
			chatId: Ref.get(ref).pipe(
				Effect.map((c) => process.env.TELEGRAM_CHAT_ID || c.telegramChatId),
			),
		};
		return service;
	});

export const AppConfigLive = Layer.effect(
	AppConfig,
	Effect.try({
		try: () => loadConfigSync(),
		catch: (e) =>
			new ConfigError({ message: e instanceof Error ? e.message : String(e) }),
	}).pipe(Effect.flatMap(({ config, path }) => make(config, path, true))),
);

export const AppConfigTest = (
	config: VexisConfig,
	path: string | null = null,
) => Layer.effect(AppConfig, make(config, path));
