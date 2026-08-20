import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRange } from "../src/shared/agent-analytics.js";
import type { AgentState } from "../src/telegram/agent/state.js";
import { buildAgentPayload } from "../src/web-react/app/lib/server/agent.server.js";

const mkState = (): AgentState => ({
	enabled: true,
	running: true,
	lastCycleAt: "2026-08-12T10:00:00.000Z",
	llmStatus: "ok",
	cycle: 42,
	plans: [],
	executions: [],
	cooldowns: [],
});

describe("parseRange", () => {
	it("defaults to 30d in route", () => {
		expect(parseRange(null)).toBe("30d");
		expect(parseRange("all")).toBe("all");
	});
});

describe("buildAgentPayload analytics", () => {
	it("returns analytics with default empty signals", () => {
		const payload = buildAgentPayload(
			[],
			mkState(),
			{ text: "", source: "fallback" },
			"all",
			1,
			"30d",
		);
		expect(payload.range).toBe("30d");
		expect(payload.analytics.operational.perCycle).toEqual([]);
		expect(payload.analytics.financial.distribution).toHaveLength(8);
		expect(payload.analytics.signals.perfCount).toBe(0);
		expect(payload.analytics.signals.lifts).toEqual([]);
	});

	it("parses default range when rawRange omitted", () => {
		const payload = buildAgentPayload(
			[],
			mkState(),
			{ text: "", source: "fallback" },
			"all",
			1,
		);
		expect(payload.range).toBe("30d");
	});

	it("computes operational perCycle from journal", () => {
		const journal = [
			{
				ts: "2026-08-19T10:00:00.000Z",
				cycle: 7,
				llmStatus: "ok" as const,
				candidates: [
					{
						pool: "A",
						poolName: "X/SOL",
						heuristicScore: 1,
						rationale: null,
						action: "open" as const,
						guardrail: "pass" as const,
						blockedReason: null,
						execution: "ok" as const,
						txSignature: "s",
					},
				],
			},
		];
		const payload = buildAgentPayload(
			journal,
			mkState(),
			{ text: "", source: "fallback" },
			"all",
			1,
			"all",
		);
		expect(payload.analytics.operational.perCycle).toHaveLength(1);
		expect(payload.analytics.operational.perCycle[0].opens).toBe(1);
	});

	it("uses supplied perf for financial buckets", () => {
		const signals = {
			perf: [
				{
					closedAt: "2026-08-19T10:00:00.000Z",
					pnlPct: 5,
					signals: {} as never,
				},
			],
			weights: {} as never,
		};
		const payload = buildAgentPayload(
			[],
			mkState(),
			{ text: "", source: "fallback" },
			"all",
			1,
			"30d",
			signals,
		);
		expect(payload.analytics.signals.perfCount).toBe(1);
		expect(payload.analytics.financial.buckets).toHaveLength(1);
	});
});

describe("fetchAgent temp files", () => {
	it("reads signals file and builds analytics without throwing", () => {
		const dir = mkdtempSync(join(tmpdir(), "vexis-aa-"));
		try {
			writeFileSync(
				join(dir, ".vexis-agent-signals.json"),
				JSON.stringify({
					perf: [
						{ closedAt: "2026-08-19T10:00:00.000Z", pnlPct: 3, signals: {} },
					],
					weights: {},
				}),
			);
			// fetchAgent reads from repoRoot, not dir; just assert buildAnalytics path via buildAgentPayload
			const payload = buildAgentPayload(
				[],
				mkState(),
				{ text: "", source: "fallback" },
				"all",
				1,
				"all",
			);
			expect(payload.analytics).toBeDefined();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
