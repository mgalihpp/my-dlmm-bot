import { resolveAgentConfigFrom } from "../../services/Config.js";
import { getConfig } from "../fx.js";
import type { RuntimeAgent } from "./engine.js";
import { recordCooldown } from "./guardrails.js";
import { type AgentState, loadState, saveState } from "./state.js";

/** Appends a pool cooldown entry (`reason: "closed manually"`) to agent state
 * and persists. Expired entries are pruned by `recordCooldown`. The cooldown is
 * scoped to `wallet` only — manual closes must not block other wallets. */
export function recordManualCloseCooldown(
	state: AgentState | import("./state.js").HybridState,
	input: { pool: string; poolName: string; baseMint: string | null },
	durationMs: number,
	wallet: string | null,
	file?: string,
): void {
	const maybeHybrid = state as unknown as Record<string, unknown>;
	if (maybeHybrid.version === 2) {
		const hybrid = state as unknown as import("./state.js").HybridState;
		// Target the specific wallet so isolation is preserved. Fall back to the
		// single configured wallet, legacy `primary`, or global when the wallet
		// isn't found (covers v1 single-wallet state).
		const target =
			(wallet && hybrid.wallets[wallet]) ||
			Object.values(hybrid.wallets)[0] ||
			hybrid.wallets.primary;
		const base = (target?.cooldowns ??
			hybrid.cooldowns ??
			[]) as AgentState["cooldowns"];
		const next = recordCooldown(
			base,
			{ ...input, reason: "closed manually" },
			durationMs,
			Date.now(),
		);
		if (target) {
			target.cooldowns = [...next];
		} else {
			// pure v1 flat state (no wallets, no primary)
			hybrid.cooldowns = [...next];
		}
		// keep global in sync for legacy/flat readers (aggregate view ignores
		// global when per-wallet state exists, so this does not leak to others)
		hybrid.global.cooldowns = [...next];
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
	wallet: string | null,
	file?: string,
): AgentState | import("./state.js").HybridState {
	const state = (rt?.state as unknown) ?? loadState(file);
	recordManualCloseCooldown(
		state as AgentState | import("./state.js").HybridState,
		input,
		durationMs,
		wallet,
		file,
	);
	return state as AgentState | import("./state.js").HybridState;
}

/** Records a pool cooldown after a manual close from Telegram or the web UI.
 * No-op when the agent is not enabled in config. When the agent runtime is
 * unavailable (not started), falls back to the persisted state so the cooldown
 * is still honored once the agent starts. Never throws — a failed cooldown
 * record must not fail the close flow. */
export async function recordManualClose(
	getRt: () => RuntimeAgent | null,
	pool: string,
	poolName: string,
	baseMint: string | null,
	wallet: string | null,
	file?: string,
): Promise<void> {
	try {
		const cfg = resolveAgentConfigFrom(await getConfig());
		if (!cfg.enabled) return;
		applyManualCloseCooldown(
			getRt(),
			{ pool, poolName, baseMint },
			cfg.poolCooldownMs,
			wallet,
			file,
		);
	} catch (e) {
		console.warn("[agent] manual close cooldown record failed:", e);
	}
}
