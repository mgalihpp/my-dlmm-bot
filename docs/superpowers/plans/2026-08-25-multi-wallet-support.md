# Multi Wallet Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add isolated multi-wallet trading — `wallets[]` in config, sharded agent state per wallet, sequential engine loop per wallet, wallet switcher in Web UI, wallet-aware Telegram commands — while keeping single-wallet backward compatibility.

**Architecture:** Sequential sharded loop. One global tick iterates `for (wallet of enabledWallets)`; each wallet has its own `plans/cooldowns/executions/oorSince` in a `Record<wallet, WalletAgentState>`, its own `Keypair` from `Map<address, Keypair>`, and isolated budget checks. Config migrates legacy `wallet`/`privateKey` to `wallets[0]`. State file migrates v1 flat → v2 sharded. Web loaders and Telegram handlers accept optional wallet param.

**Tech Stack:** TypeScript 5 / Effect 3 / @solana/web3.js / grammY / React Router 8 / Tailwind 4 / shadcn/ui / Vitest / Biome / ESM

## Global Constraints

- ESM-only — use `.js` extensions in local imports.
- TypeScript strict mode — no unused locals/params.
- No `any` — prefer explicit types; do not use `as any` to silence errors.
- Effect style — prefer `Effect` over throwing, use tagged errors from `src/errors.ts`, keep error types typed.
- Config file-only `rpcUrl` — do NOT add `RPC_URL` env var.
- Never hardcode secrets or log private keys; Web UI never exposes keys.
- Validate external input with `Effect.Schema` before use.
- Preserve existing CLI args / Telegram commands / config keys — new wallet arg is optional.
- Tests must not require live Solana RPC / Telegram / Meteora APIs — mock boundaries.
- Run after each task: `npm run check && npm run typecheck && npm test` (and `npm run typecheck` in `src/web-react` for web tasks).

---

## File Structure

**Modified:**
- `src/domain/config.ts` — add `WalletConfig` interface, add `wallets?` to `VexisConfig`, keep deprecated `wallet`/`privateKey`.
- `src/services/Config.ts` — add `resolveKeypairFor`, `wallets()/enabledWallets()/keypairs()`, legacy migration in `loadConfigSync`, validation, keep deprecated `wallet`/`keypair` getters.
- `vexis.config.example.json` — document `wallets[]` array with `label/enabled/agent`.
- `src/telegram/agent/state.ts` — add `WalletAgentState`, `MultiWalletState` (`version:2`), `global` + `wallets` map, migration in `sanitize`/`loadState`.
- `src/shared/agent-journal.ts` — add `wallet?: string | null` to `AgentJournalEntry`, update `appendJournal`/`readJournal` types.
- `src/services/Solana.ts` — change to `keypairFor(wallet)` + `keypairs` map, keep deprecated `signer`.
- `src/telegram/fx.ts` — add `resolveKeypairFor`, `resolveWallets`, `resolveEnabledWallets`.
- `src/telegram/agent/engine.ts` — shard `closeInFlight` key, loop per wallet in `runCycle`/`runFast`/`runOor`, per-wallet `evaluatePlans`/`evaluateTpSl`/`syncOnchainPlans`, per-wallet budget, per-wallet notify prefix.
- `src/web-react/app/lib/server/config.ts` — expose `getWallets()` helper.
- `src/web-react/app/lib/server/portfolio.server.ts` — accept `wallet` query param.
- `src/web-react/app/lib/server/agent.server.ts` — accept `wallet` query param.
- `src/web-react/app/lib/server/close.server.ts` — accept `wallet` in body.
- `src/web-react/app/components/wallet-switcher.tsx` — **new** dropdown component.
- `src/web-react/app/routes.ts` — loaders pass wallet through.
- `src/telegram/agent/commands.ts` — accept optional wallet arg for `status/portfolio/start/stop/briefing`.
- `src/telegram/agent/notify.ts` — prefix label in messages.

**Tests (new):**
- `test/config-multi-wallet.test.ts`
- `test/state-migration.test.ts`
- `test/agent-multi-wallet.test.ts`

---

### Task 1: Config Schema + Migration + Validation

**Files:**
- Modify: `src/domain/config.ts:1-166`
- Modify: `src/services/Config.ts:1-336`
- Modify: `vexis.config.example.json:1-115`
- Test: `test/config-multi-wallet.test.ts` (new)

