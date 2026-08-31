import "~/lib/server/env.server";

import { join } from "node:path";
import { errorMessage } from "@vexis/errors.js";
import { AppLayer } from "@vexis/layers.js";
import { Zap } from "@vexis/services/Zap.js";
import { Effect, Exit } from "effect";
import { getBotRuntime } from "../../../../runtime-host.js";
import { recordManualClose } from "../../../../telegram/agent/manual-close.js";
import { repoRoot } from "./env.server";
import { isValidSolanaAddress } from "./validate.server";

export type CloseResult =
	| { ok: true; sig: string; warning?: string }
	| { ok: false; error: string };

export function validateCloseInput(
	pool: string,
	position: string,
): string | null {
	if (!pool.trim() || !position.trim()) {
		return "pool and position are required";
	}
	if (!isValidSolanaAddress(pool.trim())) {
		return "pool is not a valid address";
	}
	if (!isValidSolanaAddress(position.trim())) {
		return "position is not a valid address";
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
): Promise<CloseResult> {
	const invalid = validateCloseInput(pool, position);
	if (invalid) return Promise.resolve({ ok: false, error: invalid });

	const program = Effect.gen(function* () {
		const zap = yield* Zap;
		const res = yield* zap.closeAndZapOut(pool, position);
		const sig = pickCloseSig(res);
		if (!sig) throw new Error("Close produced no transaction signature");
		const journal = yield* Effect.exit(
			Effect.promise(() =>
				recordManualClose(
					getBotRuntime,
					pool,
					poolName.trim(),
					null,
					join(repoRoot(), ".vexis-agent.json"),
				),
			),
		);
		return Exit.isFailure(journal)
			? ({
					ok: true,
					sig,
					warning: "closed on-chain but journal update failed",
				} as const)
			: ({ ok: true, sig } as const);
	}).pipe(
		Effect.provide(AppLayer),
		Effect.catchAll((error) =>
			Effect.succeed({ ok: false, error: errorMessage(error) } as const),
		),
	);
	return Effect.runPromise(program);
}
