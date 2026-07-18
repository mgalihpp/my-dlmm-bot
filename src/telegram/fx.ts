import { Effect } from "effect";
import type BN from "bn.js";
import type { Keypair } from "@solana/web3.js";
import { AppConfig } from "../services/Config.js";
import { MeteoraApi, type MeteoraApiService } from "../services/MeteoraApi.js";
import { Dlmm, type DlmmService } from "../services/Dlmm.js";
import { Zap } from "../services/Zap.js";
import { Screening } from "../services/Screening.js";
import { Watchlist, type WatchedWallet } from "../services/Watchlist.js";
import { TokenMeta, type TokenMetaInfo } from "../services/TokenMeta.js";
import type { VexisConfig, PoolsConfig } from "../domain/config.js";
import type { ScreenResult } from "../lib/screening.js";
import type { OpenPool } from "../domain/index.js";
import { runFx, runtime } from "./runtime.js";

export const getConfig = (): Promise<VexisConfig> =>
  runFx(Effect.flatMap(AppConfig, (c) => c.get));

export const getConfigSync = (): VexisConfig =>
  runtime.runSync(Effect.flatMap(AppConfig, (c) => c.get));

export const configPath = (): string | null =>
  runtime.runSync(Effect.map(AppConfig, (c) => c.path));

export const updateConfig = (patch: (c: VexisConfig) => VexisConfig): Promise<VexisConfig> =>
  runFx(Effect.flatMap(AppConfig, (c) => c.update(patch)));

export const resolveWallet = (arg?: string): Promise<string> =>
  runFx(Effect.flatMap(AppConfig, (c) => c.wallet(arg)));

export const resolveRpc = (): Promise<string> =>
  runFx(Effect.flatMap(AppConfig, (c) => c.rpcUrl));

export const resolveKeypair = (): Promise<Keypair> =>
  runFx(Effect.flatMap(AppConfig, (c) => c.keypair));

export const api = {
  totalPnl: (user: string) => runFx(Effect.flatMap(MeteoraApi, (a) => a.totalPnl(user))),
  openPortfolio: (user: string, page?: number, pageSize?: number) =>
    runFx(Effect.flatMap(MeteoraApi, (a) => a.openPortfolio(user, page, pageSize))),
  closedPortfolio: (user: string, page?: number, pageSize?: number) =>
    runFx(Effect.flatMap(MeteoraApi, (a) => a.closedPortfolio(user, page, pageSize))),
  pool: (address: string) => runFx(Effect.flatMap(MeteoraApi, (a) => a.pool(address))),
  pools: (opts?: Parameters<MeteoraApiService["pools"]>[0]) =>
    runFx(Effect.flatMap(MeteoraApi, (a) => a.pools(opts))),
  positionPnl: (
    poolAddress: string,
    user: string,
    status?: "open" | "closed" | "all",
    page?: number,
    pageSize?: number,
  ) => runFx(Effect.flatMap(MeteoraApi, (a) => a.positionPnl(poolAddress, user, status, page, pageSize))),
  enrichOpenPortfolioPnl: (pools: readonly OpenPool[], wallet: string) =>
    runFx(Effect.flatMap(MeteoraApi, (a) => a.enrichOpenPortfolioPnl(pools, wallet))),
  poolHistoricalVolume: (address: string) =>
    runFx(Effect.flatMap(MeteoraApi, (a) => a.poolHistoricalVolume(address))),
};

export const dlmm = {
  previewRange: (params: Parameters<DlmmService["previewRange"]>[0]) =>
    runFx(Effect.flatMap(Dlmm, (d) => d.previewRange(params))),
  quotePositionCost: (params: Parameters<DlmmService["quotePositionCost"]>[0]) =>
    runFx(Effect.flatMap(Dlmm, (d) => d.quotePositionCost(params))),
  createPosition: (params: Parameters<DlmmService["createPosition"]>[0]) =>
    runFx(Effect.flatMap(Dlmm, (d) => d.createPosition(params))),
  closePosition: (poolAddress: string, positionPubkey: string) =>
    runFx(Effect.flatMap(Dlmm, (d) => d.closePosition(poolAddress, positionPubkey))),
  addLiquidity: (params: Parameters<DlmmService["addLiquidity"]>[0]) =>
    runFx(Effect.flatMap(Dlmm, (d) => d.addLiquidity(params))),
  removeLiquidity: (params: Parameters<DlmmService["removeLiquidity"]>[0]) =>
    runFx(Effect.flatMap(Dlmm, (d) => d.removeLiquidity(params))),
  claimFee: (poolAddress: string, positionPubkey: string) =>
    runFx(Effect.flatMap(Dlmm, (d) => d.claimFee(poolAddress, positionPubkey))),
  claimReward: (poolAddress: string, positionPubkey: string) =>
    runFx(Effect.flatMap(Dlmm, (d) => d.claimReward(poolAddress, positionPubkey))),
  attachLivePositions: (pools: OpenPool[], wallet: string) =>
    runFx(Effect.flatMap(Dlmm, (d) => d.attachLivePositions(pools, wallet))),
};

export const zap = {
  claimAndZapOut: (poolAddress: string, positionPubkey: string, outputMint?: string) =>
    runFx(Effect.flatMap(Zap, (z) => z.claimAndZapOut(poolAddress, positionPubkey, outputMint))),
  closeAndZapOut: (poolAddress: string, positionPubkey: string, outputMint?: string) =>
    runFx(Effect.flatMap(Zap, (z) => z.closeAndZapOut(poolAddress, positionPubkey, outputMint))),
  swapExactIn: (inputMint: string, outputMint: string, amount: BN, slippageBps?: number) =>
    runFx(Effect.flatMap(Zap, (z) => z.swapExactIn(inputMint, outputMint, amount, slippageBps))),
  getSolBalance: () => runFx(Effect.flatMap(Zap, (z) => z.getSolBalance)),
};

export const screenPools = (opts?: {
  timeframe?: string;
  category?: string;
  displayLimit?: number;
  poolsOverride?: PoolsConfig;
}): Promise<ScreenResult> => runFx(Effect.flatMap(Screening, (s) => s.screen(opts)));

export const watchlist = {
  add: (address: string, label?: string): Promise<WatchedWallet> =>
    runFx(Effect.flatMap(Watchlist, (w) => w.add(address, label))),
  remove: (address: string): Promise<boolean> =>
    runFx(Effect.flatMap(Watchlist, (w) => w.remove(address))),
  list: (): Promise<WatchedWallet[]> => runFx(Effect.flatMap(Watchlist, (w) => w.list)),
};

export const tokenMeta = (mint: string): Promise<TokenMetaInfo | null> =>
  runFx(Effect.flatMap(TokenMeta, (t) => t.get(mint)));

export type { WatchedWallet };
