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
};

export function loadState(file = DEFAULT_FILE): AgentState {
	if (!existsSync(file)) return { ...EMPTY };
	try {
		const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<AgentState>;
		return { ...EMPTY, ...raw };
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
