# Remove Agent Notif Level Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the notification-level system from the DLMM agent so every notification (live, action, summary, error) is always sent — behavior equivalent to the old `verbose`.

**Architecture:** Delete the gating machinery (`NotifTag`, `TAG_LEVELS`, `allowed()`) from `notify.ts`, drop `notifLevel` from the resolved config, and strip every consumer (`engine.ts` gates/call-sites, `format.ts` display, `config-editor.ts` menu). The input key `agent.notifLevel` stays in `AgentConfig` marked `@deprecated` so old config files keep parsing (pattern: `minCandidate`).

**Tech Stack:** TypeScript (strict), Effect, grammY, Vitest, Biome.

## Global Constraints

- ESM-only: all imports use `.js` extensions.
- Biome formatting: tab indent, double quotes, organize imports. Run `npm run check` to lint + `npm run format` to auto-fix whitespace after edits.
- No comments unless they existed before (the fire-and-forget comment in `notify()` is retained).
- Verify per task: `npm run typecheck` and `npm test`. Full gate before finishing: `npm run check && npm run typecheck && npm test`.
- Commit message style: `feat(agent): ...` / `test(agent): ...` / `docs: ...` / `refactor(agent): ...` (see `git log`).

---
## File Map

| File | Change |
|---|---|
| `src/telegram/agent/notify.ts` | Remove `NotifTag`, `TAG_LEVELS`, `allowed`; new `notify(bot, chatId, msg, opts?)` signature |
| `src/telegram/agent/engine.ts` | Remove 2 `allowed` gates, `cfg` param from `liveStep` (~12 sites), `cfg.notifLevel,` + tag args from `notify` calls (~13 sites), fix import line 59 |
| `src/domain/config.ts` | `@deprecated` on `AgentConfig.notifLevel` |
| `src/services/Config.ts` | Remove `notifLevel` from `ResolvedAgentConfig` (line 133) + resolver (line 159) |
| `src/telegram/agent/format.ts` | Remove `\| notif ...` (line 32) and `Notif level ...` line (line 429) |
| `src/telegram/handlers/config-editor.ts` | Remove `agent.notifLevel` editable entry (lines 265-270) + "✏️ Notif Level" button (line 533) |
| `test/agent-notify.test.ts` | Remove `allowed` describe + gated-out test; 3-arg `notify` calls |
| `test/agent-config.test.ts` | Remove notifLevel default test (lines 38-46) |
| `test/agent-format.test.ts` | Remove `notifLevel` from fixture (line 37); rewrite tests at 201 and 503 |
| `test/agent-guardrails.test.ts` | Remove `notifLevel: "normal"` from fixture (line 34) |
| `test/agent-llm.test.ts` | Remove `notifLevel: "normal"` from fixture (line 29) |
| `docs/ai-agent.md` | Remove notif-level doc sections |

---

### Task 1: Unconditional `notify()` + engine call sites

**Files:**
- Modify: `src/telegram/agent/notify.ts`
- Modify: `src/telegram/agent/engine.ts` (import line 59; `liveStep` at 135-145; gate at 142; notify calls at 273, 343, 481, 530, 564, 738, 774, 910, 926, 968, 1069, 1321, 1340, 1366; liveStep sites at 977, 984, 994, 1004, 1045, 1065, 1086, 1103, 1255, 1320, 1339)
- Test: `test/agent-notify.test.ts`

**Interfaces:**
- Consumes: existing `notifyKeyboard` (unchanged), `NotifKeyboardTag` (unchanged)
- Produces: `notify(bot: Bot, chatId: string, msg: string, opts?: { keyboard?: InlineKeyboard }): Promise<void>` — always sends, swallows Telegram errors

- [ ] **Step 1: Update the notify test to the new signature**

In `test/agent-notify.test.ts`:
- Delete the entire `describe("allowed", ...)` block (lines 17-34).
- In `describe("notify", ...)`: change `notify(bot, "c1", "normal", "action", "msg")` → `notify(bot, "c1", "msg")` (two occurrences: tests at lines 40 and 58). Delete the "skips silently when gated out" test (lines 47-52). Rename the first test's `it` string to `"sends and passes MD parse mode"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/agent-notify.test.ts`
Expected: FAIL — `notify` still has 5 required params / `allowed` export still exists.

- [ ] **Step 3: Simplify notify.ts**

Replace `src/telegram/agent/notify.ts` content so the parts above the keyboard type become:

