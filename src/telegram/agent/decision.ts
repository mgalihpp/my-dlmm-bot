import type { ScreenedPool } from "../../domain/screened.js";
import { heuristicScore } from "./heuristic.js";
import type { LlmSignal } from "./llm.js";

export type AgentAction = "open" | "hold";

export interface CandidateDecision {
	pool: ScreenedPool;
	heuristicScore: number;
	favorability: number | null;
	rationale: string | null;
	score: number;
	action: AgentAction;
}

/** favorability[-1,1] → merged 0-100, heuristic has 80% weight. */
export function combineScore(
	heuristic: number,
	favorability: number | null,
): number {
	if (favorability == null) return heuristic;
	const favFrame = ((favorability + 1) / 2) * 100;
	return Math.round(0.8 * heuristic + 0.2 * favFrame);
}

export function decideCandidates(input: {
	pools: readonly ScreenedPool[];
	signals: readonly LlmSignal[];
	minScoreToOpen: number;
	weights?: Record<string, number>;
}): CandidateDecision[] {
	const sigMap = new Map<string, LlmSignal>(
		input.signals.map((s) => [s.pool, s]),
	);
	return input.pools.map((pool) => {
		const h = heuristicScore(pool, input.weights);
		const sig = sigMap.get(pool.pool);
		const favorability = sig?.favorability ?? null;
		const score = combineScore(h, favorability);
		const open =
			score >= input.minScoreToOpen ||
			(favorability != null && favorability >= 0.5);
		return {
			pool,
			heuristicScore: h,
			favorability,
			rationale: sig?.rationale ?? null,
			score,
			action: open ? "open" : "hold",
		};
	});
}

export function tpslAction(
	pnlPct: number,
	tpPct: number,
	slPct: number,
): "tp" | "sl" | "hold" {
	if (tpPct != null && pnlPct >= tpPct) return "tp";
	if (slPct != null && pnlPct <= slPct) return "sl";
	return "hold";
}
