# Agent UX/Monitoring Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the DLMM agent level-gated Telegram notifications (live/action/summary/error) plus a richer portfolio view, journal UI, and status.

**Architecture:** A small pure `notify.ts` gate + `stats.ts` aggregation feed level-aware sends from `engine.ts`, and new `formatAction`/`formatPortfolio`/`formatJournalPage` renderers power extended `/agent` subcommands with an interactive keyboard.

**Tech Stack:** TypeScript (strict, ESM), Effect, grammY, Vitest, Biome.

## Global Constraints

- ESM-only: every relative import ends in `.js` (e.g. `import { x } from "./foo.js"`).
- Biome: tab indentation, double quotes, organize imports. Run `npm run check` before committing; auto-fix with `npm run format`.
- TS strict, no unused locals/params. `tsc` excludes `test/` — but tests must still import only real exported symbols.
- Verify order per task: targeted `npx vitest run test/<file>.test.ts`, then `npm run check`, then `npm run typecheck`.
- Telegram MarkdownV2: every dynamic string must go through `escapeMarkdown`/`tgCode`/`tgPct`/`tgTs` from `src/telegram/format.ts` — never interpolate raw user/data text.
- `notify` is fire-and-forget: swallow Telegram errors; agent logic must never depend on notification success.
- Spec: `docs/superpowers/specs/2026-08-09-agent-ux-monitoring-design.md`.

---

### Task 1: Config `agent.notifLevel`

**Files:**
- Modify: `src/domain/config.ts`
- Modify: `src/services/Config.ts:117-186`
- Modify: `src/telegram/handlers/config-editor.ts`
- Modify: `test/agent-config.test.ts`
- Modify: `test/agent-format.test.ts:11-45`

**Interfaces:**
- Produces: `NotifLevel = "verbose" | "normal" | "errors-only"` (exported from `src/domain/config.ts`); `ResolvedAgentConfig.notifLevel: NotifLevel`.

- [ ] **Step 1: Write the failing test**

In `test/agent-config.test.ts`, inside `describe("resolveAgentConfigFrom", ...)`, add:

```ts
it("defaults notifLevel to normal and honors override", () => {
	const c = resolveAgentConfigFrom({}, {});
	expect(c.notifLevel).toBe("normal");
	const c2 = resolveAgentConfigFrom(
		{ agent: { notifLevel: "errors-only" } },
		{},
	);
	expect(c2.notifLevel).toBe("errors-only");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-config.test.ts`
Expected: FAIL — `notifLevel` not on resolved config.

- [ ] **Step 3: Add the type**

In `src/domain/config.ts`, above `AgentConfig`:

```ts
export type NotifLevel = "verbose" | "normal" | "errors-only";
```

In the `AgentConfig` interface (line ~103), add after `slPct`:

```ts
	notifLevel?: NotifLevel;
```

- [ ] **Step 4: Resolve it**

In `src/services/Config.ts`, import the type at the top (existing `VexisConfig` import line):

```ts
import type { NotifLevel, VexisConfig } from "../domain/config.js";
```

In `ResolvedAgentConfig` (line ~128, after `slPct`), add:

```ts
	notifLevel: NotifLevel;
```

In `resolveAgentConfigFrom` (after `slPct: a.slPct ?? c.stopLossPct ?? -10,`), add:

```ts
		notifLevel: a.notifLevel ?? "normal",
```

- [ ] **Step 5: Add the config-editor field**

In `src/telegram/handlers/config-editor.ts`, in the agent field array (after the `agent.slPct` entry, line ~251), add:

```ts
	{
		key: "agent.notifLevel",
		label: "Agent Notif Level (verbose/normal/errors-only)",
		type: "string" as const,
	},
```

- [ ] **Step 6: Fix the stale fixture**

In `test/agent-format.test.ts`, the `cfg: ResolvedAgentConfig` literal (line ~11) is missing `poolCooldownMs` (pre-existing) and now `notifLevel`. Add both after `slPct: -10,` (line 21):

```ts
	slPct: -10,
	poolCooldownMs: 24 * 3_600_000,
	notifLevel: "normal",
```

- [ ] **Step 7: Run tests + check**

Run: `npx vitest run test/agent-config.test.ts test/agent-format.test.ts`
Expected: PASS.
Then: `npm run check && npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/domain/config.ts src/services/Config.ts src/telegram/handlers/config-editor.ts test/agent-config.test.ts test/agent-format.test.ts
git commit -m "feat(agent): add notifLevel config (verbose/normal/errors-only)"
```

---

### Task 2: `notify.ts` gate + sender

**Files:**
- Create: `src/telegram/agent/notify.ts`
- Create: `test/agent-notify.test.ts`

**Interfaces:**
- Consumes: `NotifLevel` from `src/domain/config.ts`; `MD` from `src/telegram/utils.ts`; `Bot` type from `grammy`.
- Produces: `NotifTag = "live" | "action" | "summary" | "error"`; `allowed(cfgLevel: NotifLevel, tag: NotifTag): boolean`; `notify(bot: Bot, chatId: string, cfgLevel: NotifLevel, tag: NotifTag, msg: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `test/agent-notify.test.ts`:

```ts
import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import type { NotifLevel } from "../src/domain/config.js";
import { allowed, notify, type NotifTag } from "../src/telegram/agent/notify.js";

const stubBot = (
	sendMessage: (
		chatId: string,
		msg: string,
		opts?: Record<string, unknown>,
	) => Promise<unknown>,
) => ({ api: { sendMessage } }) as unknown as Bot;

const LEVELS: NotifLevel[] = ["verbose", "normal", "errors-only"];
const TAGS: NotifTag[] = ["live", "action", "summary", "error"];

