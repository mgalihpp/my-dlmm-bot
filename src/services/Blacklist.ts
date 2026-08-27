import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Context, Effect, Layer } from "effect";
import { repoPath } from "../paths.js";

export interface BlacklistedToken {
	mint: string;
	addedAt: string;
	label?: string;
}

export interface BlacklistState {
	tokens: BlacklistedToken[];
}

export interface BlacklistService {
	readonly add: (
		mint: string,
		label?: string,
	) => Effect.Effect<BlacklistedToken>;
	readonly remove: (mint: string) => Effect.Effect<boolean>;
	readonly list: Effect.Effect<BlacklistedToken[]>;
	readonly contains: (mint: string) => Effect.Effect<boolean>;
	readonly isBlacklisted: (
		mint: string | null | undefined,
	) => Effect.Effect<boolean>;
}

export class Blacklist extends Context.Tag("Blacklist")<
	Blacklist,
	BlacklistService
>() {}

const STATE_FILE = repoPath(".vexis-blacklist.json");

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

const tokenOf = (v: unknown): BlacklistedToken | null => {
	if (!isRecord(v) || typeof v.mint !== "string") return null;
	if (v.mint.trim() === "") return null;
	return {
		mint: v.mint.trim(),
		label: typeof v.label === "string" ? v.label : undefined,
		addedAt:
			typeof v.addedAt === "string" ? v.addedAt : new Date().toISOString(),
	};
};

export function loadState(file = STATE_FILE): BlacklistState {
	if (existsSync(file)) {
		try {
			const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
			if (isRecord(raw) && Array.isArray(raw.tokens)) {
				return {
					tokens: raw.tokens
						.map(tokenOf)
						.filter((t): t is BlacklistedToken => t !== null),
				};
			}
			if (Array.isArray(raw)) {
				return {
					tokens: raw
						.map(tokenOf)
						.filter((t): t is BlacklistedToken => t !== null),
				};
			}
		} catch {}
	}
	return { tokens: [] };
}

const saveState = (state: BlacklistState, file = STATE_FILE): void => {
	try {
		writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
	} catch (e) {
		console.warn("[blacklist] Failed to save state:", e);
	}
};

export function normalizeMint(mint: string): string {
	return mint.trim();
}

export function isValidMint(mint: string): boolean {
	return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint.trim());
}

const make = (file = STATE_FILE): BlacklistService => ({
	add: (mint, label) =>
		Effect.sync(() => {
			const normalized = normalizeMint(mint);
			if (!isValidMint(normalized)) {
				throw new Error(`Invalid token mint: ${mint}`);
			}
			const state = loadState(file);
			const existing = state.tokens.find((t) => t.mint === normalized);
			if (existing) {
				if (label) existing.label = label;
				saveState(state, file);
				return existing;
			}
			const entry: BlacklistedToken = {
				mint: normalized,
				label,
				addedAt: new Date().toISOString(),
			};
			state.tokens.push(entry);
			saveState(state, file);
			return entry;
		}),
	remove: (mint) =>
		Effect.sync(() => {
			const normalized = normalizeMint(mint);
			const state = loadState(file);
			const idx = state.tokens.findIndex((t) => t.mint === normalized);
			if (idx === -1) return false;
			state.tokens.splice(idx, 1);
			saveState(state, file);
			return true;
		}),
	list: Effect.sync(() => loadState(file).tokens),
	contains: (mint) =>
		Effect.sync(() => {
			const normalized = normalizeMint(mint);
			return loadState(file).tokens.some((t) => t.mint === normalized);
		}),
	isBlacklisted: (mint) =>
		Effect.sync(() => {
			if (!mint) return false;
			const normalized = normalizeMint(mint);
			return loadState(file).tokens.some((t) => t.mint === normalized);
		}),
});

export const BlacklistLive = Layer.succeed(Blacklist, make());

export const BlacklistTest = (file: string) =>
	Layer.succeed(Blacklist, make(file));
