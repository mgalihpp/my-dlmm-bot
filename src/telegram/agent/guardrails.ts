import type { ResolvedAgentConfig } from "../../services/Config.js";

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
