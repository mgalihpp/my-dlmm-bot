# Settings Page (React Web) — Design

Date: 2026-08-16

## Purpose

Add a real `/settings` page to the React dashboard (`src/web-react/`) replacing the placeholder "Settings" nav item. The page lets the user view and edit configuration (same fields the Telegram `/config` editor exposes, plus agent runtime controls), with hot-reload via the existing config file watcher in the bot process.

## Decisions

- **Editable + hot-reload.** Web writes to `vexis.config.json` (the same file the bot already watches, debounced in `src/services/Config.ts:202`). All non-`agent.enabled` settings hot-reload automatically because the agent engine reads `getConfig()` every cycle. `agent.enabled` transitions are detected by a new subscription in the bot process → `rt.start()`/`rt.stop()`.
- **Secret fields hidden completely.** `privateKey`, `telegramBotToken`, `telegramChatId`, `web.password`, `agent.llm.apiKey` are stripped from the server payload and never rendered. Edits to other fields preserve secrets because the server reads the full file, patches only editable keys, and writes back.
- **Reuse `loadConfigSync`** from `src/services/Config.js` (pure, no Effect layer needed) and `loadState` from `@vexis/telegram/agent/state.js`.
- **Validation with zod** (already a web-react dependency): finite numbers, bounded enums, list fields as arrays.
- **No new dependencies.**
- Reset semantics: empty/null field = "default" (same as Telegram `cfg:reset`).

## Architecture

```
src/web-react/
└── app/
    ├── lib/server/settings.server.ts   # NEW — load config + agent state, payload builder, patch/save logic
    ├── routes/settings.tsx             # NEW — /settings, loader (auth + payload) + action (save / agent toggle)
    └── components/settings/            # NEW
        ├── settings-page.tsx           # page composition: agent status card + section forms
        ├── agent-status-card.tsx       # running/stopped badge + Start/Stop button
        ├── general-form.tsx            # wallet, rpcUrl, dev, TP/SL, alertInterval, pageSize
        ├── agent-form.tsx              # agent params, risks, darwin, llm
        ├── create-form.tsx             # strategy, mode, range, amountPresets, slippage, autoSwap
        ├── pools-form.tsx              # all screening filters, grouped in sub-tabs
        └── field.tsx                   # input for number/string/boolean/enum/list + reset-to-default
```

Sidebar: change `Settings` url from `"#"` to `"/settings"` in `app-sidebar.tsx`.

### Data flow

1. `loader(request)`: auth check (existing pattern), call `fetchSettings()`.
2. `fetchSettings()` reads config via `loadConfigSync()` (repo-root path — `env.server.ts` already sets `VEXIS_CONFIG`), agent state via `loadState()` from `.vexis-agent.json`, strips secrets, builds `SettingsPayload`.
3. `action(request)`: form POST with a JSON body `{ path: [...], value: unknown }` per field (or `{ path: [...], reset: true }`). Server reads full config, patches only the editable field (validated by zod), writes back with `writeFileSync`. Returns updated payload. Client re-renders from the returned payload.
4. **Agent Start/Stop**: `action` with `{ op: "setAgentEnabled", enabled: boolean }` patches `agent.enabled`. The bot process's new subscription detects the transition and calls `rt.start()` / `rt.stop()`.

### SettingsPayload

```ts
{
  ok: boolean;
  error?: string;
  configPath: string | null;
  agent: { enabled: boolean; running: boolean; lastCycleAt: string | null };
  values: EditableSettings;   // editable fields only, secrets removed
}
```

`EditableSettings` mirrors `VexisConfig` but excludes: `privateKey`, `telegramBotToken`, `telegramChatId`, `web.password`, `agent.llm.apiKey`.

### Editable fields

- **General:** `wallet`, `rpcUrl`, `dev`, `stopLossPct`, `takeProfitPct`, `alertInterval`, `pageSize`
- **Agent:** `agent.enabled`, `intervalMinutes`, `maxCandidates`, `maxSolPerPosition`, `maxTotalSol`, `maxOpenPositions`, `txCooldownMs`, `poolCooldownMs`, `tpPct`, `slPct`; `risks.*` (enabled, minTokenFeesSol, maxBundlePct, maxBotHoldersPct, maxTop10Pct, minFromAthPct, blockWash, blockRugpull, blockDexScreenerPaid, blockDevSoldAll); `darwin.*` (enabled, windowDays, recalcEvery, boostFactor, decayFactor, weightFloor, weightCeiling, minSamples); `llm.baseUrl`, `llm.model`, `llm.timeoutMs`
- **Create:** `strategy` (enum: spot/bidask/curve), `mode` (enum: two-sided/single-x/single-y), `range.type` (enum: default/bin/pct), `range.minBin`, `range.maxBin`, `range.minPct`, `range.maxPct`, `amountPresets` (number list), `xAmount`, `yAmount`, `autoSwap` (boolean), `slippageBps`
- **Pools:** `pageSize`, `timeframe`, `category`, `baseTokenHasHighSupplyConcentration`, `baseTokenHasHighSingleOwnership`, all `min*`/`max*` filters, `blockedLaunchpads` (string list), `solPairOnly`, `priceTrend`, `displayLimit`

## Agent runtime transition detection

Extend `AppConfigService` in `src/services/Config.ts` with `onChange(cb: (prev, next) => void)`. Invoked from both mutation paths: `update()` and the file-watcher reload. In `bot.ts`, after `rtAgent` is created:

```ts
runtime.runPromise(Effect.flatMap(AppConfig, c => c.onChange((prev, next) => {
  if (prev.agent?.enabled !== next.agent?.enabled) {
    next.agent?.enabled ? rtAgent.start() : rtAgent.stop();
  }
})));
```

Remove the explicit `syncAgentRuntime` calls in `config-editor.ts` (lines 804, 839, 932) so the transition is handled once by the subscription. Telegram behavior is unchanged.

## Validation

zod schemas per field type. On invalid input the action returns `ok: false` with a message; the client keeps the current values and shows the error (toast or inline).

## Error handling

- `ok: false` → error card with retry hint, same pattern as portfolio/agent pages.
- No config file / parse error → error message + `configPath: null`.
- Missing `.vexis-agent.json` → `loadState` already returns defaults; treated as stopped.

## Testing

`test/web-react-settings.test.ts` — pure logic, inline fixtures, no network:

- Payload builder: secrets stripped, editable fields present.
- Patch logic: applying a patch preserves secrets; `null`/reset removes a field; invalid field values rejected.
- Transition logic: `prev.agent.enabled !== next.agent.enabled` maps to start/stop decisions (fixture-driven helper if extracted).

No live RPC / Telegram / Meteora / wallet access in tests.

## Verification

- `npm run check` (biome) and `npm run typecheck` in `src/web-react`.
- Root `npm test` must pass.
- Manual: run web (`npm run dev` in `src/web-react`) + bot (`npm run bot`), open `/settings`, edit a value, confirm the bot log shows the hot-reload; toggle Start/Stop and confirm agent state changes.

## Out of scope

- Editing secrets from the web (hidden by design).
- "Run cycle now" / live agent status streaming — future iteration.
- Migrating/removing legacy `src/web/` pages.