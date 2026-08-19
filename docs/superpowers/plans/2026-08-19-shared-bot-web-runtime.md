# Shared Bot and Web Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the Telegram bot, web server, and `RuntimeAgent` in one Node process so web manual closes update the live agent cooldown state.

**Architecture:** Extract the current bot setup into a reusable bootstrap that returns a bot/runtime handle. Add a process-wide host stored on `globalThis` with an idempotent startup promise. Start that host from the React Router server entry and use its `RuntimeAgent` in the web close flow.

**Tech Stack:** TypeScript ESM, Effect, grammY, React Router 8 SSR, Vitest, Biome.

## Global Constraints

- Keep the existing `.vexis-agent.json` persistence format.
- Do not add database, Redis, IPC, internal HTTP, or new dependencies.
- Preserve Telegram commands, web authorization, close validation, and on-chain transaction behavior.
- Missing bot configuration must not prevent the web dashboard from starting.
- A cooldown-recording failure must remain non-fatal after a successful close transaction.
- Use `.js` extensions for local TypeScript imports.

---

### Task 1: Define the reusable bot runtime handle

**Files:**
- Modify: `src/telegram/bot.ts`
- Create: `src/telegram/bot-runtime.ts`
- Test: `src/telegram/bot-runtime.test.ts`

**Interfaces:**
- Produces `BotRuntime` with `bot: Bot`, `agent: RuntimeAgent | null`, and `stop(): Promise<void>`.
- Produces `startBot(): Promise<BotRuntime | null>`.
- Existing `npm run bot` continues to use the extracted bootstrap.

- [ ] **Step 1: Write the failing runtime-handle test**

Create a focused test for a small `createBotRuntime`/`stop` contract rather than starting Telegram polling. The test should assert that stopping an agent calls its `stop` method and that the handle exposes the same agent instance:

```ts
it("exposes the agent and stops it", async () => {

	const stop = vi.fn();
	const agent = { stop } as unknown as RuntimeAgent;
	const handle = createBotRuntime(fakeBot, agent);

	expect(handle.agent).toBe(agent);
	await handle.stop();
	expect(stop).toHaveBeenCalledOnce();
});
```

Export only the testable handle constructor; do not add a second agent abstraction.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/telegram/bot-runtime.test.ts`

Expected: FAIL because `bot-runtime.ts` and its constructor do not exist yet.

- [ ] **Step 3: Implement the minimal handle**

Move the `BotRuntime` type and `createBotRuntime` implementation into `src/telegram/bot-runtime.ts`. `stop()` must stop the agent when present and stop the grammY bot if polling was started. Keep the stop operation idempotent so HMR cleanup cannot throw on a second call.

Extract the current `main()` body in `bot.ts` into `startBot()`. Preserve handler registration order and all existing callback closures. Replace the final top-level call with a thin CLI entrypoint:

```ts
startBot().catch((e) => {
	console.error("Fatal:", errorMessage(e));
	process.exit(1);
});
```

The reusable function must return `null` when required bot configuration is unavailable, and must return before blocking on `bot.start()` by launching polling in the background.

- [ ] **Step 4: Run the focused test and typecheck**

Run: `npx vitest run src/telegram/bot-runtime.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS with the extracted bootstrap and unchanged bot behavior.

### Task 2: Add the idempotent shared runtime host

**Files:**
- Create: `src/runtime-host.ts`
- Test: `src/runtime-host.test.ts`

**Interfaces:**
- Consumes `startBot(): Promise<BotRuntime | null>` from Task 1.
- Produces `ensureBotRuntime(): Promise<RuntimeAgent | null>`, `getBotRuntime(): RuntimeAgent | null`, and `stopBotRuntime(): Promise<void>`.

- [ ] **Step 1: Write failing host tests**

Test the host with an injected bootstrap so the test never needs a Telegram token or network:

```ts
it("shares one startup result across concurrent callers", async () => {
	const agent = fakeAgent();
	const start = vi.fn().mockResolvedValue(fakeHandle(agent));
	const host = createRuntimeHost(start);

	const [a, b] = await Promise.all([host.ensure(), host.ensure()]);

	expect(a).toBe(agent);
	expect(b).toBe(agent);
	expect(start).toHaveBeenCalledOnce();
});

it("returns the same agent after startup", async () => {
	const agent = fakeAgent();
	const host = createRuntimeHost(vi.fn().mockResolvedValue(fakeHandle(agent)));

	await host.ensure();
	expect(host.get()).toBe(agent);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npx vitest run src/runtime-host.test.ts`

