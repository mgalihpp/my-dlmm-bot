import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Context, Effect, Layer } from "effect";

export interface WatchedWallet {
	address: string;
	label?: string;
	addedAt: string;
}

export interface WatchlistState {
	wallets: WatchedWallet[];
}

export interface WatchlistService {
	readonly add: (
		address: string,
		label?: string,
	) => Effect.Effect<WatchedWallet>;
	readonly remove: (address: string) => Effect.Effect<boolean>;
	readonly list: Effect.Effect<WatchedWallet[]>;
}

export class Watchlist extends Context.Tag("Watchlist")<
	Watchlist,
	WatchlistService
>() {}

const STATE_FILE = join(process.cwd(), ".vexis-watchlist.json");

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

const walletOf = (v: unknown): WatchedWallet | null => {
	if (!isRecord(v) || typeof v.address !== "string") return null;
	return {
		address: v.address,
		label: typeof v.label === "string" ? v.label : undefined,
		addedAt:
			typeof v.addedAt === "string" ? v.addedAt : new Date().toISOString(),
	};
};

export function loadState(file = STATE_FILE): WatchlistState {
	if (existsSync(file)) {
		try {
			const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
			if (isRecord(raw) && Array.isArray(raw.wallets)) {
				return {
					wallets: raw.wallets
						.map(walletOf)
						.filter((w): w is WatchedWallet => w !== null),
				};
			}
		} catch {}
	}
	return { wallets: [] };
}

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
			const entry: WatchedWallet = {
				address,
				label,
				addedAt: new Date().toISOString(),
			};
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
