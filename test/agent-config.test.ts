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
		expect(c.poolCooldownMs).toBe(24 * 3_600_000);
		expect(c.tpPct).toBe(25);
		expect(c.slPct).toBe(-10);
		expect(c.llm.model).toBe("gpt-4o-mini");
		expect(c.llm.timeoutMs).toBe(120_000);
	});

	it("honors poolCooldownMs override", () => {
		const c = resolveAgentConfigFrom({ agent: { poolCooldownMs: 60_000 } }, {});
		expect(c.poolCooldownMs).toBe(60_000);
	});

	it("defaults notifLevel to normal and honors override", () => {
		const c = resolveAgentConfigFrom({}, {});
		expect(c.notifLevel).toBe("normal");
		const c2 = resolveAgentConfigFrom(
			{ agent: { notifLevel: "errors-only" } },
			{},
		);
		expect(c2.notifLevel).toBe("errors-only");
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

	describe("resolveAgentConfigFrom risk/darwin defaults", () => {
		it("fills risks and darwin defaults", () => {
			const c = resolveAgentConfigFrom({}, {});
			expect(c.risks.enabled).toBe(true);
			expect(c.risks.minTokenFeesSol).toBe(30);
			expect(c.risks.maxBundlePct).toBe(30);
			expect(c.risks.maxBotHoldersPct).toBe(30);
			expect(c.risks.maxTop10Pct).toBe(60);
			expect(c.risks.maxPriceVsAthPct).toBe(80);
			expect(c.risks.blockWash).toBe(true);
			expect(c.risks.blockRugpull).toBe(true);
			expect(c.risks.blockDexScreenerPaid).toBe(true);
			expect(c.risks.blockDevSoldAll).toBe(true);
			expect(c.darwin.enabled).toBe(true);
			expect(c.darwin.windowDays).toBe(60);
			expect(c.darwin.recalcEvery).toBe(5);
			expect(c.darwin.boostFactor).toBe(1.05);
			expect(c.darwin.decayFactor).toBe(0.95);
			expect(c.darwin.weightFloor).toBe(0.3);
			expect(c.darwin.weightCeiling).toBe(2.5);
			expect(c.darwin.minSamples).toBe(10);
		});
		it("honors overrides", () => {
			const c = resolveAgentConfigFrom(
				{
					agent: {
						risks: { maxBundlePct: 15, blockWash: false },
						darwin: { boostFactor: 1.1, enabled: false },
					},
				},
				{},
			);
			expect(c.risks.maxBundlePct).toBe(15);
			expect(c.risks.blockWash).toBe(false);
			expect(c.darwin.boostFactor).toBe(1.1);
			expect(c.darwin.enabled).toBe(false);
		});
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
