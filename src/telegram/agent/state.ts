import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { repoPath } from "../../paths.js";

export type LlmStatus = "ok" | "failed" | "skipped";

export interface AgentPlan {
	pool: string;
	poolName: string;
	baseMint: string | null;
	amountSol: number;
	positionAddress: string | null;
	openedAt: string | null;
	signals?: Record<string, number>;
}

export interface AgentExecution {
	at: string;
	action: string;
	pool: string;
	txSignature: string | null;
}

export interface AgentCooldown {
	pool: string;
	poolName: string;
	baseMint: string | null;
	until: string;
	reason: string;
}

export interface AgentState {
	enabled: boolean;
	running: boolean;
	lastCycleAt: string | null;
	llmStatus: LlmStatus;
	cycle: number;
	plans: AgentPlan[];
	executions: AgentExecution[];
	cooldowns: AgentCooldown[];
	/** pool -> timestamp ms when OOR to the right first detected. Reset to null when back in-range. */
	oorSince: Record<string, number>;
}

export interface WalletAgentState extends AgentState {
	wallet: string;
	label?: string;
}

export interface MultiWalletState {
	version: 2;
	global: AgentState;
	wallets: Record<string, WalletAgentState>;
}

/** Hybrid for backward compatibility — MultiWalletState plus flat AgentState fields at top level */
export type HybridState = MultiWalletState & AgentState;

const DEFAULT_FILE = repoPath(".vexis-agent.json");

const EMPTY: AgentState = {
	enabled: false,
	running: false,
	lastCycleAt: null,
	llmStatus: "skipped",
	cycle: 0,
	plans: [],
	executions: [],
	cooldowns: [],
	oorSince: {},
};

const EMPTY_MULTI_HYBRID: HybridState = {
	version: 2,
	global: { ...EMPTY },
	wallets: {},
	...EMPTY,
};

const LLM_STATUSES: readonly string[] = ["ok", "failed", "skipped"];

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

const num = (v: unknown): number =>
	typeof v === "number" && Number.isFinite(v) ? v : 0;

const planOf = (v: unknown): AgentPlan | null => {
	if (!isRecord(v) || typeof v.pool !== "string") return null;
	return {
		pool: v.pool,
		poolName: typeof v.poolName === "string" ? v.poolName : "",
		baseMint: str(v.baseMint),
		amountSol: num(v.amountSol),
		positionAddress: str(v.positionAddress),
		openedAt: str(v.openedAt),
		signals: isRecord(v.signals)
			? (v.signals as Record<string, number>)
			: undefined,
	};
};

const executionOf = (v: unknown): AgentExecution | null => {
	if (
		!isRecord(v) ||
		typeof v.at !== "string" ||
		typeof v.action !== "string"
	) {
		return null;
	}
	return {
		at: v.at,
		action: v.action,
		pool: typeof v.pool === "string" ? v.pool : "",
		txSignature: str(v.txSignature),
	};
};

const cooldownOf = (v: unknown): AgentCooldown | null => {
	if (!isRecord(v) || typeof v.pool !== "string") return null;
	return {
		pool: v.pool,
		poolName: typeof v.poolName === "string" ? v.poolName : "",
		baseMint: str(v.baseMint),
		until: typeof v.until === "string" ? v.until : "",
		reason: typeof v.reason === "string" ? v.reason : "",
	};
};

function sanitizeAgentState(raw: unknown): AgentState {
	if (!isRecord(raw)) return { ...EMPTY };
	const llm = raw.llmStatus;
	const oorSince: Record<string, number> = {};
	if (isRecord(raw.oorSince)) {
		for (const [k, v] of Object.entries(raw.oorSince)) {
			if (typeof v === "number" && Number.isFinite(v) && v > 0) oorSince[k] = v;
		}
	}
	return {
		enabled: typeof raw.enabled === "boolean" ? raw.enabled : false,
		running: typeof raw.running === "boolean" ? raw.running : false,
		lastCycleAt: str(raw.lastCycleAt),
		llmStatus: LLM_STATUSES.includes(llm as string)
			? (llm as LlmStatus)
			: "skipped",
		cycle: num(raw.cycle),
		plans: Array.isArray(raw.plans)
			? raw.plans.map(planOf).filter((p): p is AgentPlan => p !== null)
			: [],
		executions: Array.isArray(raw.executions)
			? raw.executions
					.map(executionOf)
					.filter((e): e is AgentExecution => e !== null)
			: [],
		cooldowns: Array.isArray(raw.cooldowns)
			? raw.cooldowns
					.map(cooldownOf)
					.filter((c): c is AgentCooldown => c !== null)
			: [],
		oorSince,
	};
}

function sanitizeWalletState(
	raw: unknown,
	walletKey: string,
): WalletAgentState {
	const base = sanitizeAgentState(raw);
	const r = isRecord(raw) ? raw : {};
	return {
		...base,
		wallet: typeof r.wallet === "string" ? r.wallet : walletKey,
		label: typeof r.label === "string" ? r.label : undefined,
	};
}

