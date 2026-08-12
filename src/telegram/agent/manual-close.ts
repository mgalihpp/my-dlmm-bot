import { resolveAgentConfigFrom } from "../../services/Config.js";
import { getConfig } from "../fx.js";
import type { RuntimeAgent } from "./engine.js";
import { recordCooldown } from "./guardrails.js";
import { type AgentState, saveState } from "./state.js";

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

/** Records a pool cooldown after a manual close from Telegram. No-op when the
 * agent runtime is unavailable (e.g. no chatId configured). Never throws — a
 * failed cooldown record must not fail the close flow. */
export async function recordManualClose(
	getRt: () => RuntimeAgent | null,
	pool: string,
	poolName: string,
	baseMint: string | null,
): Promise<void> {
	const rt = getRt();
	if (!rt) return;
	try {
		const cfg = resolveAgentConfigFrom(await getConfig());
		recordManualCloseCooldown(
			rt.state,
			{ pool, poolName, baseMint },
			cfg.poolCooldownMs,
		);
	} catch (e) {
		console.warn("[agent] manual close cooldown record failed:", e);
	}
}
