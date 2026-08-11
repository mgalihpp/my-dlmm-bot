# AGENTS.md

## Project

Telegram bot + CLI for managing Meteora DLMM liquidity positions on Solana. Built with Effect (functional effect system), grammY (Telegram), @effect/cli (CLI).

## Commands

```bash
npm run typecheck   # tsc --noEmit
npm run check       # biome check (lint + organize imports)
npm run format      # biome format --write
npm test            # vitest run
npm run dev         # CLI via tsx
npm run bot         # Bot via tsx
npm run build       # tsc → dist/
```

Verify order: `npm run check && npm run typecheck && npm test`

## Key Conventions

- **ESM-only** — all imports use `.js` extensions (e.g. `import { x } from "./foo.js"`)
- **Formatter** — Biome: tab indent, double quotes, organize imports
- **TypeScript** — strict, no unused locals/params. Tests excluded from tsc (`test/` and `src/**/*.test.ts`)
- **Error handling** — tagged errors in `src/errors.ts` (`Data.TaggedError`), not thrown exceptions
- **Config** — JSON file + env var overrides: `VEXIS_CONFIG`, `VEXIS_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Note: `rpcUrl` is config-file-only (no env var). Config search: `$VEXIS_CONFIG` → `./vexis.config.json` → `~/.vexis/config.json`
- **Runtime state** — persisted to gitignored JSON files: `.vexis-alerts.json`, `.vexis-watchlist.json`, `.vexis-tpsl.json`

## Testing

- Vitest with `test/**/*.test.ts` and `src/**/*.test.ts` patterns
- Pure logic tests (math, screening, format, session-store, meteora-api decoding)
- No external services required for tests — all are unit tests with inline fixtures

## Gotchas

- `postinstall` runs `scripts/patch-cjs.cjs` — patches `@coral-xyz/anchor` and `@meteora-ag/*` CJS packages for ESM compat (strips `exports` field). If you add a CJS-only dependency in the same vein, add it to this script
- `vexis.config.json` is gitignored (contains secrets). Example at `vexis.config.example.json` is tracked
- Domain types use `Effect.Schema` — API responses decoded at runtime, not trusted
- There is no `RPC_URL` env var — `rpcUrl` comes from the config file only (README says so too)