Expected: FAIL because the host factory and public functions do not exist.

- [ ] **Step 3: Implement host state and global registry**

Implement a small `RuntimeHost` factory with a `startPromise`, `handle`, and `ensure/get/stop` methods. Wrap the production host in a `globalThis` registry keyed by a fixed project-specific string so module re-evaluation reuses the same host. On a rejected startup, clear the promise once and retain an unavailable result so every request does not retry polling.

`stopBotRuntime()` must call the handle stop function, clear the registry handle, and leave the host reusable for an explicit later restart.

- [ ] **Step 4: Run host tests and typecheck**

Run: `npx vitest run src/runtime-host.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

### Task 3: Start the host from the web server and use it for close cooldowns

**Files:**
- Modify: `src/web-react/app/entry.server.tsx`
- Modify: `src/web-react/app/lib/server/close.server.ts`
- Test: `src/web-react/app/lib/server/close.server.test.ts`

**Interfaces:**
- Consumes `ensureBotRuntime()` from `src/runtime-host.ts`.
- Keeps `closePosition(pool: string, position: string): Promise<CloseResult>` unchanged for route callers.

- [ ] **Step 1: Write the failing close integration test**

Mock `Zap`, `AppLayer`, `ensureBotRuntime`, and `recordManualClose`. Assert that a successful close passes the shared runtime getter and the repository state path to `recordManualClose`, while a missing signature remains an error:

```ts
it("records manual cooldown through the shared runtime", async () => {
	const agent = fakeAgent();
	ensureBotRuntimeMock.mockResolvedValue(agent);
	closeAndZapOutMock.mockResolvedValue({ closeSig: "close-sig" });

	const result = await closePosition("pool", "position");

	expect(result).toEqual({ ok: true, sig: "close-sig" });
	expect(recordManualCloseMock).toHaveBeenCalledWith(
		expect.any(Function),
		"pool",
		"",
		null,
		expect.stringContaining(".vexis-agent.json"),
	);
	expect(recordManualCloseMock.mock.calls[0][0]()).toBe(agent);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/web-react/app/lib/server/close.server.test.ts`

Expected: FAIL because close currently passes `() => null` and does not initialize the shared host.

- [ ] **Step 3: Integrate the shared host**

In `close.server.ts`, await `ensureBotRuntime()` after the transaction signature is validated, then pass `() => getBotRuntime()` or an equivalent closure that returns the initialized agent. Keep `recordManualClose` non-fatal and keep the existing `repoRoot()` state-file path.

In `entry.server.tsx`, trigger `void ensureBotRuntime()` at module scope after server-only imports. Do not await it during request rendering; this keeps dashboard startup independent from Telegram availability. The close handler remains safe by awaiting the host itself.

- [ ] **Step 4: Run the focused test and web typecheck**

Run: `npx vitest run src/web-react/app/lib/server/close.server.test.ts`

Expected: PASS.

Run: `npm run typecheck --prefix src/web-react`

Expected: PASS.

### Task 4: Verify deployment behavior and regression safety

**Files:**
- Modify: `package.json` only if the combined web entrypoint needs an explicit script adjustment.
- Modify: `docs/superpowers/specs/2026-08-19-shared-bot-web-runtime-design.md` only if implementation details require a documented correction.

**Interfaces:**
- Uses the production host from Tasks 1-3.
- Does not change public Telegram commands or close route payloads.

- [ ] **Step 1: Build both TypeScript targets**

Run: `npm run build`

Expected: PASS.

Run: `npm run web:build`

Expected: PASS.

- [ ] **Step 2: Run the complete checks**

Run: `npm run check`

Expected: PASS with only intended formatting changes.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS without network, wallet, Telegram, or Solana RPC access.

- [ ] **Step 3: Verify the single-process contract**

Start the web server using `npm run web:start` with valid local configuration and confirm logs show one bot startup. Open the dashboard, perform a manual close in a test environment, then inspect `.vexis-agent.json` and the agent page. Confirm the cooldown appears without restarting the bot. Do not run `npm run bot` concurrently during this check.

- [ ] **Step 4: Review the final diff**

Run: `rtk git diff -- docs/superpowers/specs/2026-08-19-shared-bot-web-runtime-design.md docs/superpowers/plans/2026-08-19-shared-bot-web-runtime.md src/telegram/bot.ts src/telegram/bot-runtime.ts src/runtime-host.ts src/web-react/app/entry.server.tsx src/web-react/app/lib/server/close.server.ts`

Confirm no secrets, private keys, generated files, or unrelated refactors were added.
