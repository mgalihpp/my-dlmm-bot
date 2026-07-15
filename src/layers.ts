import { Layer } from "effect";
import { AppConfigLive } from "./services/Config.js";
import { MeteoraApiLive } from "./services/MeteoraApi.js";
import { SolanaLive } from "./services/Solana.js";
import { DlmmLive } from "./services/Dlmm.js";
import { ZapLive } from "./services/Zap.js";
import { ScreeningLive } from "./services/Screening.js";
import { SessionStoreLive } from "./services/SessionStore.js";
import { WatchlistLive } from "./services/Watchlist.js";
import { TokenMetaLive } from "./services/TokenMeta.js";

export const AppLayer = Layer.mergeAll(
  MeteoraApiLive,
  DlmmLive,
  ZapLive,
  ScreeningLive,
  SessionStoreLive,
  WatchlistLive,
  SolanaLive,
  TokenMetaLive,
).pipe(Layer.provideMerge(SolanaLive), Layer.provideMerge(MeteoraApiLive), Layer.provideMerge(AppConfigLive));
