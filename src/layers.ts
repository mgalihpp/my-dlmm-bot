import { Layer } from "effect";
import { BlacklistLive } from "./services/Blacklist.js";
import { AppConfigLive } from "./services/Config.js";
import { DlmmLive } from "./services/Dlmm.js";
import { JupiterLive } from "./services/Jupiter.js";
import { MeteoraApiLive } from "./services/MeteoraApi.js";
import { RugCheckLive } from "./services/RugCheck.js";
import { ScreeningLive } from "./services/Screening.js";
import { SessionStoreLive } from "./services/SessionStore.js";
import { SolanaLive } from "./services/Solana.js";
import { TokenMetaLive } from "./services/TokenMeta.js";
import { WatchlistLive } from "./services/Watchlist.js";
import { ZapLive } from "./services/Zap.js";

export const AppLayer = Layer.mergeAll(
	MeteoraApiLive,
	RugCheckLive,
	JupiterLive,
	DlmmLive,
	ZapLive,
	ScreeningLive,
	SessionStoreLive,
	WatchlistLive,
	BlacklistLive,
	SolanaLive,
	TokenMetaLive,
).pipe(
	Layer.provideMerge(SolanaLive),
	Layer.provideMerge(MeteoraApiLive),
	Layer.provideMerge(RugCheckLive),
	Layer.provideMerge(JupiterLive),
	Layer.provideMerge(AppConfigLive),
);