```ts
import { type Bot, InlineKeyboard } from "grammy";
import { MD } from "../utils.js";

export type NotifKeyboardTag =
	| "open"
	| "tp"
	| "sl"
	| "close"
	| "failed"
	| "error";
```

(delete `NotifTag`, `TAG_LEVELS`, `allowed`, and the `NotifLevel` import), keep `notifyKeyboard` verbatim, and change `notify` to:

```ts
export async function notify(
	bot: Bot,
	chatId: string,
	msg: string,
	opts?: { keyboard?: InlineKeyboard },
): Promise<void> {
	try {
		await bot.api.sendMessage(chatId, msg, {
			...MD,
			...(opts?.keyboard ? { reply_markup: opts.keyboard } : {}),
		});
	} catch {
		// fire-and-forget — agent logic never depends on notification success
	}
}
```

- [ ] **Step 4: Update engine.ts call sites**

In `src/telegram/agent/engine.ts`:

1. Import line 59: `import { allowed, notify, notifyKeyboard } from "./notify.js";` → `import { notify, notifyKeyboard } from "./notify.js";`
2. `liveStep` (lines 135-145): drop the `cfg: AgentCfg` parameter and the gate:

```ts
async function liveStep(
	bot: Bot,
	chatId: string,
	live: LiveMsg,
	msg: string,
): Promise<void> {
	await liveSend(bot, chatId, live, msg);
}
```

3. Line 968: replace
```ts
	if (allowed(cfg.notifLevel, "live")) {
		await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
	}
```
with
```ts
	await liveSend(bot, chatId, live, formatLive(cycle, liveLines));
```
4. Every `liveStep(bot, chatId, cfg, live, ...)` call (lines 977, 984, 994, 1004, 1045, 1065, 1086, 1103, 1255, 1320, 1339) → drop the `cfg` argument: `liveStep(bot, chatId, live, ...)`.
5. Every `notify(` call that passes `cfg.notifLevel,` and a string-literal tag: delete the two lines consisting of exactly `cfg.notifLevel,` and `"(action|error)",` (sites: 273, 343, 481, 530, 564, 738, 774, 910, 926, 1069, 1321, 1340 — tag `"error"` at 481/530/564/1069, `"action"` elsewhere).
6. Line 1366: `await notify(bot, chatId, cfg.notifLevel, "summary", summary);` → `await notify(bot, chatId, summary);`

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run test/agent-notify.test.ts` and `npm run typecheck`
Expected: notify tests PASS (3 tests: sends/passes MD, swallows errors; 4 keyboard tests unchanged); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/telegram/agent/notify.ts src/telegram/agent/engine.ts test/agent-notify.test.ts
git commit -m "refactor(agent): always send notifications, drop notif level gating"
```

---

### Task 2: Remove notifLevel from resolved config + format display

**Files:**
- Modify: `src/domain/config.ts:105-122`
- Modify: `src/services/Config.ts:133,159`
- Modify: `src/telegram/agent/format.ts:32,429`
- Test: `test/agent-config.test.ts:38-46`, `test/agent-format.test.ts:37,201,227,503`

**Interfaces:**
- Consumes: `NotifLevel` type (still exported from `src/domain/config.ts`)
- Produces: `ResolvedAgentConfig` WITHOUT `notifLevel`; `AgentConfig.notifLevel?: NotifLevel` marked `@deprecated`

- [ ] **Step 1: Update config test**

In `test/agent-config.test.ts`, delete the `it("defaults notifLevel to normal and honors override", ...)` test (lines 38-46).

- [ ] **Step 2: Update format tests**

In `test/agent-format.test.ts`:
- Delete line 37 (`notifLevel: "normal",`) from the `cfg` fixture.
- Test at line 201 (`describe("formatStatus stats")`): rename to `it("adds trade stats when provided", ...)`; delete the `{ ...cfg, notifLevel: "verbose" }` spread → pass `cfg` directly; delete `expect(out).toContain("verbose");`.
- Test at line 503: rename `it("renders budget, TP/SL and notif level", ...)` → `it("renders budget and TP/SL", ...)`; delete `expect(out).toContain("normal");`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run test/agent-config.test.ts test/agent-format.test.ts`
Expected: FAIL — `ResolvedAgentConfig` still requires `notifLevel`, so fixture type errors; `formatStatus`/`formatConfigQuick` still reference `cfg.notifLevel`.

- [ ] **Step 4: Domain + resolver**

In `src/domain/config.ts`, above `notifLevel?: NotifLevel;` (line 118) add:

```ts
	/** @deprecated Notifications are always sent; kept for config-file compatibility. */