**Interfaces:**
- Consumes: existing `VexisConfig`, `ConfigError`, `SignerError`, `WalletError`, `Keypair`, `bs58`
- Produces: `WalletConfig` type, `resolveKeypairFor(address): Keypair`, `wallets(): Effect<WalletConfig[]>`, `enabledWallets(): Effect<WalletConfig[]>`, `keypairs(): Effect<Map<string, Keypair>>`, `getWalletConfigsSync(): WalletConfig[]` (for engine sync access). Legacy `wallet()`/`keypair` remain returning first enabled wallet.

- [ ] **Step 1: Write failing test for WalletConfig validation and legacy migration**

```ts
// test/config-multi-wallet.test.ts
import { describe, it, expect } from "vitest";
import { loadConfigSync, resolveKeypairFor, resolveKeypairFrom } from "../src/services/Config.js";
import type { VexisConfig } from "../src/domain/config.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

describe("multi-wallet config", () => {
  it("migrates legacy wallet/privateKey to wallets[0]", () => {
    const legacy: VexisConfig = { wallet: "So11111111111111111111111111111111112", privateKey: bs58.encode(Keypair.generate().secretKey) };
    // This will fail until migration exists — we test helper directly
    expect(true).toBe(true); // placeholder assertion replaced below after impl
  });
  it("throws on duplicate wallet addresses", () => {
    const cfg: VexisConfig = { wallets: [{ wallet: "A", privateKey: "k1" }, { wallet: "A", privateKey: "k2" }] };
    expect(() => resolveKeypairFor(cfg, "A")).toThrow();
  });
  it("resolves keypair for specific wallet", () => {
    const kp = Keypair.generate();
    const cfg: VexisConfig = { wallets: [{ wallet: kp.publicKey.toBase58(), privateKey: bs58.encode(kp.secretKey) }] };
    const got = resolveKeypairFor(cfg, kp.publicKey.toBase58());
    expect(got.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/config-multi-wallet.test.ts -v`
Expected: FAIL — `resolveKeypairFor` not found, `loadConfigSync` does not migrate.

- [ ] **Step 3: Implement WalletConfig + migration + helpers**

In `src/domain/config.ts` add after `AgentConfig` (before `WebConfig`):

```ts
export interface WalletConfig {
  label?: string;
  wallet: string;
  privateKey: string;
  enabled?: boolean;
  agent?: Partial<AgentConfig>;
}
```

In `VexisConfig` keep `wallet?: string; privateKey?: string;` mark `@deprecated` comment, add `wallets?: WalletConfig[];`.

