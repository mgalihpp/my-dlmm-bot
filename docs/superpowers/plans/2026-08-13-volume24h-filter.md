# 24h Volume Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable server-side 24h-volume screening filters (`minVolume24h` / `maxVolume24h`) exposed via config file and the Telegram `/config` editor.

**Architecture:** The Discovery API already supports the `volume_24h` filter key (verified live). `buildDiscoveryFilter` appends `volume_24h>=N` / `volume_24h<=N` to the `filter_by` string when config fields are set. All consumers (CLI, bot, web, agent) share `ScreeningService.screen`, so a single change in `src/lib/screening.ts` propagates everywhere. Config editor wiring follows the existing `minVolume`/`maxVolume` pattern.

**Tech Stack:** TypeScript (strict, ESM, `.js` import extensions), Biome (tabs, double quotes), Vitest, Effect (no Effect.Schema involved — `PoolsConfig` is a plain interface).

## Global Constraints

- ESM-only — all imports use `.js` extensions
- Biome formatting: tab indent, double quotes, organize imports
- Tagged errors (`Data.TaggedError`), no thrown exceptions (not relevant here — no new error paths)
- Verify order after every task: `npm run check && npm run typecheck && npm test`
- Config keys are plain interface fields on `PoolsConfig` (JSON.parse + cast — no schema migration needed)
- Commit message style (from `git log`): `feat(screen): ...`, `docs(screen): ...`

---

### Task 1: Core filter — `PoolsConfig` fields + `buildDiscoveryFilter` + unit tests

**Files:**
- Modify: `src/domain/config.ts:25-26` (after `minVolume`/`maxVolume`)
- Modify: `src/lib/screening.ts:59-60` (after existing volume filter lines)
- Test: `test/screening.test.ts:73-82` (`buildDiscoveryFilter` describe block)

**Interfaces:**
- Consumes: existing `PoolsConfig` interface (`src/domain/config.ts`), existing `buildDiscoveryFilter` function (`src/lib/screening.ts:12`)
- Produces: `PoolsConfig.minVolume24h?: number`, `PoolsConfig.maxVolume24h?: number`, and filter strings `volume_24h>=<n>` / `volume_24h<=<n>` inside `buildDiscoveryFilter` output. Task 2 consumes these same config key names (`pools.minVolume24h` / `pools.maxVolume24h`).

- [ ] **Step 1: Write the failing test**

In `test/screening.test.ts`, extend the `buildDiscoveryFilter` describe block (after the existing "appends configured filters" test at lines 73–82):

