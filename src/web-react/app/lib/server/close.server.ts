import "~/lib/server/env.server";

import { join } from "node:path";
import { errorMessage } from "@vexis/errors.js";
import { AppLayer } from "@vexis/layers.js";
import { Zap } from "@vexis/services/Zap.js";
import { Effect } from "effect";
import { getBotRuntime } from "../../../../runtime-host.js";
import { recordManualClose } from "../../../../telegram/agent/manual-close.js";
import { repoRoot } from "./env.server";

export type CloseResult =
	| { ok: true; sig: string }
	| { ok: false; error: string };

export function validateCloseInput(
	pool: string,
	position: string,
): string | null {
	if (!pool.trim() || !position.trim()) {
		return "pool and position are required";
	}
	return null;
}

export function pickCloseSig(result: {
	closeSig?: string;
	zapSig?: string;
}): string {
	return result.zapSig || result.closeSig || "";
}

export function closePosition(
	pool: string,
	position: string,
	poolName: string,
	walletParam?: string | null,
): Promise<CloseResult> {
	const invalid = validateCloseInput(pool, position);
	if (invalid) return Promise.resolve({ ok: false, error: invalid });

	const program = Effect.gen(function* () {
		const zap = yield* Zap;
		// walletParam is accepted for future per-wallet Zap routing; currently Zap uses the default signer,
		// but we persist the wallet association for manual cooldown and UI.
		void walletParam;
		const res = yield* zap.closeAndZapOut(pool, position);
		const sig = pickCloseSig(res);
		if (!sig) throw new Error("Close produced no transaction signature");
		yield* Effect.promise(() =>
			recordManualClose(
				getBotRuntime,
				pool,
				poolName.trim(),
				null,
				join(repoRoot(), ".vexis-agent.json"),
			),
		);
		return { ok: true, sig } as const;
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll((error) =>
			Effect.succeed({ ok: false, error: errorMessage(error) } as const),
		),
	);
	return Effect.runPromise(program);
}
