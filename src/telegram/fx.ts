import type { Keypair } from "@solana/web3.js";
import type BN from "bn.js";
import { Effect } from "effect";
import type {
	PoolsConfig,
	VexisConfig,
	WalletConfig,
} from "../domain/config.js";
import type { OpenPool } from "../domain/index.js";
import type { ScreenResult } from "../lib/screening.js";
import {
	AppConfig,
	getWalletConfigs,
	loadConfigSync,
} from "../services/Config.js";
import { Dlmm, type DlmmService } from "../services/Dlmm.js";
import { MeteoraApi, type MeteoraApiService } from "../services/MeteoraApi.js";
import { Screening } from "../services/Screening.js";
import { Solana } from "../services/Solana.js";
import { TokenMeta, type TokenMetaInfo } from "../services/TokenMeta.js";
import { type WatchedWallet, Watchlist } from "../services/Watchlist.js";
import { Zap } from "../services/Zap.js";
import { runFx, runtime } from "./runtime.js";

export const getConfig = (): Promise<VexisConfig> =>
	runFx(Effect.flatMap(AppConfig, (c) => c.get));

export const getConfigSync = (): VexisConfig =>
	runtime.runSync(Effect.flatMap(AppConfig, (c) => c.get));

export const configPath = (): string | null =>
	runtime.runSync(Effect.map(AppConfig, (c) => c.path));

export const updateConfig = (
	patch: (c: VexisConfig) => VexisConfig,
): Promise<VexisConfig> =>
	runFx(Effect.flatMap(AppConfig, (c) => c.update(patch)));

export const resolveWallet = (arg?: string): Promise<string> =>
	runFx(Effect.flatMap(AppConfig, (c) => c.wallet(arg)));

export const resolveRpc = (): Promise<string> =>
	runFx(Effect.flatMap(AppConfig, (c) => c.rpcUrl));

export const resolveKeypair = (): Promise<Keypair> =>
	runFx(Effect.flatMap(AppConfig, (c) => c.keypair));

export const resolveKeypairFor = (wallet: string): Promise<Keypair> =>
	runFx(Effect.flatMap(Solana, (s) => s.keypairFor(wallet)));

export const resolveWallets = (): Promise<WalletConfig[]> =>
	runFx(Effect.flatMap(AppConfig, (c) => c.wallets));

/**
 * Resolves a user-supplied wallet argument (address or label) to its canonical
 * wallet address, or null when it doesn't match a configured wallet. Numeric
 * tokens are NOT special-cased: a label that happens to be digits resolves if
 * it matches a wallet; anything that doesn't match is treated as a non-wallet
 * argument by callers (e.g. a page number).
 */
export function resolveWalletArg(input?: string): string | null {
	if (!input) return null;
	try {
		const { config } = loadConfigSync();
		const wallets = getWalletConfigs(config);
		const lower = input.toLowerCase();
		const found = wallets.find(
			(w) =>
				w.wallet === input ||
				w.label === input ||
				w.wallet.toLowerCase() === lower ||
				w.label?.toLowerCase() === lower,
		);
		return found ? found.wallet : null;
	} catch {
		return null;
	}
}

export const resolveEnabledWallets = (): Promise<WalletConfig[]> =>
	runFx(Effect.flatMap(AppConfig, (c) => c.enabledWallets));

export const api = {
	totalPnl: (user: string) =>
		runFx(Effect.flatMap(MeteoraApi, (a) => a.totalPnl(user))),
	openPortfolio: (user: string, page?: number, pageSize?: number) =>
		runFx(
			Effect.flatMap(MeteoraApi, (a) => a.openPortfolio(user, page, pageSize)),
		),
	closedPortfolio: (user: string, page?: number, pageSize?: number) =>
		runFx(
			Effect.flatMap(MeteoraApi, (a) =>
				a.closedPortfolio(user, page, pageSize),
			),
		),
	pool: (address: string) =>
		runFx(Effect.flatMap(MeteoraApi, (a) => a.pool(address))),
	pools: (opts?: Parameters<MeteoraApiService["pools"]>[0]) =>
		runFx(Effect.flatMap(MeteoraApi, (a) => a.pools(opts))),
	positionPnl: (
		poolAddress: string,
		user: string,
		status?: "open" | "closed" | "all",
		page?: number,
		pageSize?: number,
	) =>
		runFx(
			Effect.flatMap(MeteoraApi, (a) =>
				a.positionPnl(poolAddress, user, status, page, pageSize),
			),
		),
	enrichOpenPortfolioPnl: (
		pools: readonly OpenPool[],
		wallet: string,
		opts?: { withRanges?: boolean },
	) =>
		runFx(
			Effect.flatMap(MeteoraApi, (a) =>
				a.enrichOpenPortfolioPnl(pools, wallet, opts),
			),
		),
	poolHistoricalVolume: (address: string) =>
		runFx(Effect.flatMap(MeteoraApi, (a) => a.poolHistoricalVolume(address))),
};

