# Settings Page (React Web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable `/settings` page to the React dashboard (`src/web-react/`) with agent runtime controls, where saves hot-reload into the running bot via the existing config file watcher.

**Architecture:** The web server (separate process) reads/writes `vexis.config.json` directly via pure helpers (`loadConfigSync`, `writeFileSync`) — no Effect layer needed. A React Router route (`/settings`) exposes a `loader` (read payload, secrets stripped) and `action` (validate a field with zod, patch the full config object preserving secrets, write the file). The bot process already watches that file and hot-reloads; a new `onChange` subscription on `AppConfig` detects `agent.enabled` transitions and calls `rt.start()`/`rt.stop()`.

**Tech Stack:** React 19, React Router 7, zod 4, Effect 3, shadcn/radix-mira UI, Tailwind v4, Vitest, Biome.

## Global Constraints

- ESM-only; use `.js` extensions in local imports. TypeScript strict mode. No `any` shortcuts.
- No new dependencies (zod, UI components already installed).
- Follow existing web-react patterns: `loader` + `clientLoader` forwarding `serverLoader()`; `DashboardShell`; auth via `getWebPassword()` + `hasValidSession()`; `Card`/`Button`/`Badge`/`Input`/`Checkbox`/`Select`/`Field` from `~/components/ui`.
- Secret fields are hidden completely and never sent to the client: `privateKey`, `telegramBotToken`, `telegramChatId`, `web.password`, `agent.llm.apiKey`. Saves preserve secrets because the server reads the full file and patches only the target path.
- Tests: pure logic only, inline fixtures, no live RPC/Telegram/Meteora/wallet/network.
- Run `npm run check` and `npm run typecheck` in `src/web-react` (workdir `src/web-react`); root `npm test` must pass.
- Biome: tab indentation, double quotes.
- `vexis.config.json` is gitignored (may contain secrets) — never commit it.

---

### Task 1: `agent.enabled` transition helper + subscription in Config service

**Files:**
- Modify: `src/services/Config.ts`
- Test: `test/config-onchange.test.ts`

**Interfaces:**
- Consumes: `VexisConfig` (`@vexis/domain/config.js`).
- Produces:
  - `export function agentEnabledTransition(prev: VexisConfig, next: VexisConfig): "start" | "stop" | null` — returns `"start"` when `prev.agent?.enabled !== true && next.agent?.enabled === true`, `"stop"` for the reverse, else `null`.
  - `AppConfigService.onChange(cb: (prev: VexisConfig, next: VexisConfig) => void): Effect.Effect<() => void>` — registers a listener, returns an unsubscribe effect. Fired after `update()` and after a file-watcher reload.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { VexisConfig } from "../src/domain/config.js";
import { agentEnabledTransition } from "../src/services/Config.js";

const cfg = (enabled: boolean | undefined): VexisConfig =>
	enabled === undefined ? {} : { agent: { enabled } };

