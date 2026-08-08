import { describe, expect, it } from "vitest";
import type { VexisConfig } from "../src/domain/config.js";
import { resolveAgentConfigFrom } from "../src/services/Config.js";

describe("resolveAgentConfigFrom", () => {
	it("applies defaults when agent is absent", () => {
		const c = resolveAgentConfigFrom({}, {});
		expect(c.enabled).toBe(false);
		expect(c.intervalMinutes).toBe(15);
		expect(c.maxCandidates).toBe(5);
		expect(c.minCandidate).toBe(70);
		expect(c.maxSolPerPosition).toBe(0.5);
		expect(c.maxTotalSol).toBe(3);
		expect(c.maxOpenPositions).toBe(4);
		expect(c.txCooldownMs).toBe(300_000);
		expect(c.tpPct).toBe(25);
		expect(c.slPct).toBe(-10);
		expect(c.llm.model).toBe("gpt-4o-mini");
		expect(c.llm.timeoutMs).toBe(120_000);
	});

	it("falls back to global tp/sl and env api key", () => {
		const cfg: VexisConfig = {
			takeProfitPct: 40,
			stopLossPct: -5,
		};
		const c = resolveAgentConfigFrom(cfg, { OPENAI_API_KEY: "env-key" });
		expect(c.tpPct).toBe(40);
		expect(c.slPct).toBe(-5);
		expect(c.llm.apiKey).toBe("env-key");
	});

	it("uses explicit agent overrides", () => {
		const cfg: VexisConfig = {
			agent: {
				enabled: true,
				intervalMinutes: 60,
				llm: {
					apiKey: "key",
					model: "deepseek-chat",
					baseUrl: "https://x/v1",
				},
			},
		};
		const c = resolveAgentConfigFrom(cfg, {});
		expect(c.enabled).toBe(true);
		expect(c.intervalMinutes).toBe(60);
		expect(c.llm.apiKey).toBe("key");
		expect(c.llm.model).toBe("deepseek-chat");
		expect(c.llm.baseUrl).toBe("https://x/v1");
	});
});
