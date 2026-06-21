import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const STATE_FILE = join(process.cwd(), ".vexis-watchlist.json");

export interface WatchedWallet {
  address: string;
  label?: string;
  addedAt: string;
}

export interface WatchlistState {
  wallets: WatchedWallet[];
}

function loadState(): WatchlistState {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, "utf8")) as WatchlistState;
    } catch {
      // fall through
    }
  }
  return { wallets: [] };
}

function saveState(state: WatchlistState) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // best-effort
  }
}

export function addWallet(address: string, label?: string): WatchedWallet {
  const state = loadState();
  const existing = state.wallets.find(
    (w) => w.address === address,
  );
  if (existing) {
    if (label) existing.label = label;
    saveState(state);
    return existing;
  }
  const entry: WatchedWallet = {
    address,
    label,
    addedAt: new Date().toISOString(),
  };
  state.wallets.push(entry);
  saveState(state);
  return entry;
}

export function removeWallet(address: string): boolean {
  const state = loadState();
  const idx = state.wallets.findIndex((w) => w.address === address);
  if (idx === -1) return false;
  state.wallets.splice(idx, 1);
  saveState(state);
  return true;
}

export function listWallets(): WatchedWallet[] {
  return loadState().wallets;
}