```

In `src/services/Config.ts`:
- Delete `notifLevel: NotifLevel;` from `ResolvedAgentConfig` (line 133).
- Delete `notifLevel: a.notifLevel ?? "normal",` from the resolver (line 159).
- Remove `NotifLevel,` from the import block at line 9 (`NotifLevel` is only used for the removed field).

- [ ] **Step 5: Format display**

In `src/telegram/agent/format.ts`:
- Line 32: `` `TP ${escapeMarkdown(String(cfg.tpPct))}% \\| SL ${escapeMarkdown(String(cfg.slPct))}% \\| notif ${escapeMarkdown(cfg.notifLevel)}`, `` → `` `TP ${escapeMarkdown(String(cfg.tpPct))}% \\| SL ${escapeMarkdown(String(cfg.slPct))}%`, ``
- Line 429: delete the whole line `` `Notif level ${escapeMarkdown(cfg.notifLevel)}`, ``

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run test/agent-config.test.ts test/agent-format.test.ts` and `npm run typecheck`
Expected: PASS; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/domain/config.ts src/services/Config.ts src/telegram/agent/format.ts test/agent-config.test.ts test/agent-format.test.ts
git commit -m "feat(agent): remove notifLevel from resolved config, always-notify display"
```

---

### Task 3: Clean remaining test fixtures

**Files:**
- Test: `test/agent-guardrails.test.ts:34`, `test/agent-llm.test.ts:29`

**Interfaces:**
- Consumes: `ResolvedAgentConfig` from Task 2 (no `notifLevel` field)

- [ ] **Step 1: Delete fixture lines**

Delete `notifLevel: "normal",` from `test/agent-guardrails.test.ts` (line 34) and `test/agent-llm.test.ts` (line 29).

- [ ] **Step 2: Verify**

Run: `npx vitest run test/agent-guardrails.test.ts test/agent-llm.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/agent-guardrails.test.ts test/agent-llm.test.ts
git commit -m "test(agent): drop notifLevel from fixtures"
```

---

### Task 4: Remove config-editor menu item

**Files:**
- Modify: `src/telegram/handlers/config-editor.ts:265-270,533`

**Interfaces:**
- Consumes: nothing from earlier tasks; the `cfg:set` callback handler resolves entries by `key`, so deleting the entry disables the button too.

- [ ] **Step 1: Delete the editable entry and button**

- Delete the `agent.notifLevel` object (lines 265-270):

```ts
	{
		key: "agent.notifLevel",
		label: "DLMM Agent Notif Level",
		type: "enum" as const,
		values: ["verbose", "normal", "errors-only"],
	},
```

- Delete the button line `.text("✏️ Notif Level", "cfg:set:agent.notifLevel")` (line 533).

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: clean. (No test covers this array.)

- [ ] **Step 3: Commit**

```bash
git add src/telegram/handlers/config-editor.ts
git commit -m "feat(agent): remove notif level from config editor menu"
```

---

### Task 5: Update docs/ai-agent.md

**Files:**
- Modify: `docs/ai-agent.md:111,282,345`

- [ ] **Step 1: Edit doc sections**

- Line 111: `- Selalu terkirim — tidak terikat \`notifLevel\`.` → `- Selalu terkirim (semua notifikasi agent selalu terkirim).`
- Section `## Notifikasi (notify.ts)` (lines 280-289): replace the level paragraph and tag table with:

```markdown
Semua notifikasi selalu terkirim (live, action, summary, error).
```
- Line 345 (config table row): delete the `| \`notifLevel\` | \`"normal"\` | \`verbose\`/\`normal\`/\`errors-only\` |` row.

- [ ] **Step 2: Commit**

```bash
git add docs/ai-agent.md
git commit -m "docs: remove notif level references"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full gate**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 2: Confirm no leftovers**

Run: `npx rg -n "notifLevel|allowed\(" src test --glob "*.ts"`
Expected: only `src/domain/config.ts` (the `@deprecated` field + `NotifLevel` type) and the design doc remain.

- [ ] **Step 3: Commit any stragglers**

```bash
git status --short
git add -A && git commit -m "chore: final cleanup"
```
Only if `git status` shows uncommitted changes.
