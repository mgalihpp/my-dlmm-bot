# Agent UI/UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five misleading/confusing UI/UX behaviors in the Telegram DLMM agent feature.

**Architecture:** Five independent, small behavior changes in the agent's Telegram layer. Pure keyboard/decision helpers are extracted and unit-tested; wiring lives in the existing grammy callback handlers and the engine closure.

**Tech Stack:** TypeScript (strict, ESM, `.js` import suffixes), grammY, Effect, Vitest, Biome.

## Global Constraints

- ESM-only — all imports use `.js` extensions.
- Biome formatting: tab indent, double quotes, organize imports. Run `npm run check`.
- TypeScript strict; no unused locals/params.
- No new dependencies.
- MarkdownV2: user-facing strings that go through `ctx.reply`/`editMessageText` with `MD` must be escaped with `escapeMarkdown` (except within `tgCode`/`tgBold`/link helpers).
- Verification order: `npm run check && npm run typecheck && npm test`.
- Spec: `docs/superpowers/specs/2026-08-10-agent-ux-fixes-design.md`.

---

### Task 1: State-aware Start/Stop keyboard

**Files:**
- Modify: `src/telegram/agent/commands.ts:28-44` (`editOrIgnore`), `:73-85` (`statusKeyboard`), `:506-513` (`agentKeyboard`), `:515-524` (`portfolioKeyboard`)
- Test: `test/agent-keyboard.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `agentKeyboard(enabled: boolean): InlineKeyboard`, `portfolioKeyboard(enabled: boolean): InlineKeyboard`, and `editOrIgnore` with `keyboard: InlineKeyboard` as a **required** parameter. `statusKeyboard(rt)` renders based on `rt.state.enabled`.

- [ ] **Step 1: Write the failing test**

Create `test/agent-keyboard.test.ts`:

```ts
import type { InlineKeyboard } from "grammy";
import { describe, expect, it } from "vitest";
import { agentKeyboard } from "../src/telegram/agent/commands.js";

function buttons(kb: InlineKeyboard): string[] {
	return kb.inline_keyboard.flat().map((b) => b.text ?? "");
}