function sanitizeMulti(raw: unknown): HybridState {
	if (!isRecord(raw)) return { ...EMPTY_MULTI_HYBRID };
	// v2 detection
	if (raw.version === 2 && isRecord(raw.global) && isRecord(raw.wallets)) {
		const global = sanitizeAgentState(raw.global);
		const wallets: Record<string, WalletAgentState> = {};
		for (const [k, v] of Object.entries(raw.wallets)) {
			if (!isRecord(v)) continue;
			wallets[k] = sanitizeWalletState(v, k);
		}
		// hybrid flat fields aggregate from wallets for backward compat, fallback to global when empty
		const hasWallets = Object.keys(wallets).length > 0;
		const flatPlans = hasWallets
			? Object.values(wallets).flatMap((w) => w.plans)
			: global.plans;
		const flatExecs = hasWallets
			? Object.values(wallets).flatMap((w) => w.executions)
			: global.executions;
		const flatCooldowns = hasWallets
			? Object.values(wallets).flatMap((w) => w.cooldowns)
			: global.cooldowns;
		const flatOor: Record<string, number> = hasWallets
			? (() => {
					const acc: Record<string, number> = {};
					for (const w of Object.values(wallets))
						Object.assign(acc, w.oorSince);
					return acc;
				})()
			: global.oorSince;
		return {
			version: 2,
			global,
			wallets,
			enabled: global.enabled,
			running: global.running,
			lastCycleAt: global.lastCycleAt,
			llmStatus: global.llmStatus,
			cycle: global.cycle,
			plans: flatPlans,
			executions: flatExecs,
			cooldowns: flatCooldowns,
			oorSince: flatOor,
		};
	}
	// v1 flat -> wrap
	const flat = sanitizeAgentState(raw);
	const wallets: Record<string, WalletAgentState> = {};
	const hasData =
		flat.plans.length > 0 ||
		flat.cooldowns.length > 0 ||
		flat.executions.length > 0 ||
		Object.keys(flat.oorSince).length > 0;
	if (hasData) {
		wallets.primary = { wallet: "primary", ...flat };
	}
	return {
		version: 2,
		global: { ...flat },
		wallets,
		...flat,
	};
}

export function loadState(file = DEFAULT_FILE): HybridState {
	if (!existsSync(file))
		return { ...EMPTY_MULTI_HYBRID, global: { ...EMPTY }, wallets: {} };
	try {
		return sanitizeMulti(JSON.parse(readFileSync(file, "utf8")));
	} catch {
		return { ...EMPTY_MULTI_HYBRID, global: { ...EMPTY }, wallets: {} };
	}
}

export function saveState(
	state: AgentState | MultiWalletState | HybridState,
	file = DEFAULT_FILE,
): void {
	try {
		let toSave: {
			version: 2;
			global: AgentState;
			wallets: Record<string, WalletAgentState>;
		};
		if (
			isRecord(state as unknown as Record<string, unknown>) &&
			(state as unknown as Record<string, unknown>).version === 2 &&
			isRecord((state as unknown as Record<string, unknown>).global) &&
			isRecord((state as unknown as Record<string, unknown>).wallets)
		) {
			const multi = state as MultiWalletState;
			toSave = { version: 2, global: multi.global, wallets: multi.wallets };
		} else {
			const flat = sanitizeAgentState(state as unknown);
			const wallets: Record<string, WalletAgentState> = {};
			const hasData =
				flat.plans.length > 0 ||
				flat.cooldowns.length > 0 ||
				flat.executions.length > 0 ||
				Object.keys(flat.oorSince).length > 0;
			if (hasData) {
				wallets.primary = { wallet: "primary", ...flat };
			}
			toSave = { version: 2, global: { ...flat }, wallets };
		}
		writeFileSync(file, JSON.stringify(toSave, null, 2), "utf8");
	} catch (e) {
		console.warn("[agent] state write failed:", e);
	}
}

/** Clears all cooldowns and persists. Supports both flat and hybrid. */
export function clearCooldowns(
	state: AgentState | MultiWalletState | HybridState,
	file = DEFAULT_FILE,
): void {
	if (
		isRecord(state as unknown as Record<string, unknown>) &&
		(state as unknown as Record<string, unknown>).version === 2
	) {
		const multi = state as HybridState;
		for (const w of Object.values(multi.wallets)) w.cooldowns = [];
		multi.cooldowns = [];
		multi.global.cooldowns = [];
		saveState(multi, file);
		return;
	}
	(state as AgentState).cooldowns = [];
	saveState(state as AgentState, file);
}

export function getWalletState(
	state: HybridState,
	wallet: string,
): WalletAgentState {
	if (state.wallets[wallet]) return state.wallets[wallet];
	const empty: WalletAgentState = {
		wallet,
		enabled: state.global.enabled,
		running: false,
		lastCycleAt: null,
		llmStatus: "skipped",
		cycle: 0,
		plans: [],
		executions: [],
		cooldowns: [],
		oorSince: {},
	};
	return empty;
}

export function ensureWalletState(
	state: HybridState,
	wallet: string,
	label?: string,
): WalletAgentState {
	if (!state.wallets[wallet]) {
		state.wallets[wallet] = {
			wallet,
			label,
			enabled: true,
			running: false,
			lastCycleAt: null,
			llmStatus: "skipped",
			cycle: 0,
			plans: [],
			executions: [],
			cooldowns: [],
			oorSince: {},
		};
	} else if (label && !state.wallets[wallet].label) {
		state.wallets[wallet].label = label;
	}
	return state.wallets[wallet];
}
