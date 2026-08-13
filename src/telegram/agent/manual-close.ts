import { resolveAgentConfigFrom } from "../../services/Config.js";
import { getConfig } from "../fx.js";
import type { RuntimeAgent } from "./engine.js";
import { recordCooldown } from "./guardrails.js";
import { type AgentState, loadState, saveState } from "./state.js";

/** Appends a pool cooldown entry (`reason: "closed manually"`) to agent state
 * and persists. Expired entries are pruned by `recordCooldown`. */
export function recordManualCloseCooldown(
	state: AgentState,
	input: { pool: string; poolName: string; baseMint: string | null },
	durationMs: number,
	file?: string,
): void {
	state.cooldowns = recordCooldown(
		state.cooldowns,
		{ ...input, reason: "closed manually" },
		durationMs,
		Date.now(),
	);
	saveState(state, file);
}

/** Chooses the state source for a manual close cooldown: the live runtime's
 * in-memory state when the agent is active, otherwise the persisted on-disk
 * state (`.vexis-agent.json`) so the cooldown survives until the agent starts.
 * Returns the mutated state. */
export function applyManualCloseCooldown(
	rt: RuntimeAgent | null,
	input: { pool: string; poolName: string; baseMint: string | null },
	durationMs: number,
	file?: string,
): AgentState {
	const state = rt?.state ?? loadState(file);
	recordManualCloseCooldown(state, input, durationMs, file);
	return state;
}

/** Records a pool cooldown after a manual close from Telegram. No-op when the
 * agent is not enabled in config. When the agent runtime is unavailable (not
 * started), falls back to the persisted state so the cooldown is still honored
 * once the agent starts. Never throws — a failed cooldown record must not fail
 * the close flow. */
export async function recordManualClose(
	getRt: () => RuntimeAgent | null,
	pool: string,
	poolName: string,
	baseMint: string | null,
): Promise<void> {
	try {
		const cfg = resolveAgentConfigFrom(await getConfig());
		if (!cfg.enabled) return;
		applyManualCloseCooldown(
			getRt(),
			{ pool, poolName, baseMint },
			cfg.poolCooldownMs,
		);
	} catch (e) {
		console.warn("[agent] manual close cooldown record failed:", e);
	}
}