describe("agentKeyboard", () => {
	it("shows Stop and hides Start when enabled", () => {
		const texts = buttons(agentKeyboard(true));
		expect(texts).toContain("⏹ Stop");
		expect(texts).not.toContain("▶️ Start");
	});

	it("shows Start and hides Stop when disabled", () => {
		const texts = buttons(agentKeyboard(false));
		expect(texts).toContain("▶️ Start");
		expect(texts).not.toContain("⏹ Stop");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-keyboard.test.ts`
Expected: FAIL — `agentKeyboard()` is called with no args in the test and returns both buttons; the `toContain("⏹ Stop")`/`not.toContain("▶️ Start")` assertions fail.

- [ ] **Step 3: Implement state-aware keyboards**

In `commands.ts`, change `editOrIgnore` so `keyboard` is required (remove the `= agentKeyboard()` default):

```ts
export async function editOrIgnore(
	api: Api,
	chatId: string | number,
	messageId: number,
	text: string,
	keyboard: InlineKeyboard,
): Promise<void> {
```

Change `statusKeyboard`:

```ts
function statusKeyboard(rt: RuntimeAgent): InlineKeyboard {
	const kb = agentKeyboard(rt.state.enabled);
```

Replace `agentKeyboard`:

```ts
export function agentKeyboard(enabled: boolean): InlineKeyboard {
	return new InlineKeyboard()
		.text(
			enabled ? "⏹ Stop" : "▶️ Start",
			enabled ? "agent:stop" : "agent:start",
		)
		.row()
		.text("📊 Portfolio", "agent:portfolio")
		.text("📒 Journal", "agent:journal");
}
```

Replace `portfolioKeyboard`:

```ts
function portfolioKeyboard(enabled: boolean): InlineKeyboard {
	return new InlineKeyboard()
		.text(
			enabled ? "⏹ Stop" : "▶️ Start",
			enabled ? "agent:stop" : "agent:start",
		)
		.row()
		.text("📒 Journal", "agent:journal")
		.text("🔄 Refresh", "agent:portfolio")
		.row()
		.text("⬅️ Agent", "menu:agent");
}
```

Update the two `portfolioKeyboard()` call sites (the `/agent portfolio` command handler at ~line 190 and the `agent:portfolio` callback at ~line 289) to pass `rt.state.enabled`:

```ts
reply_markup: portfolioKeyboard(rt.state.enabled),
```

Verify every `editOrIgnore(...)` call site already passes a `keyboard` argument (they all do — confirmed by grep; the default was never exercised).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-keyboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify + commit**

Run: `npm run check && npm run typecheck && npm test`
Then:

```bash
git add src/telegram/agent/commands.ts test/agent-keyboard.test.ts
git commit -m "fix(agent): render start/stop buttons based on runtime state"
```

---

### Task 2: Journal filter survives pagination

**Files:**
- Modify: `src/telegram/agent/commands.ts:135-149` (`journalKeyboard`), `:293-316` (journal page callback)
- Test: `test/agent-journal-keyboard.test.ts`

**Interfaces:**
- Consumes: `journalKeyboard(page, totalPages, filter)` signature stays compatible; new callback data format `agent:journal:page:<n>:<filter>`.
- Produces: paging callbacks that preserve the active `JournalFilter`.

- [ ] **Step 1: Write the failing test**

Create `test/agent-journal-keyboard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { journalKeyboard } from "../src/telegram/agent/commands.js";

describe("journalKeyboard", () => {
	it("encodes the active filter into page buttons", () => {
		const kb = journalKeyboard(1, 3, "closes");
		const callbacks = kb.inline_keyboard
			.flat()
			.map((b) => b.callback_data ?? "");
		expect(callbacks).toContain("agent:journal:page:0:closes");
		expect(callbacks).toContain("agent:journal:page:2:closes");
	});

	it("defaults to all filter", () => {
		const kb = journalKeyboard(0, 2);
		const callbacks = kb.inline_keyboard
			.flat()
			.map((b) => b.callback_data ?? "");
		expect(callbacks).toContain("agent:journal:page:1:all");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-journal-keyboard.test.ts`
Expected: FAIL — page callbacks are still `agent:journal:page:0` / `agent:journal:page:2` (no `:closes` suffix).

- [ ] **Step 3: Implement filter-preserving pagination**

In `commands.ts`, update `journalKeyboard`:

```ts
export function journalKeyboard(
	page: number,
	totalPages: number,
	filter: JournalFilter = "all",
): InlineKeyboard {
	const kb = new InlineKeyboard();
	if (page > 0) kb.text("⬅️", `agent:journal:page:${page - 1}:${filter}`);
	if (page < totalPages - 1)
		kb.text("➡️", `agent:journal:page:${page + 1}:${filter}`);
	kb.row();
	for (const f of ["all", "opens", "closes", "blocked"] as const) {
		kb.text(f === filter ? `• ${f}` : f, `agent:journal:filter:${f}`);
	}
	kb.row().text("⬅️ Agent", "menu:agent");
	return kb;
}
```

Update the page callback regex and handler:

```ts
bot.callbackQuery(
	/^agent:journal:page:(-?\d+):(all|opens|closes|blocked)$/,
	async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const entries = readJournalAll();
		const filter = ctx.match[2] as JournalFilter;
		const totalPages = journalPageCount(entries.length, PAGE_SIZE);
		const page = Math.min(
			Math.max(0, parseInt(ctx.match[1], 10) || 0),
			totalPages - 1,
		);
		const text = formatJournalPage(
			entries,
			{ page, pageSize: PAGE_SIZE, filter },
			actionCounts(entries),
		);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			text,
			journalKeyboard(page, totalPages, filter),
		);
	},
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-journal-keyboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify + commit**

Run: `npm run check && npm run typecheck && npm test`
Then:

```bash
git add src/telegram/agent/commands.ts test/agent-journal-keyboard.test.ts
git commit -m "fix(agent): preserve journal filter when paging"
```

---

### Task 3: "🧼 Clear" stops the agent

**Files:**
- Modify: `src/telegram/agent/commands.ts:495-499` (`notif:clear` handler)

**Interfaces:**
- Consumes: `rt.stop()`, `agentKeyboard(false)` (from Task 1).
- Produces: a truthful Stop behavior on error notifications.

- [ ] **Step 1: Update the `notif:clear` handler**

Replace the current handler:

```ts
bot.callbackQuery("notif:clear", async (ctx) => {
	await ctx.answerCallbackQuery();
	rt.stop();
	await ctx.editMessageText("🧼 Agent stopped.", {
		...MD,
		reply_markup: agentKeyboard(false),
	});
});
```

- [ ] **Step 2: Verify**

Run: `npm run check && npm run typecheck && npm test`
Expected: all pass. No test changes needed (no pure logic added).

- [ ] **Step 3: Commit**

```bash
git add src/telegram/agent/commands.ts
git commit -m "fix(agent): notif Clear button actually stops the agent"
```

---

### Task 4: "⚠️ Retry" retries the failed action

**Files:**
- Modify: `src/telegram/agent/engine.ts:73-81` (RuntimeAgent interface), `:143-339` (`createAgent` closure — add `retryFailed`)
- Modify: `src/telegram/agent/commands.ts:485-493` (`notif:retry` handler)
- Test: `test/agent-retry.test.ts`

**Interfaces:**
- Consumes: existing helpers already imported in `engine.ts` — `checkDuplicate`, `checkPoolCooldown`, `checkRisks` (not used), `deriveOpenAmount`, `checkOpenGuardrail`, `checkRent`, `checkCooldown`, `lastOpenExecutionAt`, `recordCooldown`, `buildCreateParams`, `resolveCreatePresetFrom`, `registerAction`, `notifyKeyboard`, `formatAction`, `appendJournal`, `readJournalAll`, `saveState`, `WSOL_MINT`, `api`, `dlmm`, `zap`, `getConfigSync`.
- Produces: `RuntimeAgent.retryFailed(pool: string): Promise<string>` (returns a user-facing, plain-text message; caller escapes it). Exports `findFailedCandidate(pool: string, entries: readonly AgentJournalEntry[]): JournalCandidate | null` for tests.

- [ ] **Step 1: Write the failing test**

Create `test/agent-retry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findFailedCandidate } from "../src/telegram/agent/engine.js";

describe("findFailedCandidate", () => {
	const entries = [
		{
			ts: "2026-01-01T00:01:00Z",
			cycle: 2,
			llmStatus: "ok" as const,
			candidates: [
				{
					pool: "poolA",
					poolName: "A",
					heuristicScore: 10,
					rationale: null,
					action: "open" as const,
					guardrail: "pass" as const,
					blockedReason: null,
					execution: "failed" as const,
					txSignature: null,
				},
			],
		},
		{
			ts: "2026-01-01T00:00:00Z",
			cycle: 1,
			llmStatus: "ok" as const,
			candidates: [
				{
					pool: "poolA",
					poolName: "A",
					heuristicScore: 1,
					rationale: null,
					action: "open" as const,
					guardrail: "pass" as const,
					blockedReason: null,
					execution: "failed" as const,
					txSignature: null,
				},
				{
					pool: "poolB",
					poolName: "B",
					heuristicScore: 5,
					rationale: null,
					action: "open" as const,
					guardrail: "pass" as const,
					blockedReason: null,
					execution: "ok" as const,
					txSignature: "sig",
				},
			],
		},
	];

	it("returns the newest failed candidate for the pool", () => {
		const c = findFailedCandidate("poolA", entries);
		expect(c?.heuristicScore).toBe(10);
	});

	it("ignores successful candidates and other pools", () => {
		expect(findFailedCandidate("poolB", entries)).toBeNull();
		expect(findFailedCandidate("poolX", entries)).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-retry.test.ts`
Expected: FAIL — `findFailedCandidate` is not exported yet.

- [ ] **Step 3: Add `findFailedCandidate` and `retryFailed`**

In `engine.ts`, add a module-level helper (after the `WSOL_MINT` const):

```ts
/** Newest journal candidate with a failed execution for the pool, or null. */
export function findFailedCandidate(
	pool: string,
	entries: readonly AgentJournalEntry[],
): JournalCandidate | null {
	for (let i = entries.length - 1; i >= 0; i--) {
		const cands = entries[i].candidates;
		for (let j = cands.length - 1; j >= 0; j--) {
			const c = cands[j];
			if (c.pool === pool && c.execution === "failed") return c;
		}
	}
	return null;
}
```

Add `retryFailed` to the `RuntimeAgent` interface:

```ts
export interface RuntimeAgent {
	state: AgentState;
	start(): void;
	stop(): void;
	runCycle(): Promise<void>;
	runFast(): Promise<void>;
	runOor(): Promise<void>;
	runBriefing(): Promise<void>;
	retryFailed(pool: string): Promise<string>;
}
```

Add module-level retry helpers (place near `evaluateTpSl`/`evaluateOor`, after `syncOnchainPlans`):

```ts
async function retryOpen(
	rt: RuntimeAgent,
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	cand: JournalCandidate,
): Promise<string> {
	const wallet = await resolveWallet();
	const open = await api.openPortfolio(wallet, 1, 100);
	const deployed = Number(open.total?.balancesSol ?? 0);
	const openPositions = open.totalPositions ?? 0;
	const dup = checkDuplicate({ pool: cand.pool, baseMint: null, plans: rt.state.plans });
	if (!dup.ok) return `retry blocked: ${dup.reason}`;
	const cd = checkPoolCooldown(cand.pool, null, rt.state.cooldowns, Date.now());
	if (!cd.ok) return `retry blocked: ${cd.reason}`;
	const amountSol = deriveOpenAmount(deployed, cfg);
	const guard = checkOpenGuardrail({
		amountSol,
		deployedSol: deployed,
		maxSolPerPosition: cfg.maxSolPerPosition,
		maxTotalSol: cfg.maxTotalSol,
		maxOpenPositions: cfg.maxOpenPositions,
		openPositionCount: openPositions,
	});
	if (!guard.ok) return `retry blocked: ${guard.reason}`;
	if (amountSol <= 0) return "retry blocked: no budget remaining";
	const cooldown = checkCooldown({
		lastExecutionAt: lastOpenExecutionAt(rt.state.executions),
		nowMs: Date.now(),
		txCooldownMs: cfg.txCooldownMs,
	});
	if (!cooldown.ok) return `retry blocked: ${cooldown.reason}`;
	const preset = resolveCreatePresetFrom(getConfigSync());
	const params = buildCreateParams({
		poolAddress: cand.pool,
		strategy: preset.strategy,
		range: preset.range,
		amountSol,
	});
	let quote: PositionCostQuote;
	try {
		quote = await dlmm.quotePositionCost(params);
	} catch {
		return "retry blocked: rent quote failed";
	}
	const rent = checkRent(quote);
	if (!rent.ok) return `retry blocked: ${rent.reason}`;
	try {
		const res = await dlmm.createPosition(params);
		const sig = res.signatures.join(",");
		const now = new Date().toISOString();
		rt.state.plans.push({
			pool: cand.pool,
			poolName: cand.poolName,
			baseMint: null,
			amountSol,
			positionAddress: res.positions[0] ?? null,
			openedAt: now,
		});
		rt.state.executions.push({
			at: now,
			action: "open",
			pool: cand.pool,
			txSignature: sig || null,
		});
		appendJournal({
			ts: now,
			cycle: rt.state.cycle,
			llmStatus: rt.state.llmStatus,
			candidates: [{ ...cand, execution: "ok", txSignature: sig || null }],
		});
		saveState(rt.state);
		const actionId = res.positions[0]
			? registerAction(cand.pool, res.positions[0])
			: undefined;
		await notify(
			bot,
			chatId,
			cfg.notifLevel,
			"action",
			formatAction({ action: "open", poolName: cand.poolName, amountSol, txSignature: sig || null }),
			{ keyboard: notifyKeyboard("open", actionId) },
		);
		return `OPEN ${cand.poolName} ${amountSol} SOL (retried)`;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		appendJournal({
			ts: new Date().toISOString(),
			cycle: rt.state.cycle,
			llmStatus: rt.state.llmStatus,
			candidates: [{ ...cand, execution: "failed" }],
		});
		return `retry failed: ${msg}`;
	}
}

async function retryClose(
	rt: RuntimeAgent,
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	cand: JournalCandidate,
): Promise<string> {
	const plan = rt.state.plans.find(
		(p) => p.pool === cand.pool && p.positionAddress != null,
	);
	if (!plan?.positionAddress) return `no open position to close for ${cand.poolName}`;
	try {
		const out = await zap.closeAndZapOut(cand.pool, plan.positionAddress, WSOL_MINT);
		const sig = out.closeSig ?? out.zapSig ?? out.claimSig ?? "";
		rt.state.plans = rt.state.plans.filter((p) => p !== plan);
		rt.state.executions.push({
			at: new Date().toISOString(),
			action: cand.action,
			pool: cand.pool,
			txSignature: sig || null,
		});
		rt.state.cooldowns = recordCooldown(
			rt.state.cooldowns,
			{
				pool: cand.pool,
				poolName: cand.poolName,
				baseMint: plan.baseMint,
				reason: `${cand.action} retried`,
			},
			cfg.poolCooldownMs,
			Date.now(),
		);
		appendJournal({
			ts: new Date().toISOString(),
			cycle: rt.state.cycle,
			llmStatus: rt.state.llmStatus,
			candidates: [{ ...cand, execution: "ok", txSignature: sig || null }],
		});
		saveState(rt.state);
		const closeId = registerAction(cand.pool, plan.positionAddress);
		await notify(
			bot,
			chatId,
			cfg.notifLevel,
			"action",
			formatAction({ action: cand.action, poolName: cand.poolName, txSignature: sig || null }),
			{ keyboard: notifyKeyboard("close", closeId) },
		);
		return `${cand.action.toUpperCase()} ${cand.poolName} (retried)`;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return `retry failed: ${msg}`;
	}
}
```

Note: `resolveWallet` is already imported in `engine.ts`; `PositionCostQuote` is already imported (used at line 3). Add `readJournalAll` to the existing `./journal.js` import in `engine.ts` (line ~48 currently imports only `readJournal`).

Add `retryFailed` to the `rt` object literal in `createAgent` (after `runBriefing`):

```ts
async retryFailed(pool: string): Promise<string> {
	const cand = findFailedCandidate(pool, readJournalAll());
	if (!cand) return "no failed action to retry for this pool";
	const cfg = resolveAgentConfigFrom(await getConfig());
	try {
		if (cand.action === "open") return await retryOpen(rt, bot, chatId, cfg, cand);
		return await retryClose(rt, bot, chatId, cfg, cand);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return `retry failed: ${msg}`;
	}
},
```

Note: `cand.action` here is typed `JournalAction`; `formatAction`'s `action` param is `JournalCandidate["action"]` (also `JournalAction`), so no cast needed. If a `hold` candidate somehow had `execution: "failed"` (should not happen), `retryClose` handles it safely.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-retry.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the `notif:retry` handler**

In `commands.ts`, replace the handler:

```ts
bot.callbackQuery(/^notif:retry:(.+)$/, async (ctx) => {
	await ctx.answerCallbackQuery();
	const pool = ctx.match[1];
	await ctx.editMessageText("⏳ Retrying…", MD);
	const msg = await rt.retryFailed(pool);
	await ctx.editMessageText(escapeMarkdown(msg), {
		...MD,
		reply_markup: new InlineKeyboard().text("⬅️ Dashboard", "menu:main"),
	});
});
```

`escapeMarkdown` is already imported in `commands.ts`.

- [ ] **Step 6: Verify + commit**

Run: `npm run check && npm run typecheck && npm test`
Then:

```bash
git add src/telegram/agent/engine.ts src/telegram/agent/commands.ts test/agent-retry.test.ts
git commit -m "fix(agent): retry button re-attempts the failed open/close action"
```

---

### Task 5: `agent.enabled` config ↔ runtime sync

**Files:**
- Modify: `src/telegram/bot.ts:97,114-124` (pass `rtAgent` to `registerConfigEditor`)
- Modify: `src/telegram/handlers/config-editor.ts:712` (`registerConfigEditor` signature), `:801-819` (toggle handler), `:894-908` (text-edit handler)
- Modify: `src/telegram/agent/commands.ts:4` (import), `:152-177` (start/stop command cases)

**Interfaces:**
- Consumes: `RuntimeAgent` type (from Task 4's `engine.ts` — already exported).
- Produces: `registerConfigEditor(bot, rtAgent?)`; `/agent start|stop` write `agent.enabled` to config.

- [ ] **Step 1: Thread `rtAgent` through `bot.ts`**

In `src/telegram/bot.ts`:
- Add `import type { RuntimeAgent } from "./agent/engine.js";` next to the existing `createAgent` import.
- Remove the early `registerConfigEditor(bot);` call at line 97.
- Restructure so the config editor is registered after the agent exists, with `rtAgent` available:

```ts
let rtAgent: RuntimeAgent | null = null;

if (chatId) {
	const rt = createAlerts(bot, chatId);
	registerAlertCommands(bot, chatId, rt);
	createTpSl(bot, chatId);
	registerTpSlCommands(bot);

	rtAgent = createAgent(bot, chatId);
	registerDashboard(bot, rtAgent); // live header
	registerMenuSpokes(bot, rtAgent);
	registerAgentCommands(bot, rtAgent);
	const agentCfg = resolveAgentConfigFrom(
		await runtime.runPromise(Effect.flatMap(AppConfig, (c) => c.get)),
	);
	if (agentCfg.enabled) rtAgent.start();
} else {
	registerDashboard(bot, null); // idle header fallback
}

registerConfigEditor(bot, rtAgent);
```

- [ ] **Step 2: Accept and use `rtAgent` in `config-editor.ts`**

- Add `import type { RuntimeAgent } from "../agent/engine.js";`.
- Change the signature:

```ts
export function registerConfigEditor(bot: Bot, rtAgent?: RuntimeAgent | null) {
```

- Add a local sync helper inside `registerConfigEditor`:

```ts
const syncAgentRuntime = async (enabled: boolean) => {
	if (!rtAgent) return;
	if (enabled) rtAgent.start();
	else rtAgent.stop();
};
```

- In the `cfg:toggle` handler (`bot.callbackQuery(/^cfg:toggle:(.+)$/)`), after the `updateConfig` try/catch succeeds and before building the text, add:

```ts
if (field === "agent.enabled") {
	await syncAgentRuntime(getNestedValue(getConfigSync(), field) === true);
}
```

- In the `bot.on("message:text", ...)` handler, after the `updateConfig` try/catch succeeds (before building `text`), add:

```ts
if (pending.key === "agent.enabled") {
	await syncAgentRuntime(getNestedValue(getConfigSync(), pending.key) === true);
}
```

- [ ] **Step 3: Persist runtime start/stop to config in `commands.ts`**

- Add `updateConfig` to the existing `../fx.js` import:

```ts
import { api, getConfig, resolveWallet, updateConfig } from "../fx.js";
```

- Add a module-level helper near `planActionLabel`:

```ts
async function syncEnabledConfig(enabled: boolean): Promise<void> {
	try {
		await updateConfig((c) => {
			c.agent = { ...c.agent, enabled };
			return c;
		});
	} catch (e) {
		console.warn("[agent] failed to sync agent.enabled to config:", e);
	}
}
```

- In the `/agent` command handler, update the `start` and `stop` cases:

```ts
case "start": {
	rt.start();
	await syncEnabledConfig(true);
	await ctx.reply("🤖 DLMM Agent started.", MD);
	break;
}
case "stop": {
	rt.stop();
	await syncEnabledConfig(false);
	await ctx.reply("🛑 DLMM Agent stopped.", MD);
	break;
}
```

- [ ] **Step 4: Verify**

Run: `npm run check && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/bot.ts src/telegram/handlers/config-editor.ts src/telegram/agent/commands.ts
git commit -m "fix(agent): keep agent.enabled config and runtime in sync"
```

---

## Self-Review

**Spec coverage:**
- Fix 1 (state-aware buttons) → Task 1 ✓
- Fix 2 (journal filter) → Task 2 ✓
- Fix 3 (Clear stops agent) → Task 3 ✓
- Fix 4 (Retry re-attempts action) → Task 4 ✓
- Fix 5 (config ↔ runtime sync) → Task 5 ✓

**Placeholder scan:** No TBD/TODO; every code step has concrete snippets. Note: the plan says "Confirm by grep that every `editOrIgnore` call passes a keyboard" — this was verified while writing the plan (24 matches, all explicit); the step is a verification instruction, not a placeholder.

**Type consistency:** `agentKeyboard(enabled)` / `portfolioKeyboard(enabled)` / `editOrIgnore(keyboard required)` are consistent across Tasks 1 and 3. `JournalFilter` reuse in Task 2 matches the existing type. `RuntimeAgent.retryFailed(pool): Promise<string>` and `findFailedCandidate(pool, entries)` signatures are identical in Tasks 4's definition and use. `retryOpen`/`retryClose` names used in `retryFailed` match their definitions.

**Known simplification:** Task 4's `retryOpen` re-checks deterministic guardrails (duplicate, pool cooldown, budget, tx cooldown, rent) but skips `checkRisks` (needs a fresh full pool screen; the original LLM decision already passed risk checks, and the failure was tx-level). This is an accepted trade-off documented here and matches the spec's "guardrails re-checked" intent at the level that matters for a retry.
