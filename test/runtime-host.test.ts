import { describe, expect, it, vi } from "vitest";
import { createRuntimeHost } from "../src/runtime-host.js";
import type { RuntimeAgent } from "../src/telegram/agent/engine.js";
import type { BotRuntime } from "../src/telegram/bot-runtime.js";

function fakeAgent(): RuntimeAgent {
	return { stop: vi.fn() } as unknown as RuntimeAgent;
}

function fakeHandle(agent: RuntimeAgent): BotRuntime {
	return {
		bot: {} as BotRuntime["bot"],
		agent,
		stop: vi.fn().mockResolvedValue(undefined),
	};
}

describe("RuntimeHost", () => {
	it("shares one startup result across concurrent callers", async () => {
		const agent = fakeAgent();
		const start = vi.fn().mockResolvedValue(fakeHandle(agent));
		const host = createRuntimeHost(start);

		const [a, b] = await Promise.all([host.ensure(), host.ensure()]);

		expect(a).toBe(agent);
		expect(b).toBe(agent);
		expect(start).toHaveBeenCalledOnce();
	});

	it("returns the same agent after startup", async () => {
		const agent = fakeAgent();
		const host = createRuntimeHost(
			vi.fn().mockResolvedValue(fakeHandle(agent)),
		);

		await host.ensure();

		expect(host.get()).toBe(agent);
	});

	it("does not retry a failed startup until stopped explicitly", async () => {
		const start = vi.fn().mockRejectedValue(new Error("missing config"));
		const host = createRuntimeHost(start);

		expect(await host.ensure()).toBeNull();
		expect(await host.ensure()).toBeNull();
		expect(start).toHaveBeenCalledOnce();

		await host.stop();
		expect(await host.ensure()).toBeNull();
		expect(start).toHaveBeenCalledTimes(2);
	});
});
