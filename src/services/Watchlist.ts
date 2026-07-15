import { Context, Effect, Layer } from "effect";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface WatchedWallet {
  address: string;
  label?: string;
  addedAt: string;
}

export interface WatchlistState {
  wallets: WatchedWallet[];
}

export interface WatchlistService {
  readonly add: (address: string, label?: string) => Effect.Effect<WatchedWallet>;
  readonly remove: (address: string) => Effect.Effect<boolean>;
  readonly list: Effect.Effect<WatchedWallet[]>;
}

export class Watchlist extends Context.Tag("Watchlist")<Watchlist, WatchlistService>() {}

const STATE_FILE = join(process.cwd(), ".vexis-watchlist.json");

const loadState = (): WatchlistState => {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, "utf8")) as WatchlistState;
    } catch {}
  }
  return { wallets: [] };
};

const saveState = (state: WatchlistState): void => {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn("[watchlist] Failed to save state:", e);
  }
};

const make: WatchlistService = {
  add: (address, label) =>
    Effect.sync(() => {
      const state = loadState();
      const existing = state.wallets.find((w) => w.address === address);
      if (existing) {
        if (label) existing.label = label;
        saveState(state);
        return existing;
      }
      const entry: WatchedWallet = { address, label, addedAt: new Date().toISOString() };
      state.wallets.push(entry);
      saveState(state);
      return entry;
    }),
  remove: (address) =>
    Effect.sync(() => {
      const state = loadState();
      const idx = state.wallets.findIndex((w) => w.address === address);
      if (idx === -1) return false;
      state.wallets.splice(idx, 1);
      saveState(state);
      return true;
    }),
  list: Effect.sync(() => loadState().wallets),
};

export const WatchlistLive = Layer.succeed(Watchlist, make);