describe("agentEnabledTransition", () => {
	it("returns start when enabling", () => {
		expect(agentEnabledTransition(cfg(false), cfg(true))).toBe("start");
		expect(agentEnabledTransition(cfg(undefined), cfg(true))).toBe("start");
	});
	it("returns stop when disabling", () => {
		expect(agentEnabledTransition(cfg(true), cfg(false))).toBe("stop");
		expect(agentEnabledTransition(cfg(true), cfg(undefined))).toBe("stop");
	});
	it("returns null when unchanged", () => {
		expect(agentEnabledTransition(cfg(true), cfg(true))).toBeNull();
		expect(agentEnabledTransition(cfg(false), cfg(false))).toBeNull();
		expect(agentEnabledTransition(cfg(undefined), cfg(undefined))).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/config-onchange.test.ts`
Expected: FAIL with `agentEnabledTransition is not a function`.

- [ ] **Step 3: Add the pure helper**

Add to `src/services/Config.ts` after `reloadConfigFile`:

```ts
export function agentEnabledTransition(
	prev: VexisConfig,
	next: VexisConfig,
): "start" | "stop" | null {
	const before = prev.agent?.enabled ?? false;
	const after = next.agent?.enabled ?? false;
	if (before === after) return null;
	return after ? "start" : "stop";
}
```

- [ ] **Step 4: Add `onChange` to the service interface and implementation**

In the `AppConfigService` interface, add:

```ts
	readonly onChange: (
		cb: (prev: VexisConfig, next: VexisConfig) => void,
	) => Effect.Effect<() => void>;
```

In `make`, create a listener set before `const service`:

```ts
		const listeners = new Set<(prev: VexisConfig, next: VexisConfig) => void>();
		const notify = (prev: VexisConfig, next: VexisConfig) => {
			for (const cb of listeners) cb(prev, next);
		};
```

Replace the `update` implementation with a prev/next version that notifies after persist:

```ts
			update: (patch) =>
				Effect.gen(function* () {
					const prev = yield* Ref.get(ref);
					const next = yield* Ref.updateAndGet(ref, patch);
					yield* persist(next);
					yield* Effect.sync(() => notify(prev, next));
					return next;
				}),
```

Add `onChange` to the `service` object:

```ts
			onChange: (cb) =>
				Effect.sync(() => {
					listeners.add(cb);
					return () => listeners.delete(cb);
				}),
```

Update the file-watcher reload to notify on change (`make`, watch branch):

```ts
			const watcher = watch(path, () => {
				if (timer != null) clearTimeout(timer);
				timer = setTimeout(() => {
					timer = null;
					try {
						const prev = Effect.runSync(Ref.get(ref));
						const next = reloadConfigFile(path);
						Effect.runSync(Ref.set(ref, next));
						notify(prev, next);
					} catch (e) {
						console.error(
							`[config] reload failed, keeping previous config: ${
								e instanceof Error ? e.message : e
							}`,
						);
					}
				}, 150);
			});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/config-onchange.test.ts`
Expected: PASS.

- [ ] **Step 6: Run existing config test**

Run: `npx vitest run test/config-reload.test.ts`
Expected: PASS (no behavior regression).

- [ ] **Step 7: Commit**

```bash
git add src/services/Config.ts test/config-onchange.test.ts
git commit -m "feat(config): onChange subscription + agent.enabled transition helper"
```

---

### Task 2: Wire agent start/stop to config transitions in the bot

**Files:**
- Modify: `src/telegram/bot.ts`
- Modify: `src/telegram/handlers/config-editor.ts`

**Interfaces:**
- Consumes: `agentEnabledTransition`, `AppConfig.onChange` (from Task 1); `rtAgent: RuntimeAgent` (existing in `bot.ts`).
- Produces: no new exports.

- [ ] **Step 1: Register the transition subscription in bot.ts**

In `src/telegram/bot.ts`, after `registerConfigEditor(bot, rtAgent);` (line 136), add:

```ts
	runtime.runPromise(
		Effect.flatMap(AppConfig, (c) =>
			c.onChange((prev, next) => {
				const action = agentEnabledTransition(prev, next);
				if (action === "start") rtAgent?.start();
				else if (action === "stop") rtAgent?.stop();
			}),
		),
	);
```

Add `agentEnabledTransition` to the existing import from `../services/Config.js`:

```ts
import {
	AppConfig,
	agentEnabledTransition,
	resolveAgentConfigFrom,
} from "../services/Config.js";
```

- [ ] **Step 2: Remove explicit `syncAgentRuntime` from config-editor**

The subscription now handles `agent.enabled` transitions on every `update()`, so the config editor must not double-trigger. In `src/telegram/handlers/config-editor.ts`:

1. Delete the `syncAgentRuntime` closure (lines ~728–732) and its `rtAgent` parameter.
2. Change the signature to `export function registerConfigEditor(bot: Bot)` and remove the `rtAgent` import usage.
3. Delete the three `if (field === "agent.enabled") { await syncAgentRuntime(...) }` blocks (around lines 803–804, 838–839, 931–934).

In `src/telegram/bot.ts`, update the call to `registerConfigEditor(bot);` (line 136).

- [ ] **Step 3: Typecheck + lint**

Run in `src/web-react`: `npm run typecheck`
Run at repo root: `npx biome check --write src/telegram/bot.ts src/telegram/handlers/config-editor.ts src/services/Config.ts`
Expected: no errors.

- [ ] **Step 4: Run bot test suite (no network)**

Run: `npx vitest run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/bot.ts src/telegram/handlers/config-editor.ts
git commit -m "feat(bot): start/stop agent on config agent.enabled transitions"
```

---

### Task 3: Settings server module (editable fields, secret strip, payload, save)

**Files:**
- Create: `src/web-react/app/lib/server/settings.server.ts`
- Test: `test/web-react-settings.test.ts`

**Interfaces:**
- Consumes: `VexisConfig` (`@vexis/domain/config.js`), `loadConfigSync` (`@vexis/services/Config.js`), `loadState` (`@vexis/telegram/agent/state.js`), `repoRoot` (`./env.server`), zod.
- Produces (all used by Tasks 4–6):
  - `type FieldType = "number" | "string" | "boolean" | "enum" | "list"`
  - `type Section = "general" | "agent" | "create" | "pools"`
  - `interface EditableField { path: string; label: string; type: FieldType; values?: readonly string[]; section: Section; itemType?: "number" | "string" }`
  - `const EDITABLE_FIELDS: readonly EditableField[]`
  - `const SECRET_PATHS: readonly string[]`
  - `interface SettingsPayload { ok: boolean; error?: string; configPath: string | null; agent: { enabled: boolean; running: boolean; lastCycleAt: string | null }; values: Record<string, unknown> }`
  - `function getNested(obj: unknown, path: string): unknown`
  - `function setNested(obj: Record<string, unknown>, path: string, value: unknown): void`
  - `function stripSecrets(config: VexisConfig): void` (mutates a deep copy in place, removes secret keys)
  - `function parseFieldValue(field: EditableField, raw: unknown): unknown`
  - `function buildSettingsPayload(config: VexisConfig, configPath: string | null, agentState: AgentState): SettingsPayload`
  - `function fetchSettings(): SettingsPayload`
  - `function saveField(configPath: string, field: EditableField, value: unknown): SettingsPayload`
  - `function resetField(configPath: string, field: EditableField): SettingsPayload`
  - `function setAgentEnabled(configPath: string, enabled: boolean): SettingsPayload`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { AgentState } from "../src/telegram/agent/state.js";
import type { VexisConfig } from "../src/domain/config.js";
import {
	EDITABLE_FIELDS,
	buildSettingsPayload,
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
		const p = buildSettingsPayload(mkConfig(), "/x/vexis.config.json", mkState());
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
		expect(parseFieldValue(find("create.amountPresets"), "0.1, 0.25, 1")).toEqual([
			0.1, 0.25, 1,
		]);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/web-react-settings.test.ts`
Expected: FAIL (module `settings.server` does not exist).

- [ ] **Step 3: Create `settings.server.ts`**

```ts
import "~/lib/server/env.server";

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VexisConfig } from "@vexis/domain/config.js";
import { loadConfigSync } from "@vexis/services/Config.js";
import type { AgentState } from "@vexis/telegram/agent/state.js";
import { loadState } from "@vexis/telegram/agent/state.js";
import { z } from "zod";
import { repoRoot } from "./env.server";

export type FieldType = "number" | "string" | "boolean" | "enum" | "list";
export type Section = "general" | "agent" | "create" | "pools";

export interface EditableField {
	readonly path: string;
	readonly label: string;
	readonly type: FieldType;
	readonly values?: readonly string[];
	readonly section: Section;
	readonly itemType?: "number" | "string";
}

export const SECRET_PATHS: readonly string[] = [
	"privateKey",
	"telegramBotToken",
	"telegramChatId",
	"web.password",
	"agent.llm.apiKey",
];

const field = (
	path: string,
	label: string,
	type: FieldType,
	section: Section,
	extra: Partial<EditableField> = {},
): EditableField => ({ path, label, type, section, ...extra });

export const EDITABLE_FIELDS: readonly EditableField[] = [
	// General
	field("wallet", "Wallet", "string", "general"),
	field("rpcUrl", "RPC URL", "string", "general"),
	field("dev", "Dev Mode", "boolean", "general"),
	field("stopLossPct", "Stop Loss %", "number", "general"),
	field("takeProfitPct", "Take Profit %", "number", "general"),
	field("alertInterval", "Alert Interval (min)", "number", "general"),
	field("pageSize", "Page Size", "number", "general"),
	// Agent
	field("agent.enabled", "Agent Enabled", "boolean", "agent"),
	field("agent.intervalMinutes", "Interval (min)", "number", "agent"),
	field("agent.maxCandidates", "Max Candidates", "number", "agent"),
	field("agent.maxSolPerPosition", "Max SOL / Position", "number", "agent"),
	field("agent.maxTotalSol", "Max Total SOL", "number", "agent"),
	field("agent.maxOpenPositions", "Max Open Positions", "number", "agent"),
	field("agent.txCooldownMs", "Tx Cooldown (ms)", "number", "agent"),
	field("agent.poolCooldownMs", "Pool Cooldown (ms)", "number", "agent"),
	field("agent.tpPct", "Take Profit %", "number", "agent"),
	field("agent.slPct", "Stop Loss %", "number", "agent"),
	field("agent.llm.baseUrl", "LLM Base URL", "string", "agent"),
	field("agent.llm.model", "LLM Model", "string", "agent"),
	field("agent.llm.timeoutMs", "LLM Timeout (ms)", "number", "agent"),
	field("agent.risks.enabled", "Guardrails Enabled", "boolean", "agent"),
	field("agent.risks.minTokenFeesSol", "Min Token Fees (SOL)", "number", "agent"),
	field("agent.risks.maxBundlePct", "Max Bundle %", "number", "agent"),
	field("agent.risks.maxBotHoldersPct", "Max Bot Holders %", "number", "agent"),
	field("agent.risks.maxTop10Pct", "Max Top10 %", "number", "agent"),
	field("agent.risks.minFromAthPct", "Min From ATH %", "number", "agent"),
	field("agent.risks.maxRugScore", "Max RugCheck Score", "number", "agent"),
	field("agent.risks.blockWash", "Block Wash Trading", "boolean", "agent"),
	field("agent.risks.blockRugpull", "Block Rugpull", "boolean", "agent"),
	field("agent.risks.blockDexScreenerPaid", "Block DexScreener Paid", "boolean", "agent"),
	field("agent.risks.blockDevSoldAll", "Block Dev Sold All", "boolean", "agent"),
	field("agent.darwin.enabled", "Darwin Enabled", "boolean", "agent"),
	field("agent.darwin.windowDays", "Darwin Window (days)", "number", "agent"),
	field("agent.darwin.recalcEvery", "Darwin Recalc Every", "number", "agent"),
	field("agent.darwin.boostFactor", "Darwin Boost Factor", "number", "agent"),
	field("agent.darwin.decayFactor", "Darwin Decay Factor", "number", "agent"),
	field("agent.darwin.weightFloor", "Darwin Weight Floor", "number", "agent"),
	field("agent.darwin.weightCeiling", "Darwin Weight Ceiling", "number", "agent"),
	field("agent.darwin.minSamples", "Darwin Min Samples", "number", "agent"),
	// Create
	field("create.strategy", "Strategy", "enum", "create", {
		values: ["spot", "bidask", "curve"],
	}),
	field("create.mode", "Mode", "enum", "create", {
		values: ["two-sided", "single-x", "single-y"],
	}),
	field("create.range.type", "Range Type", "enum", "create", {
		values: ["default", "bin", "pct"],
	}),
	field("create.range.minBin", "Range Min Bin", "number", "create"),
	field("create.range.maxBin", "Range Max Bin", "number", "create"),
	field("create.range.minPct", "Range Min %", "number", "create"),
	field("create.range.maxPct", "Range Max %", "number", "create"),
	field("create.amountPresets", "Amount Presets", "list", "create", {
		itemType: "number",
	}),
	field("create.xAmount", "Default X Amt", "number", "create"),
	field("create.yAmount", "Default Y Amt", "number", "create"),
	field("create.autoSwap", "Auto Swap", "boolean", "create"),
	field("create.slippageBps", "Slippage (bps)", "number", "create"),
	// Pools
	field("pools.pageSize", "Page Size", "number", "pools"),
	field("pools.timeframe", "Timeframe", "string", "pools"),
	field("pools.category", "Category", "string", "pools"),
	field("pools.baseTokenHasHighSupplyConcentration", "High Supply Conc.", "boolean", "pools"),
	field("pools.baseTokenHasHighSingleOwnership", "High Single Owner", "boolean", "pools"),
	field("pools.minMcap", "Min Market Cap", "number", "pools"),
	field("pools.maxMcap", "Max Market Cap", "number", "pools"),
	field("pools.minHolders", "Min Holders", "number", "pools"),
	field("pools.maxHolders", "Max Holders", "number", "pools"),
	field("pools.minOrganic", "Min Organic", "number", "pools"),
	field("pools.maxOrganic", "Max Organic", "number", "pools"),
	field("pools.minTokenAgeHours", "Min Token Age (h)", "number", "pools"),
	field("pools.maxTokenAgeHours", "Max Token Age (h)", "number", "pools"),
	field("pools.blockedLaunchpads", "Blocked Launchpads", "list", "pools", {
		itemType: "string",
	}),
	field("pools.minQuoteOrganic", "Min Quote Organic", "number", "pools"),
	field("pools.maxQuoteOrganic", "Max Quote Organic", "number", "pools"),
	field("pools.minTvl", "Min TVL", "number", "pools"),
	field("pools.maxTvl", "Max TVL", "number", "pools"),
	field("pools.minActiveTvl", "Min Active TVL", "number", "pools"),
	field("pools.maxActiveTvl", "Max Active TVL", "number", "pools"),
	field("pools.minVolume", "Min Volume", "number", "pools"),
	field("pools.maxVolume", "Max Volume", "number", "pools"),
	field("pools.minVolume24h", "Min Vol 24h", "number", "pools"),
	field("pools.maxVolume24h", "Max Vol 24h", "number", "pools"),
	field("pools.minFee", "Min Fee ($)", "number", "pools"),
	field("pools.maxFee", "Max Fee ($)", "number", "pools"),
	field("pools.minFeeActiveTvlRatio", "Min Fee/TVL", "number", "pools"),
	field("pools.maxFeeActiveTvlRatio", "Max Fee/TVL", "number", "pools"),
	field("pools.minBinStep", "Min Bin Step", "number", "pools"),
	field("pools.maxBinStep", "Max Bin Step", "number", "pools"),
	field("pools.minVolatility", "Min Volatility", "number", "pools"),
	field("pools.maxVolatility", "Max Volatility", "number", "pools"),
	field("pools.minPoolPrice", "Min Pool Price", "number", "pools"),
	field("pools.maxPoolPrice", "Max Pool Price", "number", "pools"),
	field("pools.minActivePositions", "Min Active Positions", "number", "pools"),
	field("pools.maxActivePositions", "Max Active Positions", "number", "pools"),
	field("pools.minOpenPositions", "Min Open Positions", "number", "pools"),
	field("pools.maxOpenPositions", "Max Open Positions", "number", "pools"),
	field("pools.minSwapCount", "Min Swaps", "number", "pools"),
	field("pools.maxSwapCount", "Max Swaps", "number", "pools"),
	field("pools.minUniqueTraders", "Min Traders", "number", "pools"),
	field("pools.maxUniqueTraders", "Max Traders", "number", "pools"),
	field("pools.minPriceChangePct", "Min Price Chg %", "number", "pools"),
	field("pools.maxPriceChangePct", "Max Price Chg %", "number", "pools"),
	field("pools.minVolumeChangePct", "Min Vol Chg %", "number", "pools"),
	field("pools.maxVolumeChangePct", "Max Vol Chg %", "number", "pools"),
	field("pools.priceTrend", "Price Trend", "string", "pools"),
	field("pools.solPairOnly", "SOL Pair Only", "boolean", "pools"),
	field("pools.displayLimit", "Display Limit", "number", "pools"),
];

export interface SettingsPayload {
	readonly ok: boolean;
	readonly error?: string;
	readonly configPath: string | null;
	readonly agent: {
		readonly enabled: boolean;
		readonly running: boolean;
		readonly lastCycleAt: string | null;
	};
	readonly values: Record<string, unknown>;
}

export function getNested(obj: unknown, path: string): unknown {
	return path.split(".").reduce<unknown>(
		(o, k) =>
			o !== null && typeof o === "object"
				? (o as Record<string, unknown>)[k]
				: undefined,
		obj,
	);
}

export function setNested(
	obj: Record<string, unknown>,
	path: string,
	value: unknown,
): void {
	const keys = path.split(".");
	let cur = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		const k = keys[i];
		if (cur[k] === null || typeof cur[k] !== "object") cur[k] = {};
		cur = cur[k] as Record<string, unknown>;
	}
	cur[keys[keys.length - 1]] = value;
}

export function stripSecrets(config: VexisConfig): void {
	for (const path of SECRET_PATHS) {
		const keys = path.split(".");
		let cur = config as unknown as Record<string, unknown>;
		for (let i = 0; i < keys.length - 1; i++) {
			const next = cur[keys[i]];
			if (next === null || typeof next !== "object") {
				cur = {};
				break;
			}
			cur = next as Record<string, unknown>;
		}
		delete cur[keys[keys.length - 1]];
	}
}

function listSchema(itemType: "number" | "string" | undefined): z.ZodType<unknown> {
	const base =
		itemType === "number"
			? z.array(z.coerce.number().finite())
			: z.array(z.string());
	return z.preprocess(
		(v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()) : v),
		base,
	);
}

export function parseFieldValue(field: EditableField, raw: unknown): unknown {
	const base = (() => {
		switch (field.type) {
			case "number":
				return z.coerce.number().finite();
			case "boolean":
				return z.union([
					z.boolean(),
					z.literal("true").transform(() => true),
					z.literal("false").transform(() => false),
				]);
			case "string":
				return z.string();
			case "enum":
				return z.enum(field.values as [string, ...string[]]);
			case "list":
				return listSchema(field.itemType);
		}
	})();
	return base.parse(raw);
}

export function buildSettingsPayload(
	config: VexisConfig,
	configPath: string | null,
	agentState: AgentState,
): SettingsPayload {
	stripSecrets(config);
	const values: Record<string, unknown> = {};
	for (const f of EDITABLE_FIELDS) {
		values[f.path] = getNested(config, f.path) ?? null;
	}
	return {
		ok: true,
		configPath,
		agent: {
			enabled: agentState.enabled,
			running: agentState.running,
			lastCycleAt: agentState.lastCycleAt,
		},
		values,
	};
}

function agentFile(): string {
	return join(repoRoot(), ".vexis-agent.json");
}

export function fetchSettings(): SettingsPayload {
	const { config, path } = loadConfigSync();
	return buildSettingsPayload(config, path, loadState(agentFile()));
}

function persist(config: VexisConfig, configPath: string): void {
	writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

export function saveField(
	configPath: string,
	field: EditableField,
	value: unknown,
): SettingsPayload {
	const { config } = loadConfigSync();
	const next = structuredClone(config);
	setNested(next as Record<string, unknown>, field.path, value);
	persist(next, configPath);
	return buildSettingsPayload(next, configPath, loadState(agentFile()));
}

export function resetField(
	configPath: string,
	field: EditableField,
): SettingsPayload {
	const { config } = loadConfigSync();
	const next = structuredClone(config);
	setNested(next as Record<string, unknown>, field.path, null);
	persist(next, configPath);
	return buildSettingsPayload(next, configPath, loadState(agentFile()));
}

export function setAgentEnabled(
	configPath: string,
	enabled: boolean,
): SettingsPayload {
	const { config } = loadConfigSync();
	const next = structuredClone(config);
	next.agent = { ...next.agent, enabled };
	persist(next, configPath);
	return buildSettingsPayload(next, configPath, loadState(agentFile()));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/web-react-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run in `src/web-react`: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/web-react/app/lib/server/settings.server.ts test/web-react-settings.test.ts
git commit -m "feat(web): settings server module with secret strip and validation"
```

---

### Task 4: Settings route (loader + action + auth)

**Files:**
- Create: `src/web-react/app/routes/settings.tsx`
- Modify: `src/web-react/app/routes.ts`

**Interfaces:**
- Consumes: `fetchSettings`, `saveField`, `resetField`, `setAgentEnabled`, `EDITABLE_FIELDS`, `parseFieldValue`, `SettingsPayload` (Task 3); `getWebPassword`, `hasValidSession`, `redirect`.
- Produces: route `settings` with `loader`, `action`, `clientLoader`, default export `SettingsPage`.

- [ ] **Step 1: Add the route to routes.ts**

```ts
	route("settings", "routes/settings.tsx"),
```

- [ ] **Step 2: Create `routes/settings.tsx`**

```tsx
import { redirect } from "react-router";
import { SettingsPage } from "~/components/settings/settings-page";
import { getWebPassword } from "~/lib/server/portfolio.server";
import {
	EDITABLE_FIELDS,
	fetchSettings,
	parseFieldValue,
	resetField,
	saveField,
	setAgentEnabled,
	type SettingsPayload,
} from "~/lib/server/settings.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/settings";

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length === 0 || !hasValidSession(request, password)) {
		throw redirect("/");
	}
	return fetchSettings();
}

export async function action({ request }: Route.ActionArgs) {
	const password = await getWebPassword();
	if (password.length === 0 || !hasValidSession(request, password)) {
		throw redirect("/");
	}
	const form = await request.formData();
	const op = String(form.get("op") ?? "");
	const configPath = fetchSettings().configPath;
	if (!configPath) {
		return { ok: false, error: "No config file found." } satisfies SettingsPayload;
	}
	try {
		if (op === "setField") {
			const path = String(form.get("path") ?? "");
			const field = EDITABLE_FIELDS.find((f) => f.path === path);
			if (!field) return { ok: false, error: `Unknown field: ${path}` };
			const value = parseFieldValue(field, form.get("value"));
			return saveField(configPath, field, value);
		}
		if (op === "resetField") {
			const path = String(form.get("path") ?? "");
			const field = EDITABLE_FIELDS.find((f) => f.path === path);
			if (!field) return { ok: false, error: `Unknown field: ${path}` };
			return resetField(configPath, field);
		}
		if (op === "setAgentEnabled") {
			const enabled = form.get("enabled") === "true";
			return setAgentEnabled(configPath, enabled);
		}
		return { ok: false, error: `Unknown op: ${op}` } satisfies SettingsPayload;
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : String(e),
		} satisfies SettingsPayload;
	}
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
	return serverLoader();
}

export default SettingsPage;
```

- [ ] **Step 3: Typecheck**

Run in `src/web-react`: `npm run typecheck`
Expected: no errors (note: `SettingsPage` doesn't exist yet — if typegen errors, create a stub component file first, see Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/web-react/app/routes/settings.tsx src/web-react/app/routes.ts
git commit -m "feat(web): settings route with loader and action"
```

---

### Task 5: Settings UI components + sidebar link

**Files:**
- Create: `src/web-react/app/components/settings/settings-page.tsx`
- Create: `src/web-react/app/components/settings/agent-status-card.tsx`
- Create: `src/web-react/app/components/settings/settings-section.tsx`
- Create: `src/web-react/app/components/settings/field-row.tsx`
- Modify: `src/web-react/app/components/app-sidebar.tsx:50`

**Interfaces:**
- Consumes: `SettingsPayload`, `EDITABLE_FIELDS`, `EditableField`, `Section` (Task 3); `DashboardShell`, `useLoaderData`, `useActionData`, `useSubmit`, `useRevalidator`; UI primitives.
- Produces: `SettingsPage` default export consumed by Task 4.

**Simplification vs spec:** the four per-section form files (`general-form`, `agent-form`, `create-form`, `pools-form`) collapse into one reusable `SettingsSection` that filters `EDITABLE_FIELDS` by section. Less duplication, same surface.

- [ ] **Step 1: Create `field-row.tsx`** (renders one editable field, submits on change/blur)

```tsx
import { useRef } from "react";
import { useSubmit } from "react-router";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type { EditableField } from "~/lib/server/settings.server";

export function FieldRow({
	field,
	value,
}: {
	field: EditableField;
	value: unknown;
}) {
	const submit = useSubmit();
	const formRef = useRef<HTMLFormElement>(null);

	const send = (formData: FormData) => {
		formData.set("op", "setField");
		formData.set("path", field.path);
		submit(formData, { method: "post", replace: true });
	};

	const label = (
		<>
			{field.label}
			<span className="text-muted-foreground/60">· {field.path}</span>
		</>
	);

	if (field.type === "boolean") {
		const checked = value === true;
		return (
			<form ref={formRef} method="post">
				<Field orientation="horizontal">
					<FieldLabel>
						<Checkbox
							checked={checked}
							onCheckedChange={(v) => {
								const fd = new FormData(formRef.current ?? undefined);
								fd.set("value", v === true ? "true" : "false");
								send(fd);
							}}
						/>
						{field.label}
					</FieldLabel>
					<FieldContent />
				</Field>
			</form>
		);
	}

	if (field.type === "enum") {
		return (
			<form ref={formRef} method="post">
				<Field>
					<FieldLabel>{label}</FieldLabel>
					<FieldContent>
						<Select
							value={typeof value === "string" ? value : ""}
							onValueChange={(v) => {
								const fd = new FormData(formRef.current ?? undefined);
								fd.set("value", v);
								send(fd);
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select…" />
							</SelectTrigger>
							<SelectContent>
								{(field.values ?? []).map((v) => (
									<SelectItem key={v} value={v}>
										{v}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FieldContent>
				</Field>
			</form>
		);
	}

	if (field.type === "list") {
		const text = Array.isArray(value) ? (value as unknown[]).join(", ") : "";
		return (
			<form ref={formRef} method="post">
				<Field>
					<FieldLabel>{label}</FieldLabel>
					<FieldContent>
						<Input
							defaultValue={text}
							placeholder="Comma-separated values"
							onBlur={(e) => {
								const fd = new FormData(formRef.current ?? undefined);
								fd.set("value", e.target.value);
								send(fd);
							}}
						/>
					</FieldContent>
				</Field>
			</form>
		);
	}

	const inputValue = value === null || value === undefined ? "" : String(value);
	return (
		<form ref={formRef} method="post">
			<Field>
				<FieldLabel>{label}</FieldLabel>
				<FieldContent>
					<Input
						type={field.type === "number" ? "number" : "text"}
						defaultValue={inputValue}
						onBlur={(e) => {
							const fd = new FormData(formRef.current ?? undefined);
							fd.set("value", e.target.value);
							send(fd);
						}}
					/>
					<FieldDescription>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-5 px-1 text-xs text-muted-foreground"
							onClick={() => {
								const fd = new FormData(formRef.current ?? undefined);
								fd.set("op", "resetField");
								fd.set("path", field.path);
								submit(fd, { method: "post", replace: true });
							}}
						>
							Reset to default
						</Button>
					</FieldDescription>
				</FieldContent>
			</Field>
		</form>
	);
}
```

- [ ] **Step 2: Create `settings-section.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { EDITABLE_FIELDS, type Section } from "~/lib/server/settings.server";
import { FieldRow } from "./field-row";

export function SettingsSection({
	section,
	title,
	values,
}: {
	section: Section;
	title: string;
	values: Record<string, unknown>;
}) {
	const fields = EDITABLE_FIELDS.filter((f) => f.section === section);
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4 @container/main lg:grid-cols-2">
				{fields.map((field) => (
					<FieldRow key={field.path} field={field} value={values[field.path]} />
				))}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 3: Create `agent-status-card.tsx`**

```tsx
import { PowerIcon } from "lucide-react";
import { useSubmit } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function AgentStatusCard({
	enabled,
	running,
	lastCycleAt,
}: {
	enabled: boolean;
	running: boolean;
	lastCycleAt: string | null;
}) {
	const submit = useSubmit();
	const toggle = () =>
		submit(
			{ op: "setAgentEnabled", enabled: enabled ? "false" : "true" },
			{ method: "post", replace: true },
		);
	const now = new Date();
	const last =
		lastCycleAt != null
			? new Date(lastCycleAt).toLocaleTimeString()
			: "never";
	const status = enabled ? (running ? "Running" : "Idle") : "Stopped";
	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between gap-3">
				<CardTitle>DLMM Agent</CardTitle>
				<Badge variant={enabled ? (running ? "default" : "secondary") : "outline"}>
					{status}
				</Badge>
			</CardHeader>
			<CardContent className="flex items-center justify-between gap-4">
				<p className="text-sm text-muted-foreground">
					Last cycle: {last} · config auto-reloads on save
				</p>
				<Button onClick={toggle} variant={enabled ? "destructive" : "default"}>
					<PowerIcon className="size-4" />
					{enabled ? "Stop Agent" : "Start Agent"}
				</Button>
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 4: Create `settings-page.tsx`**

```tsx
import { AlertCircleIcon, CheckIcon } from "lucide-react";
import { useActionData, useLoaderData } from "react-router";
import { DashboardShell } from "~/components/dashboard-shell";
import { AgentStatusCard } from "~/components/settings/agent-status-card";
import { SettingsSection } from "~/components/settings/settings-section";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { SettingsPayload } from "~/lib/server/settings.server";

export function SettingsPage() {
	const data = useLoaderData<SettingsPayload>();
	const actionData = useActionData<SettingsPayload>();

	if (!data.ok) {
		return (
			<DashboardShell title="Settings">
				<Card className="m-4 lg:m-6">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-destructive">
							<AlertCircleIcon className="size-5" />
							Failed to load settings
						</CardTitle>
					</CardHeader>
					<CardContent className="text-sm text-muted-foreground">
						{data.error ?? "Unknown error"}
					</CardContent>
				</Card>
			</DashboardShell>
		);
	}

	const latest: SettingsPayload = actionData?.ok ? actionData : data;
	const { agent, values, configPath } = latest;

	return (
		<DashboardShell title="Settings">
			<div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
				<div className="flex flex-wrap items-center justify-between gap-3 px-1">
					<div>
						<h1 className="text-2xl font-bold tracking-tight">Settings</h1>
						<p className="text-sm text-muted-foreground">
							{configPath ?? "No config file"} · secret fields are read-only via file
						</p>
					</div>
					{actionData && !actionData.ok && (
						<span className="flex items-center gap-2 text-sm text-destructive">
							<AlertCircleIcon className="size-4" /> {actionData.error}
						</span>
					)}
					{actionData?.ok && (
						<span className="flex items-center gap-2 text-sm text-emerald-600">
							<CheckIcon className="size-4" /> Saved
						</span>
					)}
				</div>
				<AgentStatusCard
					enabled={agent.enabled}
					running={agent.running}
					lastCycleAt={agent.lastCycleAt}
				/>
				<SettingsSection section="general" title="General" values={values} />
				<SettingsSection section="agent" title="Agent" values={values} />
				<SettingsSection section="create" title="Create" values={values} />
				<SettingsSection section="pools" title="Pools" values={values} />
			</div>
		</DashboardShell>
	);
}
```

- [ ] **Step 5: Update sidebar link**

In `src/web-react/app/components/app-sidebar.tsx`, change the Settings entry:

```tsx
		{
			title: "Settings",
			url: "/settings",
			icon: <Settings2Icon />,
		},
```

- [ ] **Step 6: Typecheck + lint**

Run in `src/web-react`: `npm run typecheck`
Run: `npm run check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/web-react/app/components/settings src/web-react/app/components/app-sidebar.tsx
git commit -m "feat(web): settings page UI with editable sections and agent control"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run all checks**

Run in `src/web-react`: `npm run typecheck`
Run at repo root: `npm run check`
Run at repo root: `npm test`
Expected: all PASS.

- [ ] **Step 2: Manual smoke test**

1. Start the bot: `npm run bot` (needs `telegramBotToken`/`chatId` configured).
2. In another terminal, start the web app in `src/web-react`: `npm run dev`, open `http://localhost:5173/settings`, log in.
3. Edit a pools filter (e.g. `pools.minMcap` to `999999`) and blur the input. Confirm the bot log shows a config reload ("[config] reload failed" must NOT appear) and the field shows the new value after re-render.
4. Click "Stop Agent" — confirm agent stops; "Start Agent" — confirm it starts. Verify `.vexis-agent.json` and the Telegram `/agent` status reflect the change.
5. Refresh the page — confirm secrets (`privateKey`, etc.) are absent from the DOM.

- [ ] **Step 3: Final commit (if any artifacts)**

```bash
git status
# commit any remaining intended changes; do NOT commit vexis.config.json
```

---

## Self-Review Notes

- **Spec coverage:** payload/secret-strip (Task 3), editable fields all sections (Task 3), agent transition + subscription (Task 1–2), route/auth (Task 4), UI + sidebar (Task 5), verification (Task 6). Matches the design doc.
- **Placeholders:** all code steps carry real code; no "TBD"/"TODO".
- **Type consistency:** `SettingsPayload`, `EditableField`, `Section`, `getNested/setNested`, `parseFieldValue`, `agentEnabledTransition`, `AppConfigService.onChange` are defined once (Tasks 1, 3) and consumed consistently (Tasks 2, 4, 5).
- **Deviation from spec:** the four per-section form files are collapsed into one `SettingsSection` component; identical behavior, less duplication.
