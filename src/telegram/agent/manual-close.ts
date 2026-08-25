import { resolveAgentConfigFrom } from "../../services/Config.js";
import { getConfig } from "../fx.js";
import type { RuntimeAgent } from "./engine.js";
import { recordCooldown } from "./guardrails.js";
import { type AgentState, loadState, saveState } from "./state.js";

/** Appends a pool cooldown entry (`reason: "closed manually"`) to agent state
 * and persists. Expired entries are pruned by `recordCooldown`. */
export function recordManualCloseCooldown(
	state: AgentState | import("./state.js").HybridState,
	input: { pool: string; poolName: string; baseMint: string | null },
	durationMs: number,
	file?: string,
): void {
	const maybeHybrid = state as unknown as Record<string, unknown>;
	if (maybeHybrid.version === 2) {
		const hybrid = state as unknown as import("./state.js").HybridState;
		const next = recordCooldown(
			hybrid.cooldowns,
			{ ...input, reason: "closed manually" },
			durationMs,
			Date.now(),
		);
		hybrid.cooldowns = next;
		hybrid.global.cooldowns = [...next];
		// keep primary wallet in sync for persistence
		if (!hybrid.wallets.primary) {
			hybrid.wallets.primary = {
				wallet: "primary",
				...hybrid.global,
				cooldowns: [...next],
			};
		} else {
			hybrid.wallets.primary.cooldowns = [...next];
		}
		// also sync to all existing wallets so manual close blocks all wallets (v1 behavior)
		for (const w of Object.values(hybrid.wallets)) {
			if (w !== hybrid.wallets.primary) w.cooldowns = [...next];
		}
		saveState(hybrid, file);
		return;
	}
	state.cooldowns = recordCooldown(
		(state as AgentState).cooldowns,
		{ ...input, reason: "closed manually" },
		durationMs,
		Date.now(),
	);
	saveState(state as AgentState, file);
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
): AgentState | import("./state.js").HybridState {
	const state = (rt?.state as unknown) ?? loadState(file);
	recordManualCloseCooldown(
		state as AgentState | import("./state.js").HybridState,
		input,
		durationMs,
		file,
	);
	return state as AgentState | import("./state.js").HybridState;
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
	file?: string,
): Promise<void> {
	try {
		const cfg = resolveAgentConfigFrom(await getConfig());
		if (!cfg.enabled) return;
		applyManualCloseCooldown(
			getRt(),
			{ pool, poolName, baseMint },
			cfg.poolCooldownMs,
			file,
		);
	} catch (e) {
		console.warn("[agent] manual close cooldown record failed:", e);
	}
}