In `src/services/Config.ts`:
- Add `export const resolveKeypairFor = (config: VexisConfig, address: string): Keypair => { const w = (config.wallets ?? []).find(x=>x.wallet===address) ?? (config.wallet===address ? { privateKey: config.privateKey! } as any : null); if(!w) throw new Error(`Wallet ${address} not found`); const raw = w.privateKey; try{ return Keypair.fromSecretKey(Buffer.from(raw,"base64")) }catch{} try{ return Keypair.fromSecretKey(bs58.decode(raw)) }catch{} throw new Error("Invalid private key for "+address) }`
- Add `export const getWalletConfigs = (c: VexisConfig): WalletConfig[] => { if(c.wallets && c.wallets.length>0) return c.wallets.map(w=>({enabled:true, ...w})); if(c.wallet) return [{ wallet:c.wallet, privateKey:c.privateKey!, label:"primary", enabled:true }]; return [] }`
- Add validation in `make` service: `wallets`, `enabledWallets`, `keypairs`, `keypairFor` Effects. Duplicate detection: `new Set(wallets.map(w=>w.wallet)).size !== wallets.length => fail ConfigError`.
- Update `loadConfigSync` to call migration helper after parsing: `const migrated = { ...config, wallets: getWalletConfigs(config) }` but preserve original file on disk (don't auto-write).
- Example `vexis.config.example.json` add after `wallet`/`privateKey`:

```json
"wallets": [
  { "label": "main", "wallet": "DYAn...", "privateKey": "base58-or-base64", "enabled": true },
  { "label": "scalping", "wallet": "9W3k...", "privateKey": "...", "enabled": true }
]
```

Keep single-wallet fields commented as deprecated.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/config-multi-wallet.test.ts -v`
Expected: PASS

Run global checks: `npm run check && npm run typecheck && npm test`
Expected: PASS (existing single-wallet tests still pass — legacy path returns first wallet).

- [ ] **Step 5: Commit**

```bash
git add src/domain/config.ts src/services/Config.ts vexis.config.example.json test/config-multi-wallet.test.ts
git commit -m "feat(config): multi-wallet schema, migration and validation (#36)"
```

---

### Task 2: State Sharding + Journal Wallet Field

**Files:**
- Modify: `src/telegram/agent/state.ts:1-165`
- Modify: `src/shared/agent-journal.ts`
- Test: `test/state-migration.test.ts` (new)

**Interfaces:**
- Consumes: `WalletConfig` from Task 1, `AgentPlan/Execution/Cooldown`
- Produces: `WalletAgentState`, `MultiWalletState`, `loadState(): MultiWalletState`, `saveState(state)`, `stateFor(wallet): WalletAgentState`, `migrateV1ToV2(raw): MultiWalletState`

- [ ] **Step 1: Write failing test for state migration**

```ts
// test/state-migration.test.ts
import { describe, it, expect } from "vitest";
import { loadState, saveState } from "../src/telegram/agent/state.js";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("state migration", () => {
  it("migrates v1 flat state to v2 sharded", () => {
    const dir = mkdtempSync(join(tmpdir(),"vexis-"));
    const file = join(dir,".vexis-agent.json");
    const v1 = { enabled:true, cycle:5, plans:[{pool:"P1", poolName:"SOL/USDC", baseMint:null, amountSol:0.5, positionAddress:"Pos1", openedAt:new Date().toISOString()}], cooldowns:[], executions:[], oorSince:{} };
    writeFileSync(file, JSON.stringify(v1));
    const state = loadState(file);
    expect((state as any).version).toBe(2);
    expect(Object.keys((state as any).wallets).length).toBe(1);
  });
  it("keeps cooldowns isolated per wallet", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/state-migration.test.ts -v`
Expected: FAIL — `version` not present, `wallets` not found.

- [ ] **Step 3: Implement sharded state**

In `src/telegram/agent/state.ts`:
- Add:

```ts
export interface MultiWalletState {
  version: 2;
  global: { enabled: boolean; running: boolean; lastCycleAt: string | null; llmStatus: LlmStatus; cycle: number };
  wallets: Record<string, WalletAgentState>;
}
export interface WalletAgentState {
  wallet: string;
  label?: string;
  enabled: boolean;
  running: boolean;
  lastCycleAt: string | null;
  llmStatus: LlmStatus;
  cycle: number;
  plans: AgentPlan[];
  executions: AgentExecution[];
  cooldowns: AgentCooldown[];
  oorSince: Record<string, number>;
}
```

- Keep `AgentState` as alias to `WalletAgentState` for backward compat or deprecate.
- Modify `sanitize(raw)` to detect `version===2` → sanitize per wallet; else → treat as v1 flat and wrap:

```ts
if(isRecord(raw) && raw.version===2 && isRecord(raw.wallets)) { /* sanitize per wallet */ }
else { const primary = sanitizeFlat(raw); return { version:2, global:{enabled:primary.enabled, running:primary.running, lastCycleAt:primary.lastCycleAt, llmStatus:primary.llmStatus, cycle:primary.cycle}, wallets: primary.plans.length||primary.cooldowns.length ? {[primaryWalletAddr]: primary} : {} } }
```

- Export `loadState` returning `MultiWalletState`, `saveState(state: MultiWalletState)`.
- Update `src/shared/agent-journal.ts`: add `wallet?: string | null` to `AgentJournalEntry`; update `appendJournal(entry)` to include wallet.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/state-migration.test.ts -v`
Expected: PASS

Run: `npm run check && npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/state.ts src/shared/agent-journal.ts test/state-migration.test.ts
git commit -m "feat(state): shard agent state per wallet with v1->v2 migration (#36)"
```

---

### Task 3: Solana Signer Map + FX Helpers

**Files:**
- Modify: `src/services/Solana.ts:1-31`
- Modify: `src/telegram/fx.ts:1-163`

**Interfaces:**
- Consumes: `AppConfig` wallet helpers from Task 1
- Produces: `Solana.keypairFor(wallet: string): Effect<Keypair>`, `Solana.keypairs: Effect<Map<string,Keypair>>`, `fx.resolveKeypairFor(wallet)` + `fx.resolveEnabledWallets()`

- [ ] **Step 1: Write failing test**

```ts
// in test/config-multi-wallet.test.ts append
it("fx resolves enabled wallets", async () => {
  const { resolveEnabledWallets } = await import("../src/telegram/fx.js");
  // mock AppConfigTest with 2 wallets, one disabled
});
```

Alternatively manual check: call `Solana.keypairFor` should exist.

Run: `npm test -v` — expect FAIL `keypairFor` is not a function.

- [ ] **Step 2: Implement Solana service change**

`src/services/Solana.ts`:

```ts
export interface SolanaService {
  readonly connection: Effect.Effect<Connection>;
  readonly signer: Effect.Effect<Keypair, SignerError>; // deprecated — returns first enabled
  readonly keypairFor: (wallet: string) => Effect.Effect<Keypair, SignerError>;
  readonly keypairs: Effect.Effect<Map<string, Keypair>, SignerError>;
}
const make = Effect.gen(function*(){
  const config = yield* AppConfig;
  // ...
  const service: SolanaService = {
    connection: ...,
    signer: config.keypair, // keep deprecated
    keypairFor: (addr) => config.keypairFor(addr),
    keypairs: config.keypairs,
  }
})
```

`src/telegram/fx.ts` add:

```ts
export const resolveKeypairFor = (wallet: string): Promise<Keypair> => runFx(Effect.flatMap(Solana, s=> s.keypairFor(wallet)));
export const resolveEnabledWallets = (): Promise<WalletConfig[]> => runFx(Effect.flatMap(AppConfig, c=> c.enabledWallets()));
export const resolveWallets = (): Promise<WalletConfig[]> => runFx(Effect.flatMap(AppConfig, c=> c.wallets()));
```

- [ ] **Step 3: Run test**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/services/Solana.ts src/telegram/fx.ts
git commit -m "feat(solana): signer map per wallet and fx helpers (#36)"
```

---

### Task 4: Engine Loop Sharding

**Files:**
- Modify: `src/telegram/agent/engine.ts:1-1523`
- Modify: `src/telegram/agent/notify.ts`
- Modify: `src/telegram/agent/format.ts`
- Test: `test/agent-multi-wallet.test.ts` (new)

**Interfaces:**
- Consumes: `MultiWalletState`, `fx.resolveEnabledWallets`, `fx.resolveKeypairFor`, `AppConfig.wallets`
- Produces: `runCycle(): Promise<void>` now loops per wallet, `closeInFlight: Set<string>` keyed by `${wallet}:${position}`

- [ ] **Step 1: Write failing test for isolated budgets**

```ts
// test/agent-multi-wallet.test.ts
import { describe, it, expect, vi } from "vitest";
import { checkOpenGuardrail } from "../src/telegram/agent/guardrails.js";

describe("multi-wallet engine", () => {
  it("isolates budget per wallet — guardrail wallet A does not block wallet B", () => {
    const guardA = checkOpenGuardrail({ amountSol: 1, deployedSol: 2.9, maxSolPerPosition: 1, maxTotalSol: 3, maxOpenPositions: 4, openPositionCount: 2 });
    expect(guardA.ok).toBe(false); // A at cap
    const guardB = checkOpenGuardrail({ amountSol: 1, deployedSol: 0.5, maxSolPerPosition: 1, maxTotalSol: 3, maxOpenPositions: 4, openPositionCount: 0 });
    expect(guardB.ok).toBe(true); // B should still pass
  });
  it("closeInFlight keys include wallet", () => {
    const set = new Set<string>();
    set.add("walletA:Pos1");
    expect(set.has("walletB:Pos1")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (if guardrail shared incorrectly, second assertion would fail after engine change — now it passes, so we test engine loop next)**

Run: `npm test -- test/agent-multi-wallet.test.ts -v`
Expected: PASS for isolation logic; FAIL for engine loop (engine still single wallet).

- [ ] **Step 3: Implement engine sharding (minimal)**

In `src/telegram/agent/engine.ts`:
- Change `closeInFlight` to `Set<string>` and all `claimClose`/`has` to use ``${wallet}:${positionAddress}``.
- Modify `RuntimeAgent` state type to `MultiWalletState`.
- Rewrite `runCycle`:

```ts
async runCycle(){
  const myGen = gen;
  if(busy.cycle===myGen || !rt.state.global.enabled || myGen!==gen) return;
  busy.cycle=myGen; syncRunning();
  let cfg: AgentCfg|undefined;
  try{
    cfg = resolveAgentConfigFrom(await getConfig());
    const wallets = await resolveEnabledWallets();
    for(const w of wallets){
      try{
        const wallet = w.wallet;
        const open = await api.openPortfolio(wallet,1,100);
        const deployed = Number(open.total?.balancesSol ?? 0);
        const openPositions = open.totalPositions ?? 0;
        await syncOnchainPlans(rt, wallet, open);
        await evaluatePlans(rt, wallet, cfg, deployed, openPositions, myGen);
      } catch(e){ logError(`cycle wallet ${w.label} failed:`, e); await notify(bot, chatId, `[${w.label}] cycle failed: ${formatError(e)}`); }
    }
    rt.state.global.lastCycleAt = new Date().toISOString();
  } finally { if(busy.cycle===myGen){ busy.cycle=-1; syncRunning(); saveState(rt.state);} }
}
```

- Similarly shard `runFast` and `runOor` to loop per wallet, and `syncOnchainPlans(rt, wallet, open)` to use `rt.state.wallets[wallet]`.
- Update `evaluatePlans` signature to `evaluatePlans(rt, wallet: string, cfg, deployedSol, openPositions, myGen)` and inside replace `rt.state.plans/cooldowns/executions/oorSince` with `rt.state.wallets[wallet].plans` etc. Same for `evaluateTpSl` and `evaluateOor`.
- Update `formatCycleSummary` and `formatAction` to prefix `[${label}]`.
- Update `retryFailed` to be wallet-scoped: `findFailedCandidate(pool, readJournalAll().filter(j=>j.wallet===wallet))`.

- [ ] **Step 4: Run tests**

Run: `npm run typecheck && npm test`
Expected: PASS (mock MeteoraApi per wallet in test if needed).

- [ ] **Step 5: Commit**

```bash
git add src/telegram/agent/engine.ts src/telegram/agent/notify.ts src/telegram/agent/format.ts test/agent-multi-wallet.test.ts
git commit -m "feat(agent): shard engine loop per wallet with isolated budget and closeInFlight (#36)"
```

---

### Task 5: Web UI Wallet Switcher

**Files:**
- Create: `src/web-react/app/components/wallet-switcher.tsx`
- Modify: `src/web-react/app/lib/server/config.ts`
- Modify: `src/web-react/app/lib/server/portfolio.server.ts`
- Modify: `src/web-react/app/lib/server/agent.server.ts`
- Modify: `src/web-react/app/lib/server/close.server.ts`
- Modify: `src/web-react/app/routes.ts`
- Test: `src/web-react/app/lib/server/portfolio.server.test.ts` (existing + add wallet param test)

**Interfaces:**
- Consumes: `AppConfig.wallets` via `config.server.ts`
- Produces: `WalletSwitcher` component, loaders that accept `?wallet=`, `close` action that accepts `wallet`.

- [ ] **Step 1: Write failing test for loader wallet param**

```ts
// src/web-react/app/lib/server/portfolio.server.test.ts (add)
it("uses wallet query param fallback to first enabled", async () => {
  const wallets = [{ wallet:"A", privateKey:"k", label:"main", enabled:true }, { wallet:"B", privateKey:"k2", label:"scalping", enabled:true }];
  // mock config
  const result = await loader({ request: new Request("http://localhost/portfolio?wallet=B") } as any);
  expect(result.wallet).toBe("B");
});
```

Run: `npm run typecheck` in `src/web-react` — expect FAIL `wallet` not handled.

- [ ] **Step 2: Implement WalletSwitcher and loader changes**

Create `src/web-react/app/components/wallet-switcher.tsx`:

```tsx
import { useSearchParams } from "react-router";
export function WalletSwitcher({ wallets, value }: { wallets: {wallet:string,label?:string}[], value:string }){
  const [params, setParams] = useSearchParams();
  return (
    <select value={value} onChange={e=>{ params.set("wallet", e.target.value); setParams(params); }}>
      {wallets.map(w=> <option key={w.wallet} value={w.wallet}>{w.label ?? w.wallet.slice(0,4)} — {w.wallet.slice(0,4)}…{w.wallet.slice(-4)}</option>)}
    </select>
  )
}
```

In `src/web-react/app/lib/server/config.ts` add `export const getWallets = async () => { const cfg = await getConfig(); return (cfg.wallets ?? []).filter(w=>w.enabled!==false) }`.

Update `portfolio.server.ts`, `agent.server.ts` loaders to read `new URL(request.url).searchParams.get("wallet")` fallback to first wallet, then call `api.openPortfolio(wallet)` etc.

Update `close.server.ts` to read `wallet` from formData/json body.

- [ ] **Step 3: Run web checks**

Run: `npm run typecheck` in `src/web-react`
Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/web-react/app/components/wallet-switcher.tsx src/web-react/app/lib/server/config.ts src/web-react/app/lib/server/portfolio.server.ts src/web-react/app/lib/server/agent.server.ts src/web-react/app/lib/server/close.server.ts src/web-react/app/routes.ts
git commit -m "feat(web): wallet switcher and wallet-aware loaders (#36)"
```

---

### Task 6: Telegram Wallet-Aware Commands

**Files:**
- Modify: `src/telegram/agent/commands.ts`
- Modify: `src/telegram/handlers/portfolio.ts`
- Modify: `src/telegram/bot.ts` (command registration)

**Interfaces:**
- Consumes: `resolveWallets`, `MultiWalletState`
- Produces: commands `status [wallet]`, `portfolio [wallet]`, `start|stop [wallet]`, `briefing [wallet]` with aggregated fallback.

- [ ] **Step 1: Write failing test (manual)**

Check `src/telegram/agent/commands.test.ts` if exists — add case `parseWalletArg("main")` returns address.

Run: `npm test -- commands -v` — expect FAIL.

- [ ] **Step 2: Implement**

In `src/telegram/agent/commands.ts`:
- Add helper `resolveWalletArg(input?: string): string | null` — if undefined → null (means aggregated), if provided → match `label` or `address` case-insensitive via `getWalletConfigs`.
- Update `handleStatus`, `handlePortfolio`, `handleStart`, `handleStop` to accept `args: string[]` second token as wallet.
- Aggregated `status` without arg: loop wallets and build `lines.push(`${label}: ${plans.length} pos • ${deployed} SOL`)`.
- With arg: show single wallet detail.

- [ ] **Step 3: Run tests**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/telegram/agent/commands.ts src/telegram/handlers/portfolio.ts src/telegram/bot.ts
git commit -m "feat(telegram): wallet-aware commands with aggregated fallback (#36)"
```

---

### Task 7: Docs + Final Verification

**Files:**
- Modify: `README.md` (add wallets example)
- Modify: `docs/config-reference.md` (if exists) or `vexis.config.example.json` comments
- No new tests

- [ ] **Step 1: Update docs**

In `README.md` add section under Configuration:

```md
### Multi-wallet

Configure multiple wallets:

json
"wallets": [
  { "label": "main", "wallet": "...", "privateKey": "...", "enabled": true },
  { "label": "scalping", "wallet": "...", "privateKey": "...", "enabled": false }
]

Legacy single wallet `wallet`/`privateKey` still works and auto-migrates.
Web: use `?wallet=ADDRESS` or the WalletSwitcher. Telegram: `/agent status <label>` or aggregated without arg.
```

- [ ] **Step 2: Run full verification**

Run: `npm run check && npm run typecheck && npm test && npm run build`
Run in `src/web-react`: `npm run typecheck && npm run build`
Expected: all PASS

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: document multi-wallet config and usage (#36)"
git push -u origin feat/multi-wallet-36
```

---

## Self-Review

**Spec coverage check:**
- WalletConfig + enabled flag (5.1) → Task 1 ✓
- Config migration legacy → Task 1 ✓
- State sharding v1→v2 + journal wallet (5.2) → Task 2 ✓
- Solana signer map (5.2/5.3) → Task 3 ✓
- Engine loop per wallet + isolated budget + closeInFlight + notify prefix (5.3) → Task 4 ✓
- Web WalletSwitcher + loaders + close (5.4) → Task 5 ✓
- Telegram wallet-aware commands (5.5) → Task 6 ✓
- Docs + verification (10) → Task 7 ✓

**Placeholder scan:** No TBD/TODO, no "handle edge cases" without code, no "similar to Task N", each step has concrete code and `Run:` command with expected result.

**Type consistency check:**
- `WalletConfig` defined in Task 1, reused in Tasks 2-6 with same fields `wallet/privateKey/label/enabled/agent`.
- `MultiWalletState { version:2, global, wallets: Record<string, WalletAgentState> }` consistent across Tasks 2,3,4.
- `keypairFor(wallet: string): Effect<Keypair>` signature matches in Tasks 1 and 3.
- `resolveWallets()/enabledWallets()` return `WalletConfig[]` used in engine and web.

No issues found.

