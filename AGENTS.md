# Agent Context

I'm Galih. You're my coding agent for this project.

Your job is to help me maintain, debug, extend, refactor, and improve this codebase while respecting the existing architecture and conventions.

## How You Should Work

- Inspect the existing code before making changes.
- Reuse existing patterns, utilities, types, services, and Effect layers whenever possible.
- Do not introduce a new abstraction if an existing one already solves the problem.
- Keep changes focused. Don't refactor unrelated code just because you can.
- Prefer small, composable functions over large functions.
- Preserve the existing architecture unless there is a strong technical reason to change it.
- Before modifying behavior, understand how the current implementation works.
- When fixing a bug, identify the root cause instead of patching symptoms.
- Do not silently change public behavior, CLI arguments, config formats, persisted state formats, or Telegram commands.
- If a change requires a migration or breaking change, explicitly call it out.
- Do not add dependencies unless they are genuinely necessary.
- Prefer existing dependencies and platform APIs where practical.
- Never hardcode secrets, private keys, bot tokens, RPC credentials, or wallet credentials.
- Never modify gitignored secret/config files unless explicitly requested.

## Effect

This project uses Effect heavily. Follow the existing Effect patterns.

- Prefer `Effect` over throwing exceptions.
- Use tagged errors from `src/errors.ts`.
- Keep errors typed and composable.
- Use Effect's dependency injection / Layers where the project already does so.
- Don't mix Promise-based control flow into Effect code unnecessarily.
- Don't convert existing Effect code to imperative async/await unless there is a good reason.
- Preserve error types across service boundaries.
- Decode external data with `Effect.Schema` before using it.
- Treat API, RPC, Telegram, and blockchain responses as untrusted input.

## Solana / Meteora

This project manages Meteora DLMM liquidity positions on Solana.

Be careful with anything involving:

- wallet/private keys
- transactions
- token amounts
- decimals
- lamports
- public keys
- position IDs
- bin IDs
- liquidity
- fees
- PnL
- slippage
- transaction simulation
- RPC calls
- Meteora API responses

Never assume a value is valid just because its TypeScript type says so.

For financial or on-chain operations:

1. Validate inputs.
2. Decode/validate external data.
3. Avoid accidental transactions.
4. Prefer simulation/dry-run when available.
5. Make destructive or irreversible behavior explicit.
6. Never invent blockchain/API behavior when the implementation or documentation can be inspected.

## Telegram Bot

The Telegram bot uses grammY.

When modifying bot behavior:

- Follow the existing command and handler structure.
- Keep Telegram-specific logic separate from domain logic where possible.
- Reuse existing formatting utilities.
- Preserve existing commands and callback behavior.
- Validate user/chat authorization before executing sensitive operations.
- Do not expose private keys, secrets, or sensitive wallet information in Telegram messages.
- Keep Telegram responses concise and useful.

## Web UI (React)

The dashboard lives in `src/web-react/` — a standalone React app using React Router 8, Tailwind CSS 4, and shadcn/ui components.

When modifying the web UI:

- Follow existing component patterns and shadcn conventions.
- Use Tailwind CSS utility classes; avoid custom CSS unless necessary.
- Keep the dashboard read-only for data, and never expose private keys.
- The dashboard may expose authenticated on-chain actions (e.g. closing a
  position). Such actions run server-side only; the client sends only the
  target addresses and never keys.
- Reuse existing components from `src/web-react/app/components/ui/`.
- Data fetching uses React Router loaders; keep server-side logic in loaders.
- Format with Prettier (`npm run format` in `src/web-react/`).
- Typecheck with `npm run typecheck` in `src/web-react/`.

## CLI

The CLI uses `@effect/cli`.

When adding or modifying commands:

- Follow existing command structure and naming conventions.
- Reuse existing services and domain logic.
- Keep CLI parsing separate from business logic.
- Provide useful validation errors.
- Preserve existing command compatibility unless a breaking change is intentional.

## Configuration

Configuration is loaded from:

1. `$VEXIS_CONFIG`
2. `./vexis.config.json`
3. `~/.vexis/config.json`

Environment overrides:

- `VEXIS_CONFIG`
- `VEXIS_PRIVATE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Important:

- `rpcUrl` is config-file-only.
- There is NO `RPC_URL` environment variable.
- Do not add one unless explicitly requested.
- `vexis.config.json` is gitignored because it can contain secrets.
- Use `vexis.config.example.json` when documenting configuration.

## Runtime State

Runtime state is persisted in gitignored JSON files:

- `.vexis-alerts.json`
- `.vexis-watchlist.json`
- `.vexis-tpsl.json`

Be careful when changing their structure.

If the schema needs to change:

- maintain backward compatibility where practical
- handle missing/old fields safely
- add tests for old state formats
- don't silently destroy existing state

## Code Quality

The project uses:

- TypeScript
- Effect
- grammY
- `@effect/cli`
- Vitest
- Biome
- ESM

Follow these rules:

- ESM-only.
- Use `.js` extensions in local imports.
- TypeScript strict mode.
- No unused locals or parameters.
- Biome formatting and import organization.
- Prefer explicit, readable types.
- Avoid `any` unless there is a compelling reason.
- Don't bypass the type system just to make the compiler happy.
- Don't use `as any` as a shortcut for fixing incorrect types.

## Testing

Tests are unit-focused and must not require external services.

When changing logic:

- Add or update tests when appropriate.
- Prefer pure logic tests.
- Use inline fixtures.
- Don't make tests depend on:
  - live Solana RPC
  - Telegram
  - Meteora APIs
  - network access
  - real wallets
  - real transactions

If external behavior needs testing, mock the boundary.

## Verification

After making changes, run:

```bash
npm run check
npm run typecheck
npm test
