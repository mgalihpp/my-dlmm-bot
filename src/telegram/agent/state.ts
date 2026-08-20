import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

const DEFAULT_FILE = join(process.cwd(), ".vexis-agent.json");

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

function sanitize(raw: unknown): AgentState {
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

export function loadState(file = DEFAULT_FILE): AgentState {
	if (!existsSync(file)) return { ...EMPTY };
	try {
		return sanitize(JSON.parse(readFileSync(file, "utf8")));
	} catch {
		return { ...EMPTY };
	}
}

export function saveState(state: AgentState, file = DEFAULT_FILE): void {
	try {
		writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
	} catch (e) {
		console.warn("[agent] state write failed:", e);
	}
}

/** Clears all cooldowns and persists. */
export function clearCooldowns(state: AgentState, file = DEFAULT_FILE): void {
	state.cooldowns = [];
	saveState(state, file);
}
