import { describe, expect, it, vi } from "vitest";
import type { RuntimeAgent } from "../src/telegram/agent/engine.js";
import { createBotRuntime } from "../src/telegram/bot-runtime.js";

describe("BotRuntime", () => {
	it("exposes the agent and stops it once", async () => {
		const stopAgent = vi.fn();
		const stopBot = vi.fn().mockResolvedValue(undefined);
		const agent = { stop: stopAgent } as unknown as RuntimeAgent;
		const bot = { stop: stopBot };
		const handle = createBotRuntime(bot as never, agent);

		expect(handle.agent).toBe(agent);
		await handle.stop();
		await handle.stop();
		expect(stopAgent).toHaveBeenCalledOnce();
		expect(stopBot).toHaveBeenCalledOnce();
	});
});