export const dlmm = {
	previewRange: (params: Parameters<DlmmService["previewRange"]>[0]) =>
		runFx(Effect.flatMap(Dlmm, (d) => d.previewRange(params))),
	quotePositionCost: (
		params: Parameters<DlmmService["quotePositionCost"]>[0],
	) => runFx(Effect.flatMap(Dlmm, (d) => d.quotePositionCost(params))),
	createPosition: (
		params: Parameters<DlmmService["createPosition"]>[0],
		wallet: string,
	) => runFx(Effect.flatMap(Dlmm, (d) => d.createPosition(params, wallet))),
	closePosition: (
		poolAddress: string,
		positionPubkey: string,
		wallet: string,
	) =>
		runFx(
			Effect.flatMap(Dlmm, (d) =>
				d.closePosition(poolAddress, positionPubkey, wallet),
			),
		),
	addLiquidity: (
		params: Parameters<DlmmService["addLiquidity"]>[0],
		wallet: string,
	) => runFx(Effect.flatMap(Dlmm, (d) => d.addLiquidity(params, wallet))),
	removeLiquidity: (
		params: Parameters<DlmmService["removeLiquidity"]>[0],
		wallet: string,
	) => runFx(Effect.flatMap(Dlmm, (d) => d.removeLiquidity(params, wallet))),
	claimFee: (poolAddress: string, positionPubkey: string, wallet: string) =>
		runFx(
			Effect.flatMap(Dlmm, (d) =>
				d.claimFee(poolAddress, positionPubkey, wallet),
			),
		),
	claimReward: (poolAddress: string, positionPubkey: string, wallet: string) =>
		runFx(
			Effect.flatMap(Dlmm, (d) =>
				d.claimReward(poolAddress, positionPubkey, wallet),
			),
		),
	attachLivePositions: (pools: OpenPool[], wallet: string) =>
		runFx(Effect.flatMap(Dlmm, (d) => d.attachLivePositions(pools, wallet))),
};

export const zap = {
	claimAndZapOut: (
		poolAddress: string,
		positionPubkey: string,
		outputMint: string | undefined,
		wallet: string,
	) =>
		runFx(
			Effect.flatMap(Zap, (z) =>
				z.claimAndZapOut(poolAddress, positionPubkey, outputMint, wallet),
			),
		),
	closeAndZapOut: (
		poolAddress: string,
		positionPubkey: string,
		outputMint: string | undefined,
		wallet: string,
	) =>
		runFx(
			Effect.flatMap(Zap, (z) =>
				z.closeAndZapOut(poolAddress, positionPubkey, outputMint, wallet),
			),
		),
	swapExactIn: (
		inputMint: string,
		outputMint: string,
		amount: BN,
		slippageBps: number | undefined,
		wallet: string,
	) =>
		runFx(
			Effect.flatMap(Zap, (z) =>
				z.swapExactIn(inputMint, outputMint, amount, slippageBps, wallet),
			),
		),
	getSolBalance: (wallet: string) =>
		runFx(Effect.flatMap(Zap, (z) => z.getSolBalance(wallet))),
};

export const screenPools = (opts?: {
	timeframe?: string;
	category?: string;
	displayLimit?: number;
	poolsOverride?: PoolsConfig;
}): Promise<ScreenResult> =>
	runFx(Effect.flatMap(Screening, (s) => s.screen(opts)));

export const watchlist = {
	add: (address: string, label?: string): Promise<WatchedWallet> =>
		runFx(Effect.flatMap(Watchlist, (w) => w.add(address, label))),
	remove: (address: string): Promise<boolean> =>
		runFx(Effect.flatMap(Watchlist, (w) => w.remove(address))),
	list: (): Promise<WatchedWallet[]> =>
		runFx(Effect.flatMap(Watchlist, (w) => w.list)),
};

export const tokenMeta = (mint: string): Promise<TokenMetaInfo | null> =>
	runFx(Effect.flatMap(TokenMeta, (t) => t.get(mint)));

export type { WatchedWallet };
