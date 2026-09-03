import { PublicKey } from "@solana/web3.js";
import type BN from "bn.js";
import type { StrategyType } from "../domain/onchain.js";
import { scaleAmount } from "./math.js";

export const SECRET_SENTINEL = "***";

export function assertValidPubkey(label: string, value: string): PublicKey {
	try {
		return new PublicKey(value);
	} catch {
		throw new Error(`Invalid ${label}: expected base58 public key`);
	}
}

export function parseHumanAmountStrict(human: string, decimals: number): BN {
	const cleaned = human.trim();
	if (cleaned === "") throw new Error("Amount must not be empty");
	const n = Number(cleaned);
	if (!Number.isFinite(n)) throw new Error(`Invalid amount: ${human}`);
	if (n < 0) throw new Error(`Amount must not be negative: ${human}`);
	return scaleAmount(cleaned, decimals);
}

export function bpsToSlippagePct(bps: number, fallbackPct = 1): number {
	if (!Number.isFinite(bps)) return fallbackPct;
	const pct = bps / 100;
	if (pct < 0) return 0;
	if (pct > 100) return 100;
	return pct;
}

export function assertValidStrategy(s: string): StrategyType {
	if (s === "spot" || s === "bidask" || s === "curve") return s;
	throw new Error(`Invalid strategy: ${s}. Use spot, bidask, or curve`);
}

export function assertValidCliAmount(label: string, v: string): void {
	const n = Number(v);
	if (!Number.isFinite(n) || n < 0) {
		throw new Error(`Invalid ${label}: ${v}`);
	}
}

export function clampPageSize(n: number): number {
	if (!Number.isFinite(n)) return 50;
	return Math.min(50, Math.max(1, Math.floor(n)));
}

const SENSITIVE_KEYS = new Set([
	"privateKey",
	"telegramBotToken",
	"apiKey",
	"password",
]);

export function redactConfig<T>(cfg: T): T {
	if (Array.isArray(cfg)) return cfg.map(redactConfig) as unknown as T;
	if (typeof cfg !== "object" || cfg === null) return cfg;
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(cfg as Record<string, unknown>)) {
		out[k] = SENSITIVE_KEYS.has(k) ? SECRET_SENTINEL : redactConfig(v);
	}
	return out as T;
}
