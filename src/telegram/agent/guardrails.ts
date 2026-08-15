import type { PositionCostQuote } from "../../domain/onchain.js";
import type { OpenPool } from "../../domain/portfolio.js";
import type { ScreenedPool } from "../../domain/screened.js";
import type {
	ResolvedAgentConfig,
	ResolvedAgentRisks,
} from "../../services/Config.js";
import type { AgentCooldown, AgentExecution, AgentPlan } from "./state.js";

export interface GuardOk {
	ok: boolean;
	reason: string | null;
}

export function checkOpenGuardrail(input: {
	amountSol: number;
	deployedSol: number;
	maxSolPerPosition: number;
	maxTotalSol: number;
	maxOpenPositions: number;
	openPositionCount?: number;
}): GuardOk {
	if (input.amountSol > input.maxSolPerPosition + 1e-9) {
		return {
			ok: false,
			reason: `amount ${input.amountSol.toFixed(3)} > per-position cap ${input.maxSolPerPosition.toFixed(3)}`,
		};
	}
	if (input.deployedSol + input.amountSol > input.maxTotalSol + 1e-9) {
		return {
			ok: false,
			reason: `total ${(input.deployedSol + input.amountSol).toFixed(3)} > cap ${input.maxTotalSol.toFixed(3)}`,
		};
	}
	if (
		input.openPositionCount !== undefined &&
		input.openPositionCount >= input.maxOpenPositions
	) {
		return {
			ok: false,
			reason: `already ${input.openPositionCount} open positions`,
		};
	}
	return { ok: true, reason: null };
}

/** Blocks opening when the position quote includes non-refundable rent (new bin arrays / bitmap extension). */
export function checkRent(quote: PositionCostQuote): GuardOk {
	if (quote.nonRefundableCost > 0) {
		return {
			ok: false,
			reason: `non-refundable rent ${quote.nonRefundableCost.toFixed(4)} SOL`,
		};
	}
	return { ok: true, reason: null };
}

/** Blocks opening when a plan already exists on the same pool or same base token. */
export function checkDuplicate(input: {
	pool: string;
	baseMint: string;
	plans: ReadonlyArray<{ pool: string; baseMint?: string | null }>;
}): GuardOk {
	for (const p of input.plans) {
		if (p.pool === input.pool) {
			return { ok: false, reason: "already open on this pool" };
		}
		if (p.baseMint != null && p.baseMint === input.baseMint) {
			return { ok: false, reason: "already open on same token" };
		}
	}
	return { ok: true, reason: null };
}

export function checkCooldown(input: {
	lastExecutionAt: number | null;
	nowMs: number;
	txCooldownMs: number;
}): GuardOk {
	if (input.lastExecutionAt == null) return { ok: true, reason: null };
	if (input.nowMs - input.lastExecutionAt < input.txCooldownMs) {
		return { ok: false, reason: "within tx cooldown" };
	}
	return { ok: true, reason: null };
}

/** Timestamp of the most recent successful OPEN, ignoring tp/sl/close executions. */
export function lastOpenExecutionAt(
	executions: ReadonlyArray<AgentExecution>,
): number | null {
	for (let i = executions.length - 1; i >= 0; i--) {
		if (executions[i].action === "open") {
			return Date.parse(executions[i].at);
		}
	}
	return null;
}

/** SOL amount to deploy for one new position, bounded by the remaining budget. */
export function deriveOpenAmount(
	deployedSol: number,
	cfg: ResolvedAgentConfig,
): number {
	const wanted = Math.min(
		cfg.maxSolPerPosition,
		Math.max(0, cfg.maxTotalSol - deployedSol),
	);
	return Math.max(0, Math.round(wanted * 1000) / 1000);
}