```ts
	it("appends 24h volume filters when configured", () => {
		const f = buildDiscoveryFilter({
			minVolume24h: 500000,
			maxVolume24h: 2000000,
		});
		expect(f).toContain("volume_24h>=500000");
		expect(f).toContain("volume_24h<=2000000");
	});
	it("omits 24h volume filters when unset", () => {
		const f = buildDiscoveryFilter({ minVolume: 1000 });
		expect(f).toContain("volume>=1000");
		expect(f).not.toContain("volume_24h");
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/screening.test.ts`
Expected: FAIL — TS compile error `Object literal may only specify known properties` / `volume_24h` assertion fails (property doesn't exist on `PoolsConfig`).

- [ ] **Step 3: Add config fields**

In `src/domain/config.ts`, after line 26 (`maxVolume?: number;`):

```ts
	minVolume24h?: number;
	maxVolume24h?: number;
```

- [ ] **Step 4: Add filter emission**

In `src/lib/screening.ts`, after line 60 (`if (s.maxVolume != null) filters.push(\`volume<=\${s.maxVolume}\`);`):

```ts
	if (s.minVolume24h != null) filters.push(`volume_24h>=${s.minVolume24h}`);
	if (s.maxVolume24h != null) filters.push(`volume_24h<=${s.maxVolume24h}`);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/screening.test.ts`
Expected: PASS (all 8 tests green — 2 new + 6 existing).

- [ ] **Step 6: Verify full suite**

Run: `npm run check && npm run typecheck && npm test`
Expected: all pass (biome check, tsc --noEmit, vitest).

- [ ] **Step 7: Commit**

```bash
git add src/domain/config.ts src/lib/screening.ts test/screening.test.ts
git commit -m "feat(screen): add 24h volume filter (minVolume24h/maxVolume24h)"
```

---

### Task 2: Telegram `/config` editor wiring

**Files:**
- Modify: `src/telegram/handlers/config-editor.ts:71-72` (after `pools.maxVolume` EDITABLE_FIELDS entries)
- Modify: `src/telegram/handlers/config-editor.ts:590-591` (keyboard page 3, after Min/Max Vol buttons)
- Modify: `src/telegram/handlers/config-editor.ts:669-670` (page3 Set in `pageForKey`)

**Interfaces:**
- Consumes: config key names from Task 1 (`pools.minVolume24h`, `pools.maxVolume24h`). No new functions — the editor iterates `EDITABLE_FIELDS` for the `/config` text view (config-editor.ts:425-434), so text view is covered automatically.
- Produces: two new editable fields on keyboard page 3 (TVL/Vol) and in the `/config` text listing.

- [ ] **Step 1: Add EDITABLE_FIELDS entries**

In `src/telegram/handlers/config-editor.ts`, after line 72 (`{ key: "pools.maxVolume", label: "Max Volume", type: "number" as const },`):

```ts
	{
		key: "pools.minVolume24h",
		label: "Min Vol 24h",
		type: "number" as const,
	},
	{
		key: "pools.maxVolume24h",
		label: "Max Vol 24h",
		type: "number" as const,
	},
```

- [ ] **Step 2: Add keyboard buttons on page 3**

In `buildConfigKeyboard`, in the `page === 3` block (lines 585–601), after the Min/Max Vol row (line 591):

```ts
			.row()
			.text("✏️ Min Vol 24h", "cfg:set:pools.minVolume24h")
			.text("✏️ Max Vol 24h", "cfg:set:pools.maxVolume24h")
```

- [ ] **Step 3: Register keys in pageForKey**

In `pageForKey` (line 666–675), add to the `page3` Set after line 670 (`"pools.maxVolume",`):

```ts
		"pools.minVolume24h",
		"pools.maxVolume24h",
	```

- [ ] **Step 4: Verify**

Run: `npm run check && npm run typecheck && npm test`
Expected: all pass. (No unit tests exist for the config editor — manual verify later via `/config` in bot.)

- [ ] **Step 5: Commit**

```bash
git add src/telegram/handlers/config-editor.ts
git commit -m "feat(bot): expose 24h volume filters in /config editor"
```

---

### Task 3: Example config + README docs

**Files:**
- Modify: `vexis.config.example.json:81-82` (after `"maxVolume": null,`)
- Modify: `README.md:155` (after the Volume row in Screening Filters table)

**Interfaces:**
- Consumes: config key names from Task 1 (`minVolume24h` / `maxVolume24h`)

- [ ] **Step 1: Update example config**

In `vexis.config.example.json`, after line 82 (`"maxVolume": null,`):

```json
		"minVolume24h": 500000,
		"maxVolume24h": null,
```

- [ ] **Step 2: Update README**

In `README.md`, after line 155 (`| Volume | ... |`), insert:

```md
| 24h Volume | `minVolume24h` / `maxVolume24h` | Min/max 24h trading volume (server-side, independent of screening timeframe) |
```

- [ ] **Step 3: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('vexis.config.example.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Verify + commit**

Run: `npm run check && npm run typecheck && npm test`
Expected: all pass.

```bash
git add vexis.config.example.json README.md
git commit -m "docs(screen): document 24h volume filter in example config and README"
```

---

## Self-Review Notes

- **Spec coverage:** config fields (spec §1) → Task 1; buildDiscoveryFilter (spec §2) → Task 1; config-editor EDITABLE_FIELDS + keyboard page 3 + pageForKey (spec §3) → Task 2; example config (spec §4) → Task 3; README (spec §5) → Task 3; tests (spec §6) → Task 1. All spec items covered.
- **Data flow:** no changes to `ScreeningService`, `MeteoraApi`, or `finalizeScreen` — server-side filter means `filtered: 0` remains correct.
- **Type consistency:** `minVolume24h` / `maxVolume24h` used identically across all tasks; config keys `pools.minVolume24h` / `pools.maxVolume24h` match the existing dotted-path convention.
