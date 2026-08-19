import type { RuntimeAgent } from "./telegram/agent/engine.js";
import { type BotRuntime, startBot } from "./telegram/bot-runtime.js";

export interface RuntimeHost {
	ensure(): Promise<RuntimeAgent | null>;
	get(): RuntimeAgent | null;
	stop(): Promise<void>;
}

export type BotStarter = () => Promise<BotRuntime | null>;

export function createRuntimeHost(start: BotStarter): RuntimeHost {
	let handle: BotRuntime | null = null;
	let startPromise: Promise<RuntimeAgent | null> | null = null;
	let unavailable = false;

	const ensure = (): Promise<RuntimeAgent | null> => {
		if (handle) return Promise.resolve(handle.agent);
		if (unavailable) return Promise.resolve(null);
		if (startPromise) return startPromise;

		startPromise = start()
			.then((next) => {
				handle = next;
				if (!next) unavailable = true;
				return next?.agent ?? null;
			})
			.catch((error: unknown) => {
				unavailable = true;
				console.error("Bot runtime startup failed:", error);
				return null;
			})
			.finally(() => {
				startPromise = null;
			});

		return startPromise;
	};

	return {
		ensure,
		get: () => handle?.agent ?? null,
		async stop() {
			if (startPromise) await startPromise;
			if (handle) await handle.stop();
			handle = null;
			unavailable = false;
		},
	};
}

const GLOBAL_KEY = "__vexisRuntimeHost";
type RuntimeGlobal = typeof globalThis & {
	[GLOBAL_KEY]?: RuntimeHost;
};

const globalRuntime = globalThis as RuntimeGlobal;
const productionHost =
	globalRuntime[GLOBAL_KEY] ?? createRuntimeHost(() => startBot());
globalRuntime[GLOBAL_KEY] = productionHost;

export function ensureBotRuntime(): Promise<RuntimeAgent | null> {
	return productionHost.ensure();
}

export function getBotRuntime(): RuntimeAgent | null {
	return productionHost.get();
}

export function stopBotRuntime(): Promise<void> {
	return productionHost.stop();
}