export function checkRisks(input: {
	pool: {
		isRugpull?: boolean | null;
		isWash?: boolean | null;
		bundlePct?: number | null;
		botHoldersPct?: number | null;
		top10Pct?: number | null;
		globalFeesSol?: number | null;
		devSoldAll?: boolean | null;
		dexScreenerPaid?: boolean | null;
		priceVsAthPct?: number | null;
		fromAthPct?: number | null;
		rugScore?: number | null;
	};
	risks: ResolvedAgentRisks;
}): GuardOk {
	const { risks, pool } = input;
	if (!risks.enabled) return { ok: true, reason: null };
	if (risks.blockRugpull && pool.isRugpull === true) {
		return { ok: false, reason: "rugpull flagged" };
	}
	if (pool.rugScore != null && pool.rugScore > risks.maxRugScore) {
		return {
			ok: false,
			reason: `rugScore ${pool.rugScore} > ${risks.maxRugScore}`,
		};
	}
	if (risks.blockWash && pool.isWash === true) {
		return { ok: false, reason: "wash trading flagged" };
	}
	if (pool.bundlePct != null && pool.bundlePct > risks.maxBundlePct) {
		return {
			ok: false,
			reason: `bundle ${pool.bundlePct.toFixed(2)}% > ${risks.maxBundlePct.toFixed(2)}%`,
		};
	}
	if (
		pool.botHoldersPct != null &&
		pool.botHoldersPct > risks.maxBotHoldersPct
	) {
		return {
			ok: false,
			reason: `bot holders ${pool.botHoldersPct.toFixed(2)}% > ${risks.maxBotHoldersPct.toFixed(2)}%`,
		};
	}
	if (pool.top10Pct != null && pool.top10Pct > risks.maxTop10Pct) {
		return {
			ok: false,
			reason: `top10 ${pool.top10Pct.toFixed(2)}% > ${risks.maxTop10Pct.toFixed(2)}%`,
		};
	}
	if (
		pool.globalFeesSol != null &&
		pool.globalFeesSol < risks.minTokenFeesSol
	) {
		return {
			ok: false,
			reason: `global fees ${pool.globalFeesSol.toFixed(2)} SOL < ${risks.minTokenFeesSol.toFixed(2)} SOL`,
		};
	}
	if (risks.blockDexScreenerPaid && pool.dexScreenerPaid === true) {
		return { ok: false, reason: "dex screener paid boost flagged" };
	}
	if (risks.blockDevSoldAll && pool.devSoldAll === true) {
		return { ok: false, reason: "dev sold all holdings" };
	}
	// % below ATH (0 = at ATH, 20 = 800k on a 1M ATH). Block opens too close to ATH.
	const fromAthPct =
		pool.fromAthPct ??
		(pool.priceVsAthPct != null ? 1 - pool.priceVsAthPct / 100 : null);
	if (fromAthPct != null && fromAthPct * 100 < risks.minFromAthPct) {
		return {
			ok: false,
			reason: `price ${(fromAthPct * 100).toFixed(2)}% from ATH < ${risks.minFromAthPct.toFixed(2)}%`,
		};
	}
	return { ok: true, reason: null };
}

/** Pools matching an active cooldown (by pool address or baseMint) are skipped before ranking/LLM. */
export function filterCooldown(
	pools: readonly ScreenedPool[],
	cooldowns: readonly AgentCooldown[],
	nowMs: number,
): { pools: ScreenedPool[]; skipped: number } {
	const active = cooldowns.filter((c) => Date.parse(c.until) > nowMs);
	const out: ScreenedPool[] = [];
	let skipped = 0;
	for (const p of pools) {
		const blocked = active.some(
			(c) =>
				c.pool === p.pool || (c.baseMint != null && c.baseMint === p.baseMint),
		);
		if (blocked) skipped++;
		else out.push(p);
	}
	return { pools: out, skipped };
}

/** Pools with an existing open plan (same pool address or baseMint) are skipped before ranking/LLM. */
export function filterDuplicates(
	pools: readonly ScreenedPool[],
	plans: ReadonlyArray<{ pool: string; baseMint?: string | null }>,
): { pools: ScreenedPool[]; skipped: number } {
	const out: ScreenedPool[] = [];
	let skipped = 0;
	for (const p of pools) {
		const dup = plans.some(
			(pl) =>
				pl.pool === p.pool ||
				(pl.baseMint != null && pl.baseMint === p.baseMint),
		);
		if (dup) skipped++;
		else out.push(p);
	}
	return { pools: out, skipped };
}

export function checkPoolCooldown(
	pool: string,
	baseMint: string | null,
	cooldowns: readonly AgentCooldown[],
	nowMs: number,
): GuardOk {
	for (const c of cooldowns) {
		if (Date.parse(c.until) <= nowMs) continue;
		if (c.pool === pool || (c.baseMint != null && c.baseMint === baseMint)) {
			return { ok: false, reason: `cooldown until ${c.until} (${c.reason})` };
		}
	}
	return { ok: true, reason: null };
}

/** Cooldown reasons recorded right after a close — only these may block a
 * later close (re-adopted stale on-chain API after a close). Cooldowns from
 * blocked opens (duplicate/risk/guardrail) must never block closing an
 * existing position, or TP/SL gets stuck on pools that were simply vetoed
 * for opening. */
const CLOSE_COOLDOWN_REASON = /(triggered|closed|retried)/;

