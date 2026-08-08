import type { ScreenedPool } from "../../domain/screened.js";
import type {
	ResolvedAgentConfig,
	ResolvedAgentRisks,
} from "../../services/Config.js";
import type { AgentCooldown } from "./state.js";

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
			reason: `amount ${input.amountSol} > per-position cap ${input.maxSolPerPosition}`,
		};
	}
	if (input.deployedSol + input.amountSol > input.maxTotalSol + 1e-9) {
		return {
			ok: false,
			reason: `total ${input.deployedSol + input.amountSol} > cap ${input.maxTotalSol}`,
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
	};
	risks: ResolvedAgentRisks;
}): GuardOk {
	const { risks, pool } = input;
	if (!risks.enabled) return { ok: true, reason: null };
	if (risks.blockRugpull && pool.isRugpull === true) {
		return { ok: false, reason: "rugpull flagged" };
	}
	if (risks.blockWash && pool.isWash === true) {
		return { ok: false, reason: "wash trading flagged" };
	}
	if (pool.bundlePct != null && pool.bundlePct > risks.maxBundlePct) {
		return {
			ok: false,
			reason: `bundle ${pool.bundlePct}% > ${risks.maxBundlePct}%`,
		};
	}
	if (
		pool.botHoldersPct != null &&
		pool.botHoldersPct > risks.maxBotHoldersPct
	) {
		return {
			ok: false,
			reason: `bot holders ${pool.botHoldersPct}% > ${risks.maxBotHoldersPct}%`,
		};
	}
	if (pool.top10Pct != null && pool.top10Pct > risks.maxTop10Pct) {
		return {
			ok: false,
			reason: `top10 ${pool.top10Pct}% > ${risks.maxTop10Pct}%`,
		};
	}
	if (
		pool.globalFeesSol != null &&
		pool.globalFeesSol < risks.minTokenFeesSol
	) {
		return {
			ok: false,
			reason: `global fees ${pool.globalFeesSol} SOL < ${risks.minTokenFeesSol} SOL`,
		};
	}
	if (risks.blockDexScreenerPaid && pool.dexScreenerPaid === true) {
		return { ok: false, reason: "dex screener paid boost flagged" };
	}
	if (risks.blockDevSoldAll && pool.devSoldAll === true) {
		return { ok: false, reason: "dev sold all holdings" };
	}
	const athPct =
		pool.priceVsAthPct ??
		(pool.fromAthPct != null ? (1 - pool.fromAthPct) * 100 : null);
	if (athPct != null && athPct > risks.maxPriceVsAthPct) {
		return {
			ok: false,
			reason: `price ${athPct}% of ATH > ${risks.maxPriceVsAthPct}%`,
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
