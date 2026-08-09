import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { LlmStatus } from "./state.js";

export type JournalAction = "open" | "hold" | "tp" | "sl" | "close";

export interface JournalCandidate {
	pool: string;
	poolName: string;
	heuristicScore: number;
	rationale: string | null;
	action: JournalAction;
	guardrail: "pass" | "blocked";
	blockedReason: string | null;
	execution: "ok" | "failed" | null;
	txSignature: string | null;
}

export interface AgentJournalEntry {
	ts: string;
	cycle: number;
	llmStatus: LlmStatus;
	candidates: JournalCandidate[];
}

const DEFAULT_FILE = join(process.cwd(), ".vexis-agent-journal.jsonl");

export function appendJournal(
	entry: AgentJournalEntry,
	file = DEFAULT_FILE,
): void {
	try {
		mkdirSync(dirname(file), { recursive: true });
		appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");
	} catch (e) {
		console.warn("[agent] journal write failed:", e);
	}
}

export function readJournal(n = 10, file = DEFAULT_FILE): AgentJournalEntry[] {
	if (!existsSync(file)) return [];
	try {
		const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
		const parsed: AgentJournalEntry[] = [];
		for (const line of lines.slice(-Math.max(1, n))) {
			try {
				parsed.push(JSON.parse(line) as AgentJournalEntry);
			} catch {}
		}
		return parsed;
	} catch {
		return [];
	}
}

export function readJournalAll(file = DEFAULT_FILE): AgentJournalEntry[] {
	return readJournal(Number.MAX_SAFE_INTEGER, file);
}
