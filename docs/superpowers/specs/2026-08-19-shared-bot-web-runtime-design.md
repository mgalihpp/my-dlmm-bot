# Shared Bot and Web Runtime

## Problem

The web close action and Telegram agent currently run in separate Node
processes. The web action writes a manual-close cooldown to
`.vexis-agent.json`, while the Telegram agent keeps its own `AgentState` in
memory. A later agent save can overwrite the web-written cooldown, so the
cooldown is not reliably visible to the running agent.

## Goals

- Run the web server, Telegram bot, and runtime agent in one Node process.
- Create one `RuntimeAgent` instance per process.
- Make web manual close update the same in-memory state used by agent cycles.
- Preserve the existing bot-only entrypoint for development and fallback use.
- Make startup idempotent under React Router server module loading and dev HMR.
- Keep the existing `.vexis-agent.json` persistence format.

## Non-goals

- No database, Redis, IPC, or internal HTTP protocol.
- No redesign of agent guardrails or cooldown matching.
- No change to Telegram commands or web close authorization.
- No change to the on-chain close transaction itself.

## Architecture

### Shared runtime host

Add a server-side runtime host module that owns the bot startup promise and the
created `RuntimeAgent`. Its public operations are:

- `ensureBotRuntime()` starts the bot setup once and returns the shared agent,
  or `null` when bot configuration is unavailable.
- `getBotRuntime()` returns the already-created agent without starting it.
- `stopBotRuntime()` stops the agent and bot resources when explicitly needed.

The host stores its registry on `globalThis` under a project-specific symbol or
key. This prevents duplicate bot polling when development reloads the module.
The registry also stores the startup promise so concurrent web requests cannot
start two bots.

### Bot bootstrap

Extract the current setup in `src/telegram/bot.ts` into a reusable
`startBot()` function. It will continue to:

- load bot token and configured chat ID;
- install authorization middleware and all handlers;
- create alerts and the single `RuntimeAgent`;
- register TP/SL and agent commands;
- apply the configured agent enabled transition;
- register Telegram commands and start polling.

The existing CLI-style bot entrypoint will call this function. The web runtime
host will call the same function and retain its returned runtime handle.

### Web integration

The React Router server entry will trigger `ensureBotRuntime()` once when the
server module is loaded. The close server function will also await
`ensureBotRuntime()` before recording the manual cooldown, so a request is safe
even if module initialization has not completed yet.

The close flow remains ordered as follows:

1. Validate pool and position addresses.
2. Execute `Zap.closeAndZapOut`.
3. Require a transaction signature.
4. Call `recordManualClose` with the shared runtime getter and repository state
   path.
5. Return the signature to the web client.

The cooldown mutation therefore updates `rt.state.cooldowns` and persists the
same state object that the next agent cycle reads.

## Error Handling

- Missing bot configuration must not prevent the web dashboard from starting.
- Bot startup failures must be logged and represented as an unavailable
  runtime; they must not create repeated polling attempts per request.
- A cooldown-recording failure remains non-fatal to an already-successful close
  transaction, matching the current `recordManualClose` contract.
- Existing auth checks and input validation remain unchanged.

## Testing

Add focused tests for:

- concurrent `ensureBotRuntime()` calls resolving to one startup result;
- runtime host reuse returning the same `RuntimeAgent` instance;
- web close recording a cooldown through the shared runtime state;
- bot-only startup continuing to use the extracted bootstrap.

Run the repository checks after implementation:

```bash
npm run check
npm run typecheck
npm test
```

## Deployment

Production should use the web server entrypoint as the primary process because
it hosts both the dashboard and bot polling. `npm run bot` remains available
for bot-only development, but running it alongside a web process would create
two independent runtimes and is not a supported combined deployment mode.
