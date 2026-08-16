import type { ScreenedPool } from "../../domain/screened.js";

export type OpenAction = "open" | "hold";

export interface OpenDecision {
	pool: string;
	action: OpenAction;
	rationale: string;
}

/** Anti-hallucination gate: only decisions for exact candidate pool ids survive. */
export function validateOpenDecisions(
	candidates: readonly Pick<ScreenedPool, "pool">[],
	decisions: readonly OpenDecision[],
): { decisions: OpenDecision[]; dropped: number } {
	const known = new Set(candidates.map((c) => c.pool));
	const seen = new Set<string>();
	const out: OpenDecision[] = [];
	let dropped = 0;
	for (const d of decisions) {
		if (!known.has(d.pool) || seen.has(d.pool)) {
			dropped += 1;
			continue;
		}
		seen.add(d.pool);
		out.push({ pool: d.pool, action: d.action, rationale: d.rationale });
	}
	return { decisions: out, dropped };
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

/**
 * True when a plan's position is younger than minAgeMs. The Meteora PnL API
 * reports pnl=-100% for positions its indexer has not settled yet (seconds
 * after open), which would trigger a false TP/SL. Plans with no openedAt
 * (adopted on-chain) are treated as mature.
 */
export function positionTooYoung(
	plan: { openedAt: string | null },
	minAgeMs: number,
	nowMs: number,
): boolean {
	if (plan.openedAt == null) return false;
	return nowMs - Date.parse(plan.openedAt) < minAgeMs;
}
