import type { AgentJournalEntry } from "./journal.js";
import type { PerfRecord } from "./signalWeights.js";

export interface TradeStats {
	closes: number;
	wins: number;
	losses: number;
	winRate: number | null;
	avgPnlPct: number | null;
	bestPnl: number | null;
	worstPnl: number | null;
	totalPnlPct: number | null;
}

export function tradeStats(perf: readonly PerfRecord[]): TradeStats {
	if (perf.length === 0) {
		return {
			closes: 0,
			wins: 0,
			losses: 0,
			winRate: null,
			avgPnlPct: null,
			bestPnl: null,
			worstPnl: null,
			totalPnlPct: null,
		};
	}
	const pnls = perf.map((p) => p.pnlPct);
	const wins = pnls.filter((p) => p > 0).length;
	const losses = pnls.filter((p) => p < 0).length;
	const total = pnls.reduce((a, b) => a + b, 0);
	return {
		closes: pnls.length,
		wins,
		losses,
		winRate: (wins / pnls.length) * 100,
		avgPnlPct: total / pnls.length,
		bestPnl: Math.max(...pnls),
		worstPnl: Math.min(...pnls),
		totalPnlPct: total,
	};
}

export interface ActionCounts {
	open: number;
	hold: number;
	tp: number;
	sl: number;
	close: number;
	blocked: number;
	failed: number;
}

const EMPTY_COUNTS: ActionCounts = {
	open: 0,
	hold: 0,
	tp: 0,
	sl: 0,
	close: 0,
	blocked: 0,
	failed: 0,
};

export function actionCounts(
	entries: readonly AgentJournalEntry[],
): ActionCounts {
	const counts: ActionCounts = { ...EMPTY_COUNTS };
	for (const e of entries) {
		for (const c of e.candidates) {
			if (c.guardrail === "blocked") {
				counts.blocked += 1;
				continue;
			}
			counts[c.action] += 1;
			if (c.execution === "failed") counts.failed += 1;
		}
	}
	return counts;
}

/** Canonical PnL %: prefer SOL-side change, fall back to token-side. */
export function pnlPctValue(pos: {
	pnlSolPctChange: string | number | null;
	pnlPctChange: string;
}): number | null {
	if (pos.pnlSolPctChange != null) {
		const n = Number(pos.pnlSolPctChange);
		if (Number.isFinite(n)) return n;
	}
	const n = parseFloat(pos.pnlPctChange);
	return Number.isFinite(n) ? n : null;
}