describe("allowed", () => {
	it.each([
		["verbose", "live", true],
		["verbose", "action", true],
		["verbose", "summary", true],
		["verbose", "error", true],
		["normal", "live", false],
		["normal", "action", true],
		["normal", "summary", true],
		["normal", "error", true],
		["errors-only", "live", false],
		["errors-only", "action", true],
		["errors-only", "summary", false],
		["errors-only", "error", true],
	] as const)("allowed(%s, %s) = %s", (level, tag, expected) => {
		expect(allowed(level, tag)).toBe(expected);
	});
});

describe("notify", () => {
	it("sends when allowed, passes MD parse mode", async () => {
		const send = vi.fn().mockResolvedValue({});
		const bot = stubBot(send);
		await notify(bot, "c1", "normal", "action", "msg");
		expect(send).toHaveBeenCalledWith("c1", "msg", {
			parse_mode: "MarkdownV2",
			link_preview_options: { is_disabled: true },
		});
	});

	it("skips silently when gated out", async () => {
		const send = vi.fn().mockResolvedValue({});
		const bot = stubBot(send);
		await notify(bot, "c1", "normal", "live", "msg");
		expect(send).not.toHaveBeenCalled();
	});

	it("swallows Telegram errors", async () => {
		const send = vi.fn().mockRejectedValue(new Error("telegram down"));
		const bot = stubBot(send);
		await expect(notify(bot, "c1", "normal", "action", "msg")).resolves.toBeUndefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-notify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/telegram/agent/notify.ts`:

```ts
import type { Bot } from "grammy";
import type { NotifLevel } from "../../domain/config.js";
import { MD } from "../utils.js";

export type NotifTag = "live" | "action" | "summary" | "error";

const TAG_LEVELS: Record<NotifTag, readonly NotifLevel[]> = {
	live: ["verbose"],
	action: ["verbose", "normal", "errors-only"],
	summary: ["verbose", "normal"],
	error: ["verbose", "normal", "errors-only"],
};

export function allowed(cfgLevel: NotifLevel, tag: NotifTag): boolean {
	return TAG_LEVELS[tag].includes(cfgLevel);
}

export async function notify(
	bot: Bot,
	chatId: string,
	cfgLevel: NotifLevel,
	tag: NotifTag,
	msg: string,
): Promise<void> {
	if (!allowed(cfgLevel, tag)) return;
	try {
		await bot.api.sendMessage(chatId, msg, MD);
	} catch {
		// fire-and-forget — agent logic never depends on notification success
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-notify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/notify.ts test/agent-notify.test.ts
git commit -m "feat(agent): level-gated notify helper (verbose/normal/errors-only)"
```

---

### Task 3: `stats.ts` aggregation

**Files:**
- Create: `src/telegram/agent/stats.ts`
- Create: `test/agent-stats.test.ts`

**Interfaces:**
- Consumes: `PerfRecord` from `src/telegram/agent/signalWeights.ts`; `AgentJournalEntry` from `src/telegram/agent/journal.ts`.
- Produces:
  - `interface TradeStats { closes: number; wins: number; losses: number; winRate: number | null; avgPnlPct: number | null; bestPnl: number | null; worstPnl: number | null; totalPnlPct: number | null; }`
  - `tradeStats(perf: readonly PerfRecord[]): TradeStats`
  - `interface ActionCounts { open: number; hold: number; tp: number; sl: number; close: number; blocked: number; failed: number; }`
  - `actionCounts(entries: readonly AgentJournalEntry[]): ActionCounts`

- [ ] **Step 1: Write the failing test**

Create `test/agent-stats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AgentJournalEntry } from "../src/telegram/agent/journal.js";
import type { PerfRecord } from "../src/telegram/agent/signalWeights.js";
import { actionCounts, tradeStats } from "../src/telegram/agent/stats.js";

const perf = (pnls: number[]): PerfRecord[] =>
	pnls.map((pnlPct, i) => ({
		closedAt: `2026-08-08T00:0${i}:00Z`,
		pnlPct,
		signals: {} as PerfRecord["signals"],
	}));

describe("tradeStats", () => {
	it("aggregates wins/losses/win rate/avg/total", () => {
		const s = tradeStats(perf([10, -5, 20, 0]));
		expect(s.closes).toBe(4);
		expect(s.wins).toBe(2);
		expect(s.losses).toBe(1);
		expect(s.winRate).toBeCloseTo(50);
		expect(s.avgPnlPct).toBeCloseTo(6.25);
		expect(s.bestPnl).toBe(20);
		expect(s.worstPnl).toBe(-5);
		expect(s.totalPnlPct).toBe(25);
	});

	it("returns nulls on empty perf", () => {
		const s = tradeStats([]);
		expect(s.closes).toBe(0);
		expect(s.winRate).toBeNull();
		expect(s.avgPnlPct).toBeNull();
	});
});

describe("actionCounts", () => {
	const base = {
		ts: "2026-08-08T00:00:00Z",
		cycle: 1,
		llmStatus: "ok" as const,
	};
	const entry: AgentJournalEntry = {
		...base,
		candidates: [
			{
				pool: "P1",
				poolName: "A/SOL",
				heuristicScore: 80,
				favorability: 0.5,
				rationale: "r",
				score: 81,
				action: "open",
				guardrail: "pass",
				blockedReason: null,
				execution: "ok",
				txSignature: "s",
			},
			{
				pool: "P2",
				poolName: "B/SOL",
				heuristicScore: 0,
				favorability: null,
				rationale: "dup",
				score: 0,
				action: "open",
				guardrail: "blocked",
				blockedReason: "already open",
				execution: null,
				txSignature: null,
			},
			{
				pool: "P3",
				poolName: "C/SOL",
				heuristicScore: 0,
				favorability: null,
				rationale: "r",
				score: 0,
				action: "open",
				guardrail: "pass",
				blockedReason: null,
				execution: "failed",
				txSignature: null,
			},
			{
				pool: "P4",
				poolName: "D/SOL",
				heuristicScore: 0,
				favorability: null,
				rationale: "r",
				score: 0,
				action: "sl",
				guardrail: "pass",
				blockedReason: null,
				execution: "ok",
				txSignature: "s",
			},
		],
	};

	it("counts actions, blocked and failed separately", () => {
		const c = actionCounts([entry]);
		expect(c.open).toBe(2); // one ok + one failed
		expect(c.sl).toBe(1);
		expect(c.blocked).toBe(1); // blocked candidate not double-counted in open
		expect(c.failed).toBe(1);
		expect(c.tp).toBe(0);
		expect(c.close).toBe(0);
		expect(c.hold).toBe(0);
	});

	it("empty journal → all zero", () => {
		expect(actionCounts([])).toEqual({
			open: 0,
			hold: 0,
			tp: 0,
			sl: 0,
			close: 0,
			blocked: 0,
			failed: 0,
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-stats.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/telegram/agent/stats.ts`:

```ts
import type { AgentJournalEntry } from "./journal.js";
import type { PerfRecord } from "./signalWeights.js";

export interface TradeStats {
	closes: number;
	wins: number;
	losses: number;
	winRate: number | null;
	avgPnlPct: number | null;
	bestPnl: number | null;
	worstPnl: number | null;
	totalPnlPct: number | null;
}

export function tradeStats(perf: readonly PerfRecord[]): TradeStats {
	if (perf.length === 0) {
		return {
			closes: 0,
			wins: 0,
			losses: 0,
			winRate: null,
			avgPnlPct: null,
			bestPnl: null,
			worstPnl: null,
			totalPnlPct: null,
		};
	}
	const pnls = perf.map((p) => p.pnlPct);
	const wins = pnls.filter((p) => p > 0).length;
	const losses = pnls.filter((p) => p < 0).length;
	const total = pnls.reduce((a, b) => a + b, 0);
	return {
		closes: pnls.length,
		wins,
		losses,
		winRate: (wins / pnls.length) * 100,
		avgPnlPct: total / pnls.length,
		bestPnl: Math.max(...pnls),
		worstPnl: Math.min(...pnls),
		totalPnlPct: total,
	};
}

export interface ActionCounts {
	open: number;
	hold: number;
	tp: number;
	sl: number;
	close: number;
	blocked: number;
	failed: number;
}

const EMPTY_COUNTS: ActionCounts = {
	open: 0,
	hold: 0,
	tp: 0,
	sl: 0,
	close: 0,
	blocked: 0,
	failed: 0,
};

export function actionCounts(
	entries: readonly AgentJournalEntry[],
): ActionCounts {
	const counts: ActionCounts = { ...EMPTY_COUNTS };
	for (const e of entries) {
		for (const c of e.candidates) {
			if (c.guardrail === "blocked") {
				counts.blocked += 1;
				continue;
			}
			counts[c.action] += 1;
			if (c.execution === "failed") counts.failed += 1;
		}
	}
	return counts;
}
```

Note: `counts[c.action]` is safe — `JournalAction = "open" | "hold" | "tp" | "sl" | "close"` and all five keys exist in `ActionCounts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/agent-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/stats.ts test/agent-stats.test.ts
git commit -m "feat(agent): journal/perf stats aggregation (tradeStats, actionCounts)"
```

---

### Task 4: Formatters — `formatAction`, `formatError`, richer status, portfolio, journal page

**Files:**
- Modify: `src/telegram/agent/format.ts`
- Modify: `src/telegram/agent/journal.ts` (add `readJournalAll`)
- Modify: `test/agent-format.test.ts`

**Interfaces:**
- Consumes: `NotifLevel` via `ResolvedAgentConfig.notifLevel` (Task 1); `TradeStats`, `ActionCounts` (Task 3); `JournalAction`/`AgentJournalEntry`/`JournalCandidate` (existing).
- Produces:
  - `formatAction(msg: ActionMessage): string` where `interface ActionMessage { action: JournalAction; poolName: string; amountSol?: number; pnlPct?: number | null; reason?: string | null; txSignature?: string | null; failed?: boolean; }`
  - `formatError(scope: string, err: unknown): string`
  - `formatStatus(state: AgentState, cfg: ResolvedAgentConfig, stats?: TradeStats | null): string` (extended signature)
  - `interface PortfolioRow { poolName: string; amountSol: number; pnlPct: number | null; outOfRange: boolean | null; }`
  - `formatPortfolio(rows: readonly PortfolioRow[], deployedSol: number, stats: TradeStats): string`
  - `type JournalFilter = "all" | "opens" | "closes" | "blocked";`
  - `journalPageCount(entryCount: number, pageSize: number): number`
  - `formatJournalPage(entries: readonly AgentJournalEntry[], opts: { page: number; pageSize: number; filter: JournalFilter }, counts: ActionCounts): string`
  - `readJournalAll(file?: string): AgentJournalEntry[]` from `journal.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/agent-format.test.ts`:

```ts
import {
	formatAction,
	formatError,
	formatJournalPage,
	formatPortfolio,
	journalPageCount,
} from "../src/telegram/agent/format.js";
import type { PerfRecord } from "../src/telegram/agent/signalWeights.js";
import { actionCounts, tradeStats } from "../src/telegram/agent/stats.js";

describe("formatAction", () => {
	it("renders an executed open with tx signature", () => {
		const out = formatAction({
			action: "open",
			poolName: "A/SOL",
			amountSol: 0.5,
			reason: "strong fees",
			txSignature: "abc123def456",
		});
		expect(out).toContain("OPEN");
		expect(out).toContain("A/SOL");
		expect(out).toContain("0.5");
		expect(out).toContain("abc123def456");
	});
	it("renders a failed close", () => {
		const out = formatAction({
			action: "sl",
			poolName: "B/SOL",
			failed: true,
		});
		expect(out).toContain("FAILED");
		expect(out).toContain("SL");
	});
	it("escapes MarkdownV2 in pool names", () => {
		const out = formatAction({
			action: "close",
			poolName: "C/D (fee+3%)",
			failed: true,
		});
		expect(out).toContain("\\(");
		expect(out).toContain("\\+");
	});
});

describe("formatError", () => {
	it("renders scope and message", () => {
		const out = formatError("cycle", new Error("boom"));
		expect(out).toContain("cycle");
		expect(out).toContain("boom");
	});
});

describe("formatStatus stats", () => {
	it("adds notif level and trade stats when provided", () => {
		const s: AgentState = {
			enabled: true,
			running: false,
			lastCycleAt: null,
			llmStatus: "ok",
			cycle: 3,
			plans: [],
			executions: [],
			cooldowns: [
				{
					pool: "P1",
					poolName: "A/SOL",
					baseMint: null,
					until: "2099-01-01T00:00:00Z",
					reason: "closed (OOR)",
				},
			],
		};
		const stats = tradeStats([
			{ closedAt: "2026-08-08T00:00:00Z", pnlPct: 10, signals: {} as PerfRecord["signals"] },
		]);
		const out = formatStatus(s, { ...cfg, notifLevel: "verbose" }, stats);
		expect(out).toContain("verbose");
		expect(out).toContain("Cooldowns: 1");
		expect(out).toContain("win 100%");
	});
});

describe("formatPortfolio", () => {
	it("renders rows, deployed and trade stats", () => {
		const stats = tradeStats([
			{ closedAt: "2026-08-08T00:00:00Z", pnlPct: 10, signals: {} as PerfRecord["signals"] },
		]);
		const out = formatPortfolio(
			[
				{ poolName: "A/SOL", amountSol: 0.5, pnlPct: 3.2, outOfRange: false },
				{ poolName: "B/SOL", amountSol: 1, pnlPct: null, outOfRange: true },
			],
			1.5,
			stats,
		);
		expect(out).toContain("A/SOL");
		expect(out).toContain("B/SOL");
		expect(out).toContain("1.5 SOL");
		expect(out).toContain("n/a");
		expect(out).toContain("OOR");
	});
	it("renders empty state", () => {
		const out = formatPortfolio([], 0, tradeStats([]));
		expect(out).toContain("No open positions");
	});
});

describe("journal page", () => {
	const entry = (cycle: number): AgentJournalEntry => ({
		ts: "2026-08-08T00:00:00Z",
		cycle,
		llmStatus: "ok",
		candidates: [
			{
				pool: `P${cycle}`,
				poolName: `Pool ${cycle}`,
				heuristicScore: 80,
				favorability: 0.5,
				rationale: "r",
				score: 81,
				action: "open",
				guardrail: "pass",
				blockedReason: null,
				execution: "ok",
				txSignature: "sig",
			},
		],
	});
	const entries = [entry(1), entry(2), entry(3), entry(4), entry(5), entry(6)];
	const counts = actionCounts(entries);

	it("journalPageCount computes pages", () => {
		expect(journalPageCount(6, 5)).toBe(2);
		expect(journalPageCount(0, 5)).toBe(1);
	});

	it("paginates newest-first with header", () => {
		const out = formatJournalPage(
			entries,
			{ page: 0, pageSize: 5, filter: "all" },
			counts,
		);
		expect(out).toContain("page 1/2");
		expect(out).toContain("Pool 6");
		expect(out).not.toContain("Pool 1");
	});
	it("second page shows older entries", () => {
		const out = formatJournalPage(
			entries,
			{ page: 1, pageSize: 5, filter: "all" },
			counts,
		);
		expect(out).toContain("Pool 1");
		expect(out).not.toContain("Pool 6");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-format.test.ts`
Expected: FAIL — `formatAction`/`formatError`/`formatPortfolio`/`formatJournalPage`/`journalPageCount` not exported.

- [ ] **Step 3: Add `readJournalAll`**

In `src/telegram/agent/journal.ts`, after `readJournal`:

```ts
export function readJournalAll(file = DEFAULT_FILE): AgentJournalEntry[] {
	return readJournal(Number.MAX_SAFE_INTEGER, file);
}
```

- [ ] **Step 4: Write the implementation**

In `src/telegram/agent/format.ts`, extend imports to add `AgentState` (already imported), `ActionCounts`/`TradeStats`, `JournalCandidate`, `JournalFilter` helpers. Update the import block to:

```ts
import type { ResolvedAgentConfig } from "../../services/Config.js";
import { escapeMarkdown, tgBold, tgCode, tgPct, tgTs } from "../format.js";
import type { AgentJournalEntry, JournalCandidate } from "./journal.js";
import type { AgentState } from "./state.js";
import type { ActionCounts, TradeStats } from "./stats.js";
```

Add after `formatStatus`:

```ts
export function formatAction(msg: {
	action: JournalCandidate["action"];
	poolName: string;
	amountSol?: number;
	pnlPct?: number | null;
	reason?: string | null;
	txSignature?: string | null;
	failed?: boolean;
}): string {
	const header = msg.failed
		? `❌ ${escapeMarkdown(msg.action.toUpperCase())} ${escapeMarkdown(msg.poolName)} failed`
		: `✅ ${escapeMarkdown(msg.action.toUpperCase())} ${escapeMarkdown(msg.poolName)}`;
	const lines = [header];
	if (msg.amountSol != null) {
		lines.push(`  ${escapeMarkdown(`${msg.amountSol} SOL`)}`);
	}
	if (msg.pnlPct != null) {
		lines.push(`  PnL: ${tgPct(msg.pnlPct)}`);
	}
	if (msg.reason) {
		lines.push(`  ${escapeMarkdown(msg.reason)}`);
	}
	if (msg.txSignature) {
		lines.push(`  ${tgCode(msg.txSignature)}`);
	}
	return lines.join("\n");
}

export function formatError(scope: string, err: unknown): string {
	const msg = err instanceof Error ? err.message : String(err);
	return `${tgBold(`❌ Agent ${escapeMarkdown(scope)} failed`)}\n${escapeMarkdown(msg)}`;
}
```

Replace `formatStatus` body to append notif level, cooldowns, and trade stats. After the `TP ${...} / SL ${...}` line, insert:

```ts
		`Notif: ${escapeMarkdown(cfg.notifLevel)}`,
		...(state.cooldowns.length > 0
			? [
					`Cooldowns: ${escapeMarkdown(String(state.cooldowns.length))}`,
					...state.cooldowns
						.slice(0, 3)
						.map(
							(c) =>
								`  • ${escapeMarkdown(c.poolName)} \\(${escapeMarkdown(c.reason)}\\)`,
						),
				]
			: []),
		...(stats && stats.closes > 0
			? [
					`Trades: ${escapeMarkdown(`${stats.closes} closed`)} \\| win ${escapeMarkdown(`${Math.round(stats.winRate ?? 0)}%`)} \\| avg ${escapeMarkdown(`${(stats.avgPnlPct ?? 0).toFixed(2)}%`)}`,
				]
			: []),
```

Change the signature (and the first line of the function) to:

```ts
export function formatStatus(
	state: AgentState,
	cfg: ResolvedAgentConfig,
	stats: TradeStats | null = null,
): string {
```

(Keep the existing line array as-is otherwise.)

Add after `formatLive`:

```ts
export interface PortfolioRow {
	poolName: string;
	amountSol: number;
	pnlPct: number | null;
	outOfRange: boolean | null;
}

export function formatPortfolio(
	rows: readonly PortfolioRow[],
	deployedSol: number,
	stats: TradeStats,
): string {
	const lines = [tgBold(`📊 Agent portfolio (${rows.length})`)];
	if (rows.length === 0) {
		lines.push("No open positions.");
	} else {
		lines.push("");
		for (const r of rows) {
			const oor = r.outOfRange ? " ⚠️ OOR" : "";
			const pnl =
				r.pnlPct == null
					? escapeMarkdown("PnL n/a")
					: `PnL ${tgPct(r.pnlPct)}`;
			lines.push(
				`${tgBold(r.poolName)}${escapeMarkdown(oor)}`,
				`  ${escapeMarkdown(`${r.amountSol} SOL`)} \\| ${pnl}`,
				"",
			);
		}
	}
	lines.push(`Deployed: ${escapeMarkdown(`${deployedSol} SOL`)}`);
	if (stats.closes > 0) {
		lines.push(
			`Trades: ${escapeMarkdown(`${stats.closes} closed`)} \\| win ${escapeMarkdown(`${Math.round(stats.winRate ?? 0)}%`)} \\| avg ${escapeMarkdown(`${(stats.avgPnlPct ?? 0).toFixed(2)}%`)}`,
		);
	}
	return lines.join("\n");
}

export type JournalFilter = "all" | "opens" | "closes" | "blocked";

export function journalPageCount(entryCount: number, pageSize: number): number {
	return Math.max(1, Math.ceil(entryCount / pageSize));
}

function journalMatches(c: JournalCandidate, filter: JournalFilter): boolean {
	switch (filter) {
		case "all":
			return true;
		case "opens":
			return c.execution === "ok";
		case "closes":
			return c.action === "tp" || c.action === "sl" || c.action === "close";
		case "blocked":
			return c.guardrail === "blocked";
	}
}

export function formatJournalPage(
	entries: readonly AgentJournalEntry[],
	opts: { page: number; pageSize: number; filter: JournalFilter },
	counts: ActionCounts,
): string {
	const newestFirst = [...entries].reverse();
	const totalPages = journalPageCount(newestFirst.length, opts.pageSize);
	const page = Math.min(Math.max(0, opts.page), totalPages - 1);
	const slice = newestFirst.slice(
		page * opts.pageSize,
		(page + 1) * opts.pageSize,
	);
	const lines = [
		tgBold(`📒 Agent journal (page ${page + 1}/${totalPages} · ${opts.filter})`),
		`opens ${escapeMarkdown(String(counts.open))} \\| closes ${escapeMarkdown(String(counts.tp + counts.sl + counts.close))} \\| blocked ${escapeMarkdown(String(counts.blocked))}`,
	];
	let any = false;
	for (const e of slice) {
		const cands = e.candidates.filter((c) => journalMatches(c, opts.filter));
		if (cands.length === 0) continue;
		any = true;
		lines.push(`• \\#${e.cycle} ${tgTs(e.ts)}`);
		for (const c of cands) {
			const status =
				c.guardrail === "blocked"
					? `⛔ ${escapeMarkdown(c.blockedReason ?? "")}`
					: c.execution === "ok"
						? `✅ ${tgCode(c.txSignature ?? "")}`
						: c.execution === "failed"
							? "❌ FAILED"
							: "";
			lines.push(
				`  ${escapeMarkdown(c.action.toUpperCase())} ${escapeMarkdown(c.poolName)} ${status}`,
			);
		}
	}
	if (!any) lines.push("No matching entries.");
	return lines.join("\n");
}
```

Note: `escapeMarkdown(String(counts.open))` — `String(...)` keeps linter quiet on implicit number coercion.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/agent-format.test.ts`
Expected: PASS.
Then: `npm run check && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/telegram/agent/format.ts src/telegram/agent/journal.ts test/agent-format.test.ts
git commit -m "feat(agent): action/error/portfolio/journal formatters + readJournalAll"
```

---

### Task 5: Engine wiring — notify routing, action messages, error notifs, live gating

**Files:**
- Modify: `src/telegram/agent/engine.ts`

**Interfaces:**
- Consumes: `allowed`, `notify` (Task 2); `formatAction`, `formatError` (Task 4); existing `formatCycleSummary`, `formatLive`, `readJournal`.
- Produces: `createAgent` now sends `notify`-gated messages. No signature changes.

- [ ] **Step 1: Update imports**

In `src/telegram/agent/engine.ts`, replace the import from `./format.js` (line 20):

```ts
import {
	formatAction,
	formatCycleSummary,
	formatError,
	formatLive,
} from "./format.js";
```

Add after the log import (line 45):

```ts
import { allowed, notify } from "./notify.js";
```

Remove the now-unused `import { MD } from "../utils.js";` (line 18) — the `send` helper is deleted below. Keep `readJournal` imported (still used at the end of `evaluatePlans`).

- [ ] **Step 2: Delete the `send` helper**

Remove the `send` function (lines 69-71):

```ts
function send(bot: Bot, chatId: string, msg: string) {
	return bot.api.sendMessage(chatId, msg, MD);
}
```

- [ ] **Step 3: Add a gated live-step helper**

After the `liveSend` function (line ~98), add:

```ts
async function liveStep(
	bot: Bot,
	chatId: string,
	cfg: AgentCfg,
	live: LiveMsg,
	msg: string,
): Promise<void> {
	if (allowed(cfg.notifLevel, "live")) {
		await liveSend(bot, chatId, live, msg);
	}
}
```

- [ ] **Step 4: Error notifications in `runFast` and `runCycle`**

In `runFast`, hoist `cfg` out of the `try` and notify on catch. Replace lines 162-178:

```ts
		async runFast() {
			if (rt.state.running || !rt.state.enabled) return;
			rt.state.running = true;
			let cfg: AgentCfg | undefined;
			try {
				cfg = resolveAgentConfigFrom(await getConfig());
				const wallet = await resolveWallet();
				section("TP/SL FAST CHECK");
				await evaluateTpSl(rt, bot, chatId, cfg, wallet, {
					includeOor: false,
				});
			} catch (e) {
				logError("fast cycle error:", e);
				if (cfg) {
					await notify(
						bot,
						chatId,
						cfg.notifLevel,
						"error",
						formatError("fast cycle", e),
					);
				}
			} finally {
				rt.state.running = false;
				saveState(rt.state);
			}
		},
```

Same pattern in `runCycle` (lines 179-208): add `let cfg: AgentCfg | undefined;` before the `try`, change `const cfg =` to `cfg =`, and in the `catch` after `logError("cycle error:", e);` add:

```ts
				if (cfg) {
					await notify(
						bot,
						chatId,
						cfg.notifLevel,
						"error",
						formatError("cycle", e),
					);
				}
```

- [ ] **Step 5: TP/SL close → action message**

In `evaluateTpSl`, replace the success send (line 339):

```ts
			await send(bot, chatId, formatCycleSummary(readJournal(1), false));
```

with:

```ts
			await notify(
				bot,
				chatId,
				cfg.notifLevel,
				"action",
				formatAction({
					action,
					poolName: plan.poolName,
					amountSol: plan.amountSol,
					pnlPct: pct,
					reason:
						action === "tp"
							? `TP ${cfg.tpPct}% hit`
							: `SL ${cfg.slPct}% hit`,
					txSignature: sig || null,
				}),
			);
```

In the `catch` (line 340-342), after `logError("tp/sl close failed:", e);`, add:

```ts
			await notify(
				bot,
				chatId,
				cfg.notifLevel,
				"action",
				formatAction({
					action,
					poolName: plan.poolName,
					failed: true,
				}),
			);
```

- [ ] **Step 6: OOR close → action message**

In `evaluateOor`, replace the success send (line 428):

```ts
			await send(bot, chatId, formatCycleSummary(readJournal(1), false));
```

with:

```ts
			await notify(
				bot,
				chatId,
				cfg.notifLevel,
				"action",
				formatAction({
					action: "close",
					poolName: pos.poolName,
					pnlPct: pos.pnlPct,
					reason: `OOR close: ${d.rationale ?? ""}`,
					txSignature: sig || null,
				}),
			);
```

In the `catch` (lines 429-436), after `logError("OOR close failed:", e);`, add:

```ts
			await notify(
				bot,
				chatId,
				cfg.notifLevel,
				"action",
				formatAction({
					action: "close",
					poolName: pos.poolName,
					failed: true,
				}),
			);
```

- [ ] **Step 7: `evaluatePlans` — gate live steps**

Replace every `await liveSend(bot, chatId, live, ...)` inside `evaluatePlans` with `await liveStep(bot, chatId, cfg, live, ...)` — **except the final summary call (lines 777-782), which Step 9 replaces**. Call sites: screening start, screening failed, screening done, cooldown skip, dup skip, LLM thinking, LLM done, `liveDecision`, open progress, open success, open failure. The `liveDecision` helper (line 568-571) becomes:

```ts
	const liveDecision = async (line: string) => {
		liveLines.push(line);
		await liveStep(bot, chatId, cfg, live, formatLive(cycle, liveLines));
	};
```

- [ ] **Step 8: `evaluatePlans` — action messages on open**

After the open-success `liveStep` (line 765), add:

```ts
			await notify(
				bot,
				chatId,
				cfg.notifLevel,
				"action",
				formatAction({
					action: "open",
					poolName: d.pool.name,
					amountSol,
					reason: d.rationale,
					txSignature: sig || null,
				}),
			);
```

In the open-failure `catch` (lines 766-771), after `logError("open failed:", d.pool.pool, e);`, add:

```ts
			await notify(
				bot,
				chatId,
				cfg.notifLevel,
				"action",
				formatAction({
					action: "open",
					poolName: d.pool.name,
					failed: true,
				}),
			);
```

- [ ] **Step 9: `evaluatePlans` — summary routing**

Replace the final `liveSend` (lines 777-782):

```ts
	await liveSend(
		bot,
		chatId,
		live,
		formatCycleSummary(readJournal(1), degraded),
	);
```

with:

```ts
	const summary = formatCycleSummary(readJournal(1), degraded);
	if (allowed(cfg.notifLevel, "verbose")) {
		await liveSend(bot, chatId, live, summary);
	} else {
		await notify(bot, chatId, cfg.notifLevel, "summary", summary);
	}
```

- [ ] **Step 10: Verify**

Run: `npm run check && npm run typecheck`
Expected: no errors. (No new unit tests for the engine — routing is verified by typecheck and the format/notify unit tests.)

- [ ] **Step 11: Commit**

```bash
git add src/telegram/agent/engine.ts
git commit -m "feat(agent): route notifications through notify gate, action msgs, error notifs"
```

---

### Task 6: Commands — `/agent portfolio`, interactive journal, richer status, keyboard

**Files:**
- Modify: `src/telegram/agent/commands.ts`
- Modify: `src/telegram/bot.ts`
- Modify: `test/agent-commands.test.ts` (create)

**Interfaces:**
- Consumes: `formatAction` not needed here; `formatPortfolio`, `formatJournalPage`, `journalPageCount`, `JournalFilter`, richer `formatStatus` (Task 4); `tradeStats`, `actionCounts` (Task 3); `readJournalAll`, `readJournal` (Task 4); `loadSignalWeights` (existing); `api`, `getConfig`, `resolveWallet` from `../fx.js`.
- Produces: subcommands `portfolio` + callbacks `agent:portfolio`, `agent:journal:page:<n>`, `agent:journal:filter:<f>`.

- [ ] **Step 1: Write the failing test**

Create `test/agent-commands.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { journalPageCount } from "../src/telegram/agent/format.js";

describe("journal pagination helper", () => {
	it("clamps and counts", () => {
		expect(journalPageCount(0, 5)).toBe(1);
		expect(journalPageCount(6, 5)).toBe(2);
		expect(journalPageCount(12, 5)).toBe(3);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-commands.test.ts`
Expected: PASS immediately (helper already exists) — this task is mostly wiring; the test guards the pagination contract used by the callbacks.

- [ ] **Step 3: Rewrite `commands.ts`**

Replace the whole file `src/telegram/agent/commands.ts` with:
`ponytail:` Pagination drops the active journal filter (page callbacks render `filter: "all"`). Filter state is per-message only; if persistence across pages matters, carry the filter in the `agent:journal:page:<n>` callback data.

```ts
import type { Api } from "grammy";
import { type Bot, InlineKeyboard } from "grammy";
import { resolveAgentConfigFrom } from "../../services/Config.js";
import { api, getConfig, resolveWallet } from "../fx.js";
import { MD } from "../utils.js";
import type { RuntimeAgent } from "./engine.js";
import {
	formatJournalPage,
	formatPortfolio,
	formatStatus,
	journalPageCount,
	type JournalFilter,
	type PortfolioRow,
} from "./format.js";
import { readJournalAll } from "./journal.js";
import { loadSignalWeights } from "./signalWeights.js";
import { actionCounts, tradeStats } from "./stats.js";

const PAGE_SIZE = 5;

// Telegram rejects editMessageText when content is unchanged. Ignore it.
async function editOrIgnore(
	api: Api,
	chatId: string | number,
	messageId: number,
	text: string,
	keyboard: InlineKeyboard = agentKeyboard(),
): Promise<void> {
	try {
		await api.editMessageText(chatId, messageId, text, {
			...MD,
			reply_markup: keyboard,
		});
	} catch (e) {
		const desc = e instanceof Error ? e.message : String(e);
		if (!desc.includes("not modified")) throw e;
	}
}

function tradeStatsOf() {
	return tradeStats(loadSignalWeights().perf);
}

async function portfolioRows(
	rt: RuntimeAgent,
): Promise<{ rows: PortfolioRow[]; deployedSol: number }> {
	const wallet = await resolveWallet();
	const rows: PortfolioRow[] = [];
	let deployedSol = 0;
	for (const plan of rt.state.plans) {
		deployedSol += plan.amountSol ?? 0;
		if (!plan.positionAddress) continue;
		try {
			const pdata = await api.positionPnl(plan.pool, wallet, "open");
			const pos = pdata.positions.find(
				(pp) => pp.positionAddress === plan.positionAddress,
			);
			if (!pos || pos.isClosed) continue;
			const n = pos.pnlSolPctChange ?? null;
			const pnlPct =
				n != null && Number.isFinite(n) ? n : parseFloat(pos.pnlPctChange);
			rows.push({
				poolName: plan.poolName,
				amountSol: plan.amountSol,
				pnlPct: Number.isFinite(pnlPct) ? pnlPct : null,
				outOfRange: pos.isOutOfRange ?? null,
			});
		} catch {
			// positionPnl failed for this pool → skip, PnL n/a
		}
	}
	return { rows, deployedSol };
}

function journalKeyboard(
	page: number,
	totalPages: number,
	filter: JournalFilter = "all",
): InlineKeyboard {
	const kb = new InlineKeyboard();
	if (page > 0) kb.text("⬅️", `agent:journal:page:${page - 1}`);
	if (page < totalPages - 1) kb.text("➡️", `agent:journal:page:${page + 1}`);
	kb.row();
	for (const f of ["all", "opens", "closes", "blocked"] as const) {
		kb.text(f === filter ? `• ${f}` : f, `agent:journal:filter:${f}`);
	}
	return kb;
}

export function registerAgentCommands(bot: Bot, rt: RuntimeAgent) {
	bot.command("agent", async (ctx) => {
		const [cmd, arg] = (ctx.match as string).trim().split(/\s+/);
		const cfg = resolveAgentConfigFrom(await getConfig());
		const stats = tradeStatsOf();
		switch (cmd) {
			case "start": {
				rt.start();
				await ctx.reply("🤖 Agent started.", MD);
				break;
			}
			case "stop": {
				rt.stop();
				await ctx.reply("🛑 Agent stopped.", MD);
				break;
			}
			case "status": {
				await ctx.reply(formatStatus(rt.state, cfg, stats), {
					...MD,
					reply_markup: agentKeyboard(),
				});
				break;
			}
			case "portfolio": {
				const { rows, deployedSol } = await portfolioRows(rt);
				await ctx.reply(
					formatPortfolio(rows, deployedSol, stats),
					{ ...MD, reply_markup: agentKeyboard() },
				);
				break;
			}
			case "journal": {
				const entries = readJournalAll();
				const counts = actionCounts(entries);
				const n = Math.min(parseInt(arg || "5", 10) || 5, 20);
				const text = formatJournalPage(
					entries,
					{ page: 0, pageSize: n, filter: "all" },
					counts,
				);
				const totalPages = journalPageCount(entries.length, n);
				await ctx.reply(text, {
					...MD,
					reply_markup: journalKeyboard(0, totalPages),
				});
				break;
			}
			default: {
				await ctx.reply(formatStatus(rt.state, cfg, stats), {
					...MD,
					reply_markup: agentKeyboard(),
				});
			}
		}
	});

	// ─── Interactive menu ────────────────────────────────────────────────────
	bot.callbackQuery(/^agent:(start|stop)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		if (ctx.match[1] === "start") rt.start();
		else rt.stop();
		const cfg = resolveAgentConfigFrom(await getConfig());
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatStatus(rt.state, cfg, tradeStatsOf()),
		);
	});

	bot.callbackQuery(/^agent:(status|main)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const cfg = resolveAgentConfigFrom(await getConfig());
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatStatus(rt.state, cfg, tradeStatsOf()),
		);
	});

	bot.callbackQuery(/^agent:portfolio$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const { rows, deployedSol } = await portfolioRows(rt);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatPortfolio(rows, deployedSol, tradeStatsOf()),
		);
	});

	bot.callbackQuery(/^agent:journal:page:(-?\d+)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const entries = readJournalAll();
		const totalPages = journalPageCount(entries.length, PAGE_SIZE);
		const page = Math.min(Math.max(0, parseInt(ctx.match[1], 10) || 0), totalPages - 1);
		const text = formatJournalPage(
			entries,
			{ page, pageSize: PAGE_SIZE, filter: "all" },
			actionCounts(entries),
		);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			text,
			journalKeyboard(page, totalPages),
		);
	});

	bot.callbackQuery(/^agent:journal:filter:(all|opens|closes|blocked)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const entries = readJournalAll();
		const filter = ctx.match[1] as JournalFilter;
		const text = formatJournalPage(
			entries,
			{ page: 0, pageSize: PAGE_SIZE, filter },
			actionCounts(entries),
		);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			text,
			journalKeyboard(0, journalPageCount(entries.length, PAGE_SIZE), filter),
		);
	});

	bot.callbackQuery(/^agent:journal$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const entries = readJournalAll();
		const totalPages = journalPageCount(entries.length, PAGE_SIZE);
		const text = formatJournalPage(
			entries,
			{ page: 0, pageSize: PAGE_SIZE, filter: "all" },
			actionCounts(entries),
		);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			text,
			journalKeyboard(0, totalPages),
		);
	});
}

function agentKeyboard(): InlineKeyboard {
	return new InlineKeyboard()
		.text("▶️ Start", "agent:start")
		.text("⏹ Stop", "agent:stop")
		.text("📊 Status", "agent:status")
		.row()
		.text("📊 Portfolio", "agent:portfolio")
		.text("📒 Journal", "agent:journal");
}
```

- [ ] **Step 4: Update the bot command description**

In `src/telegram/bot.ts` (line 133-135), change:

```ts
		{
			command: "agent",
			description: "Autonomous trading agent (start/stop/status/journal)",
		},
```

to:

```ts
		{
			command: "agent",
			description: "Trading agent (start/stop/status/portfolio/journal)",
		},
```

- [ ] **Step 5: Verify**

Run: `npm run check && npm run typecheck && npm test`
Expected: all pass. If biome flags `parseFloat(pos.pnlPctChange)` — it's a `string` field on `PositionPnLData`; `Number.isFinite` narrows to `number`.

- [ ] **Step 6: Commit**

```bash
git add src/telegram/agent/commands.ts src/telegram/bot.ts test/agent-commands.test.ts
git commit -m "feat(agent): /agent portfolio + interactive journal pagination + richer status"
```

---

### Task 7: Drive-by gitignore + full verification

**Files:**
- Modify: `.gitignore`
- Modify: (nothing else)

- [ ] **Step 1: Ignore the signal-weights file**

Append to `.gitignore` (after the journal line):

```
.vexis-agent-signals.json
```

- [ ] **Step 2: Full verify**

Run: `npm run check && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .vexis-agent-signals.json"
```
