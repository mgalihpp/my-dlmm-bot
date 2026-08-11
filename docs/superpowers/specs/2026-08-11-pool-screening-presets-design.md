# Pool Screening Presets — Design

Date: 2026-08-11
Status: Approved

## Goal

Add named pool-screening presets to the config so the active screening profile can
be switched from Telegram without hand-editing `vexis.config.json`.

## Config shape

Extend `PoolsConfig` (in `src/domain/config.ts`) with two new optional fields:

```ts
export interface PoolsConfig {
  // ...existing fields unchanged...
  activePreset?: string;
  presets?: Record<string, PoolsConfig>;
}
```

Top-level `pools` fields remain as fallback defaults for any key not set in the
active preset (backward compatible).

Example:

```jsonc
"pools": {
  "activePreset": "vexis",
  "presets": {
    "vexis": {
      "pageSize": 50,
      "timeframe": "4h",
      "category": "top",
      "displayLimit": 20,
      "solPairOnly": true,
      "minMcap": 100000,
      "maxMcap": 1000000,
      "minHolders": 500,
      "minOrganic": 60,
      "minQuoteOrganic": 60,
      "minTvl": 2000,
      "minFee": 10,
      "minBinStep": 100,
      "maxBinStep": 200
    }
  }
}
```

## Resolution logic

New pure function `resolvePoolsPresetFrom(config: VexisConfig): PoolsConfig` in
`src/services/Config.ts` (mirrors existing `resolveCreatePresetFrom`):

1. `pools.activePreset` not set, or name not found in `pools.presets` →
   return `pools` top-level as-is (current behavior).
2. Active preset found → merge preset over top-level (preset values win,
   unspecified keys fall back to top-level values, then to code defaults).

`src/services/Screening.ts` (`screen`, line ~42) replaces `cfg.pools ?? {}` with
`resolvePoolsPresetFrom(cfg)` so both CLI `pool list` and Telegram `/pools` pick up
the active preset automatically.

## Telegram surface

New `src/telegram/handlers/preset.ts`:

- Command `/preset` — shows the active preset name plus an inline keyboard listing
  every preset from `pools.presets` (callback `preset:set:<name>`).
- Callback `preset:set:<name>` — writes `pools.activePreset` via `AppConfig.update`
  (persists to `vexis.config.json`), confirms with the new active preset.
- Callback shows current active preset with a marker (e.g. "✓").

Wire-up:

- `src/telegram/bot.ts`: register `preset` command (import `registerPreset`).
- `src/telegram/handlers/config-editor.ts`: add a "🎚 Preset" button to the menu
  that opens the same preset picker (reuse `preset:set:` callbacks).

Follow existing patterns: `src/telegram/handlers/pool.ts` (command + callback
style), `src/telegram/fx.ts` for `AppConfig.update` access, error handling via
`replyError`/`escapeMarkdown`, MarkdownV2 escaping (`MD`).

## Default preset

Ship the single preset `vexis` with the user's current production screening
values (see config example above). Both `vexis.config.example.json` and the
server's `vexis.config.json` get it. `activePreset: "vexis"` set as default.

## Testing

Unit tests in `test/` for `resolvePoolsPresetFrom`:

1. No `activePreset` → returns top-level `pools`.
2. `activePreset` valid → preset merged over top-level (preset wins, fallback works).
3. `activePreset` references missing preset → falls back to top-level.
4. No `pools` section at all → empty object (no crash).

Telegram handlers follow existing pattern (not unit-tested).

## Deploy

1. `npm run build` locally.
2. Sync `dist/` and changed `src/` to server `~/my-dlmm-bot` via `pscp`.
3. Update server `vexis.config.json` with `activePreset` + `presets.vexis`
   (preserve existing values — wallet, keys, agent, etc.).
4. `pm2 restart bot`, verify logs and `Bot started` line.
