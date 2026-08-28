import "~/lib/server/env.server";

import { join } from "node:path";
import { getWalletConfigs, loadConfigSync } from "@vexis/services/Config.js";
import {
	type AgentStats,
	agentStats,
	JOURNAL_PAGE_SIZE,
	type JournalFilter,
	journalRows,
	paginate,
	parseJournalFilter,
	type TimelineGroup,
	timelineGroups,
} from "@vexis/shared/agent-journal.js";
import type { NarrativeResult } from "@vexis/shared/agent-narrative.js";
import { readBriefingCache } from "@vexis/telegram/agent/briefing.js";
import type { AgentJournalEntry } from "@vexis/telegram/agent/journal.js";
import { readJournalAll } from "@vexis/telegram/agent/journal.js";
import type { AgentState } from "@vexis/telegram/agent/state.js";
import {
	aggregateAgentState,
	getWalletState,
	loadState,
} from "@vexis/telegram/agent/state.js";
import { repoRoot } from "./env.server";

export interface AgentStateSummary {
	readonly enabled: boolean;
	readonly running: boolean;
	readonly lastCycleAt: string | null;
	readonly llmStatus: "ok" | "failed" | "skipped";
	readonly cycle: number;
}

export interface CyclePoint {
	readonly cycle: number;
	readonly open: number;
	readonly tp: number;
	readonly sl: number;
	readonly close: number;
}

export interface AgentPayload {
	readonly ok: boolean;
	readonly error?: string;
	readonly filter?: JournalFilter;
	readonly state?: AgentStateSummary;
	readonly stats?: AgentStats;
	readonly narrative?: NarrativeResult;
	readonly total?: number;
	readonly page?: number;
	readonly pages?: number;
	readonly chart?: readonly CyclePoint[];
	readonly groups?: readonly TimelineGroup[];
	readonly wallet?: string;
	readonly wallets?: readonly { wallet: string; label?: string }[];
	readonly rpc?: string;
}

export function buildAgentPayload(
	journal: readonly AgentJournalEntry[],
	state: AgentState,
	narrative: NarrativeResult,
	rawAction: string | null,
	page: number,
): AgentPayload {
	const filter = parseJournalFilter(rawAction);
	const stats = agentStats(journal);
	const rows = journalRows(journal, filter);
	const paged = paginate(rows, page, JOURNAL_PAGE_SIZE);
	const chart = journal.slice(-12).map((entry) => ({
		cycle: entry.cycle,
		open: entry.candidates.filter(
			(c) => c.action === "open" && c.execution === "ok",
		).length,
		tp: entry.candidates.filter(
			(c) => c.action === "tp" && c.execution === "ok",
		).length,
		sl: entry.candidates.filter(
			(c) => c.action === "sl" && c.execution === "ok",
		).length,
		close: entry.candidates.filter(
			(c) => c.action === "close" && c.execution === "ok",
		).length,
	}));
	return {
		ok: true,
		wallet: undefined,
		rpc: undefined,
		filter,
		state: {
			enabled: state.enabled,
			running: state.running,
			lastCycleAt: state.lastCycleAt,
			llmStatus: state.llmStatus,
			cycle: state.cycle,
		},
		stats,
		narrative,
		total: paged.total,
		page: paged.page,
		pages: paged.pages,
		chart,
		groups: timelineGroups(paged.rows),
	};
}

export function fetchAgent(
	page: number,
	rawAction: string | null,
	walletParam?: string | null,
): AgentPayload {
	const root = repoRoot();
	const rawJournal = readJournalAll(join(root, ".vexis-agent-journal.jsonl"));
	const rawState = loadState(join(root, ".vexis-agent.json"));
	const { config } = loadConfigSync();
	const wallets = getWalletConfigs(config)
		.filter((w) => w.enabled !== false)
		.map((w) => ({ wallet: w.wallet, label: w.label }));
	let wallet: string | undefined = config.wallet;
	let state: AgentState = aggregateAgentState(rawState);
	let journal: readonly AgentJournalEntry[] = rawJournal;
	if (walletParam) {
		const found = wallets.find(
			(w) => w.wallet === walletParam || w.label === walletParam,
		);
		if (found) {
			wallet = found.wallet;
			journal = rawJournal.filter((j) => j.wallet === found.wallet);
			// if journal entries have no wallet (legacy), show all
			if (journal.length === 0 && rawJournal.some((j) => j.wallet == null)) {
				journal = rawJournal;
			}
			state = getWalletState(
				rawState as unknown as ReturnType<typeof loadState>,
				found.wallet,
			);
		} else if (wallets.length > 0) {
			wallet = wallets[0].wallet;
			journal = rawJournal.filter((j) => j.wallet === wallet);
			if (journal.length === 0 && rawJournal.some((j) => j.wallet == null)) {
				journal = rawJournal;
			}
			state = getWalletState(
				rawState as unknown as ReturnType<typeof loadState>,
				wallet,
			);
		}
	} else if (wallets.length > 0) {
		wallet = wallets[0].wallet;
		// default view: aggregated across per-wallet state (the engine writes
		// there, so the top-level flat fields are empty under multi-wallet)
	}
	const cachedBriefing = readBriefingCache(
		join(root, ".vexis-agent-briefing.json"),
	);
	const narrative = cachedBriefing
		? { text: cachedBriefing.text, source: cachedBriefing.source }
		: { text: "No Telegram briefing yet.", source: "fallback" as const };
	const payload = buildAgentPayload(journal, state, narrative, rawAction, page);
	return { ...payload, wallet, wallets, rpc: config.rpcUrl };
}
