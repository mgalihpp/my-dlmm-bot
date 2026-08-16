import { describe, expect, it } from "vitest";
import type { VexisConfig } from "../src/domain/config.js";
import type { AgentState } from "../src/telegram/agent/state.js";
import {
	buildSettingsPayload,
	EDITABLE_FIELDS,
	getNested,
	parseFieldValue,
	setNested,
	stripSecrets,
} from "../src/web-react/app/lib/server/settings.server.js";

const mkConfig = (): VexisConfig => ({
	wallet: "wallet1",
	rpcUrl: "https://rpc",
	privateKey: "TOP-SECRET",
	telegramBotToken: "tok",
	telegramChatId: "123",
	web: { password: "pw" },
	agent: { enabled: true, llm: { apiKey: "key" }, risks: { blockWash: true } },
	pools: { minMcap: 1000, blockedLaunchpads: ["pump.fun"] },
});

const mkState = (): AgentState => ({
	enabled: true,
	running: true,
	lastCycleAt: "2026-08-12T10:00:00.000Z",
	llmStatus: "ok",
	cycle: 1,
	plans: [],
	executions: [],
	cooldowns: [],
});

const find = (path: string) => {
	const f = EDITABLE_FIELDS.find((x) => x.path === path);
	if (!f) throw new Error(`missing field ${path}`);
	return f;
};

describe("getNested / setNested", () => {
	it("reads and writes dotted paths", () => {
		const o: Record<string, unknown> = { a: { b: { c: 1 } } };
		expect(getNested(o, "a.b.c")).toBe(1);
		setNested(o, "a.b.d", 2);
		expect(getNested(o, "a.b.d")).toBe(2);
		expect(getNested(o, "a.b.c")).toBe(1);
	});
	it("getNested returns undefined for missing path", () => {
		expect(getNested({}, "x.y.z")).toBeUndefined();
	});
});

describe("stripSecrets", () => {
	it("removes secret keys from a copy", () => {
		const cfg = mkConfig();
		stripSecrets(cfg);
		expect(cfg.privateKey).toBeUndefined();
		expect(cfg.telegramBotToken).toBeUndefined();
		expect(cfg.telegramChatId).toBeUndefined();
		expect(cfg.web?.password).toBeUndefined();
		expect(cfg.agent?.llm?.apiKey).toBeUndefined();
		expect(cfg.wallet).toBe("wallet1");
		expect(cfg.agent?.risks?.blockWash).toBe(true);
	});
});

describe("buildSettingsPayload", () => {
	it("returns editable values, strips secrets, reports agent state", () => {
		const p = buildSettingsPayload(
			mkConfig(),
			"/x/vexis.config.json",
			mkState(),
		);
		expect(p.ok).toBe(true);
		expect(p.configPath).toBe("/x/vexis.config.json");
		expect(p.agent.enabled).toBe(true);
		expect(p.agent.running).toBe(true);
		expect(p.values["wallet"]).toBe("wallet1");
		expect(p.values["agent.enabled"]).toBe(true);
		expect(p.values["privateKey"]).toBeUndefined();
		expect(p.values["agent.llm.apiKey"]).toBeUndefined();
	});
});

describe("parseFieldValue", () => {
	it("parses number/boolean/string/enum/list fields", () => {
		expect(parseFieldValue(find("pools.minMcap"), "1234")).toBe(1234);
		expect(parseFieldValue(find("agent.enabled"), "true")).toBe(true);
		expect(parseFieldValue(find("agent.enabled"), "false")).toBe(false);
		expect(parseFieldValue(find("create.strategy"), "bidask")).toBe("bidask");
		expect(
			parseFieldValue(find("create.amountPresets"), "0.1, 0.25, 1"),
		).toEqual([0.1, 0.25, 1]);
		expect(
			parseFieldValue(find("pools.blockedLaunchpads"), "pump.fun, xyz"),
		).toEqual(["pump.fun", "xyz"]);
	});
	it("rejects invalid values", () => {
		expect(() => parseFieldValue(find("pools.minMcap"), "abc")).toThrow();
		expect(() => parseFieldValue(find("create.strategy"), "bogus")).toThrow();
		expect(() => parseFieldValue(find("agent.enabled"), "1")).toThrow();
	});
});