function isCloseCooldown(c: AgentCooldown): boolean {
	return CLOSE_COOLDOWN_REASON.test(c.reason);
}

/**
 * Close gate: blocks a close when the plan is no longer tracked (already
 * closed this cycle by another path, e.g. the OOR flow) or the pool is still
 * in a close-origin cooldown (e.g. re-adopted from a stale on-chain API right
 * after a close).
 */
export function checkCloseGate(
	plan: { pool: string; baseMint?: string | null },
	plans: ReadonlyArray<{ pool: string }>,
	cooldowns: readonly AgentCooldown[],
	nowMs: number,
): GuardOk {
	if (!plans.some((p) => p.pool === plan.pool)) {
		return { ok: false, reason: "plan no longer tracked" };
	}
	for (const c of cooldowns) {
		if (!isCloseCooldown(c)) continue;
		const gate = checkPoolCooldown(
			plan.pool,
			plan.baseMint ?? null,
			[c],
			nowMs,
		);
		if (!gate.ok) return gate;
	}
	return { ok: true, reason: null };
}

/**
 * In-flight close lock: only one close may be in progress per position at a
 * time. Concurrent loops (fast check, OOR check, cycle) can both decide to
 * close the same position within the same second — the cooldown gate alone
 * cannot stop that because cooldown is recorded only after a close completes.
 * Callers must add the position to the set after a successful claim and remove
 * it when the close finishes (finally).
 */
export function claimClose(
	positionAddress: string,
	inFlight: ReadonlySet<string>,
): GuardOk {
	if (inFlight.has(positionAddress)) {
		return { ok: false, reason: "close already in flight" };
	}
	return { ok: true, reason: null };
}

/** Returns a new list with the entry added and expired entries pruned. */
export function recordCooldown(
	cooldowns: readonly AgentCooldown[],
	input: {
		pool: string;
		poolName: string;
		baseMint: string | null;
		reason: string;
	},
	durationMs: number,
	nowMs: number,
): AgentCooldown[] {
	const active = cooldowns.filter((c) => Date.parse(c.until) > nowMs);
	return [
		...active,
		{
			pool: input.pool,
			poolName: input.poolName,
			baseMint: input.baseMint,
			until: new Date(nowMs + durationMs).toISOString(),
			reason: input.reason,
		},
	];
}

/**
 * Reconciles plans against the on-chain open portfolio: adopts positions the
 * agent does not track yet (opened manually or before a fresh start) and, when
 * the portfolio response is complete, prunes tracked positions that are no
 * longer on-chain (e.g. closed manually). Only plans with a confirmed
 * positionAddress are pruned — pending opens are kept until confirmed. Pools
 * with an active cooldown are never adopted: the on-chain API may still list a
 * position for a few seconds after a close, which would otherwise re-track it
 * right after the agent closed it.
 */
export function adoptOnchainPlans(
	plans: readonly AgentPlan[],
	openPools: readonly Pick<
		OpenPool,
		| "poolAddress"
		| "tokenX"
		| "tokenY"
		| "tokenXMint"
		| "openPositionCount"
		| "listPositions"
	>[],
	opts: {
		complete?: boolean;
		cooldowns?: readonly AgentCooldown[];
		nowMs?: number;
	} = {},
): readonly AgentPlan[] {
	const { complete = true, cooldowns = [], nowMs = Date.now() } = opts;
	const openPoolSet = new Set(openPools.map((p) => p.poolAddress));
	// Skip pruning when the response may be truncated (pagination) — a missing
	// pool could simply be on a later page, and pruning would wrongly drop it.
	const kept =
		complete === true
			? plans.filter(
					(p) => p.positionAddress == null || openPoolSet.has(p.pool),
				)
			: plans;
	const known = new Set(kept.map((p) => p.pool));
	const adopted: AgentPlan[] = [];
	for (const pool of openPools) {
		if (pool.openPositionCount <= 0 || known.has(pool.poolAddress)) continue;
		if (
			!checkPoolCooldown(pool.poolAddress, pool.tokenXMint, cooldowns, nowMs).ok
		) {
			continue;
		}
		adopted.push({
			pool: pool.poolAddress,
			poolName: `${pool.tokenX}/${pool.tokenY}`,
			baseMint: pool.tokenXMint,
			amountSol: 0,
			positionAddress: pool.listPositions[0] ?? null,
			openedAt: null,
		});
		known.add(pool.poolAddress);
	}
	return adopted.length > 0 ? [...kept, ...adopted] : kept;
}
