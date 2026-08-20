import "~/lib/server/env.server";

import { join } from "node:path";
import { loadConfigSync } from "@vexis/services/Config.js";
import {
	type AnalyticsPayload,
	type AnalyticsRange,
	buildAnalytics,
	parseRange,
} from "@vexis/shared/agent-analytics.js";
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
import type {
	PerfRecord,
	SignalName,
} from "@vexis/telegram/agent/signalWeights.js";
import {
	loadSignalWeights,
	SIGNAL_NAMES,
} from "@vexis/telegram/agent/signalWeights.js";
import type { AgentState } from "@vexis/telegram/agent/state.js";
import { loadState } from "@vexis/telegram/agent/state.js";
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
	readonly range: AnalyticsRange;
	readonly analytics: AnalyticsPayload;
	readonly state?: AgentStateSummary;
	readonly stats?: AgentStats;
	readonly narrative?: NarrativeResult;
	readonly total?: number;
	readonly page?: number;
	readonly pages?: number;
	readonly chart?: readonly CyclePoint[];
	readonly groups?: readonly TimelineGroup[];
	readonly wallet?: string;
	readonly rpc?: string;
}

export function buildAgentPayload(
	journal: readonly AgentJournalEntry[],
	state: AgentState,
	narrative: NarrativeResult,
	rawAction: string | null,
	page: number,
	rawRange: string | null = "30d",
	signals?: {
		perf: readonly PerfRecord[];
		weights: Record<SignalName, number>;
	},
): AgentPayload {
	const filter = parseJournalFilter(rawAction);
	const range = parseRange(rawRange);
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
	const perf = signals?.perf ?? [];
	const weights =
		signals?.weights ??
		(Object.fromEntries(SIGNAL_NAMES.map((s) => [s, 1])) as Record<
			SignalName,
			number
		>);
	const analytics = buildAnalytics({
		journal,
		perf,
		weights,
		range,
		nowMs: Date.now(),
	});
	return {
		ok: true,
		wallet: undefined,
		rpc: undefined,
		filter,
		range,
		analytics,
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
	rawRange: string | null = "30d",
): AgentPayload {
	const root = repoRoot();
	const journal = readJournalAll(join(root, ".vexis-agent-journal.jsonl"));
	const state = loadState(join(root, ".vexis-agent.json"));
	const signalWeights = loadSignalWeights(
		join(root, ".vexis-agent-signals.json"),
	);
	const cachedBriefing = readBriefingCache(
		join(root, ".vexis-agent-briefing.json"),
	);
	const narrative = cachedBriefing
		? { text: cachedBriefing.text, source: cachedBriefing.source }
		: { text: "Belum ada briefing Telegram.", source: "fallback" as const };
	const payload = buildAgentPayload(
		journal,
		state,
		narrative,
		rawAction,
		page,
		rawRange,
		{ perf: signalWeights.perf, weights: signalWeights.weights },
	);
	const { config } = loadConfigSync();
	return { ...payload, wallet: config.wallet, rpc: config.rpcUrl };
}
