# Multi Wallet Support — Design

**Issue:** #36 [Feature] Multi wallet support — https://github.com/mgalihpp/my-dlmm-bot/issues/36
**Branch:** `feat/multi-wallet-36`
**Date:** 2026-08-25
**Status:** Approved (6/6 sections)

## 1. Summary

Enable the Vexis bot to manage multiple Solana wallets for trading concurrently. v1 uses a sequential sharded loop: one global tick iterates over all `enabled` wallets in order. Budgets, positions, cooldowns, and PnL are isolated per wallet. The existing single-wallet config (`wallet` + `privateKey`) remains supported via automatic migration to the new `wallets[]` array. Web UI shows a per-wallet view with a switcher, Telegram commands accept an optional wallet argument with a global summary fallback.

## 2. Context & Constraints

* Current codebase is single-wallet everywhere:
  * `src/domain/config.ts:134` — `VexisConfig { wallet?, privateKey? }`
  * `src/services/Config.ts:70` — `resolveKeypairFrom()` returns one `Keypair`
  * `src/services/Solana.ts:6` — `Solana { connection, signer }` single signer
  * `src/telegram/fx.ts:30` — `resolveWallet()` / `resolveKeypair()` single
  * `src/telegram/agent/state.ts:31` — `AgentState` global flat
  * `src/telegram/agent/engine.ts:374` — `createAgent()` hardcodes one wallet per cycle
  * Read-only `Watchlist` already exists for tracking other wallets without trading.
* Requirements from brainstorming:
  * Multi-signer trading (each wallet has its own private key)
  * Budget isolated per wallet (`maxSolPerPosition`, `maxTotalSol`, `maxOpenPositions` per wallet)
  * Config via single `vexis.config.json` array `wallets[]` (choice A)
  * Per-wallet `enabled` flag (choice C)
  * Dashboard separated per wallet with switcher (choice A)
* Principles: Effect patterns, backward compatibility, no new `RPC_URL` env var, no `any`, no secret exposure in Telegram/Web, YAGNI.

## 3. Goals / Non-Goals

**Goals:**
* Support 2–5 trading wallets on one bot instance.
* Isolated risk/budget/position tracking per wallet.
* Zero manual migration for existing single-wallet users.
* Wallet-aware Web UI and Telegram UX.

**Non-Goals (v1):**
* Per-wallet `intervalMinutes` / `txCooldownMs` / `llm` model differences (global for v1, structure ready for v2).
* Parallel execution (v1 sequential; upgrade path is `concurrency` param).
* Separate RPC URL per wallet.
* Per-wallet Darwin weights (shared learning in v1).

## 4. Architecture Overview

```
Global Tick (max(txCooldownMs, 60s))
  └─ for (wallet of enabledWallets) sequential
       ├─ signer = Map<address, Keypair>.get(wallet)
       ├─ cfg = merge(global agent config + wallet.agent override)
       ├─ open = MeteoraApi.openPortfolio(wallet)
       ├─ syncOnchainPlans(wallet)
       ├─ evaluateTpSl(wallet)      // deterministic, includes oorSince per wallet
       └─ evaluatePlans(wallet)     // screen → filterCooldown(wallet) → filterDuplicates(wallet) → LLM → guardrails → createPosition(signer)
```

* One RPC `Connection` cached by `rpcUrl`, N signers cached by address.
* All services remain wallet-agnostic; they receive `wallet: string` as before.
* Failure in one wallet does not abort other wallets (try/catch per wallet).
* Upgrade to parallel: replace `for` loop with `Effect.forEach(wallets, { concurrency: 3 })` plus semaphore for Meteora/LLM rate limits.

## 5. Detailed Design

### 5.1 Config — `src/domain/config.ts`, `src/services/Config.ts`, `vexis.config.example.json`

```ts
export interface WalletConfig {
  label?: string;              // e.g., "main", "scalping"
  wallet: string;              // Solana pubkey base58
  privateKey: string;          // base64 or base58
  enabled?: boolean;           // default true
  agent?: Partial<AgentConfig>; // v1: reserved, v2: per-wallet overrides
}

export interface VexisConfig {
  wallet?: string;             // @deprecated — migrated to wallets[0]
  privateKey?: string;         // @deprecated
  wallets?: WalletConfig[];
  rpcUrl?: string;
  // ... rest unchanged
}
```

* `loadConfigSync()` and `AppConfig` service:
  * If `wallets` is undefined/empty and legacy `wallet` exists → synthesize `wallets = [{ wallet, privateKey, label: "primary", enabled: true }]`.
  * New helpers: `wallets(): Effect<WalletConfig[]>`, `enabledWallets(): Effect<WalletConfig[]>`, `keypairFor(address): Effect<Keypair>`, `keypairs(): Effect<Map<string, Keypair>>`.
  * Validation: `Effect.Schema` for pubkey (32 bytes base58), duplicate address detection, `privateKey` decoded via base64 then bs58 (same as `src/services/Config.ts:78`), readable error messages.
  * Keep legacy `wallet()` and `keypair` getters returning first enabled wallet for backward compatibility, marked `@deprecated`.
* `vexis.config.example.json` documents both forms and the `enabled` flag.
* Secrets: no new env vars; `VEXIS_PRIVATE_KEY` still overrides only for single-wallet legacy path and is deprecated for multi-wallet.

### 5.2 State & Journal — `src/telegram/agent/state.ts`, `.vexis-agent.json`, `.vexis-agent-journal.jsonl`, `signalWeights.ts`

Current:
```ts
export interface AgentState { enabled, running, lastCycleAt, llmStatus, cycle, plans[], executions[], cooldowns[], oorSince }
```

Proposed:
```ts
export interface WalletAgentState extends AgentState {
  wallet: string;
  label?: string;
}

export interface MultiWalletState {
  version: 2;
  global: {
    enabled: boolean;
    running: boolean;
    lastCycleAt: string | null;
    llmStatus: LlmStatus;
    cycle: number;
  };
  wallets: Record<string, WalletAgentState>; // key = wallet address
}
```

* `loadState(file)`:
  * If file missing → return empty multi-wallet state.
  * If file has no `version` (flat v1) → migrate: create `wallets[primaryAddress]` with old `plans/cooldowns/executions/oorSince`, set `global` from old top-level `enabled/running/cycle`.
  * Sanitize per wallet via existing `planOf`, `cooldownOf`, `executionOf`.
* `saveState()` writes atomically (existing `writeFileSync`).
* `closeInFlight` (`src/telegram/agent/engine.ts:91`) changes from `Set<string>` to `Set<string>` keyed as `${wallet}:${positionAddress}`.
* Journal (`src/shared/agent-journal.ts`): add optional `wallet: string | null` to `AgentJournalEntry`. `appendJournal` includes wallet. Legacy entries without wallet remain readable (treated as primary).
* Darwin weights (`src/telegram/agent/signalWeights.ts`): remain global in v1. Document v2 option to shard if needed.

### 5.3 Engine Loop — `src/telegram/agent/engine.ts`, `src/telegram/fx.ts`

* `createAgent(bot, chatId)`:
  * Loads `enabledWallets` via `AppConfig`.
  * `runCycle()`, `runFast()`, `runOor()` each loop sequentially over wallets:
    ```ts
    for (const w of enabledWallets) {
      try {
        const signer = await resolveKeypairFor(w.wallet);
        const cfg = resolveAgentConfigFrom(getConfigSync(), w.agent);
        const open = await api.openPortfolio(w.wallet, 1, 100);
        await syncOnchainPlans(rt, w.wallet, open);
        await evaluateTpSl(rt, w.wallet, cfg, ...);
        await evaluatePlans(rt, w.wallet, cfg, deployed, openPositions, myGen);
      } catch (e) { logError(`wallet ${w.label} failed`, e); await notify(...); /* continue */ }
    }
    ```
* `syncOnchainPlans`, `evaluateTpSl`, `evaluatePlans` gain `wallet: string` param; they read/write `state.wallets[wallet].plans/cooldowns/oorSince`.
* `checkDuplicate`, `checkPoolCooldown`, `filterCooldown`, `filterDuplicates` scoped to `state.wallets[wallet]`.
* `checkOpenGuardrail` and `deriveOpenAmount` use per-wallet `deployedSol` and `openPositions` (isolated budget — requirement A).
* `checkCloseGate` and `claimClose` use wallet-scoped `closeInFlight`.
* Notifications: prefix with `[${label}]` via `formatAction` and `formatCycleSummary`; `notifyKeyboard` includes wallet context.
* Generation/busy logic (`gen`, `busy` in `engine.ts:391`) remains global for now; per-wallet busy can be added if parallelized.

### 5.4 Web UI — `src/web-react/`

* **Routing:** query param `?wallet=ADDRESS` on `/portfolio`, `/pools`, `/agent`, `/settings`. Loader helpers in `src/web-react/app/lib/server/portfolio.server.ts` and `agent.server.ts` read `wallet` from request URL, fallback to first enabled wallet from config (via `src/web-react/app/lib/server/config.ts`).
* **WalletSwitcher component** (`src/web-react/app/components/wallet-switcher.tsx`): dropdown showing `label — shortAddress (4...4)`, enabled indicator. Uses `useSearchParams` to update URL. Persists last selection in `localStorage` via `src/web-react/app/lib/settings.ts`. Never shows `privateKey`.
* **Close position:** `src/web-react/app/lib/server/close.server.ts` already expects `poolAddress` + `positionAddress`; add `wallet` to request body, server resolves signer for that wallet.
* **Polling/streaming:** existing `stale-while-revalidate 30s` and `use-auto-refresh` per wallet (keyed by wallet address to avoid cache collision).

### 5.5 Telegram — `src/telegram/agent/commands.ts`, `src/telegram/handlers/*`, `src/telegram/agent/notify.ts`

* `/agent status [wallet]` — no arg: aggregated summary (one line per wallet: `main (4 chars): 2 pos • 1.2 SOL • cycle #5`); with arg (label or address): detailed per-wallet status.
* `/agent portfolio [wallet]` — same pattern.
* `/agent start|stop [wallet]` — no arg: toggle `global.enabled`; with arg: toggle `wallets[addr].enabled` via `AppConfig.update` and persist.
* `/briefing [wallet]` — per wallet.
* Callback retries (`retryFailed`) include wallet in lookup (`findFailedCandidate` now wallet-scoped).
* No new commands required; wallet arg is optional to preserve compatibility.

## 6. Data Flow

1. Config loaded from `$VEXIS_CONFIG` / `./vexis.config.json` / `~/.vexis/config.json`.
2. `AppConfig` exposes `wallets` and `keypairs` map.
3. Agent tick reads enabled wallets, iterates sequentially.
4. Per wallet: fetch open portfolio → sync plans → TP/SL check → screening → LLM → guardrails → tx (signed by wallet-specific keypair).
5. State saved per wallet, journal appended per wallet, Telegram notified per wallet.

## 7. Error Handling

* Invalid wallet address or private key: fail fast at config load with `ConfigError` and clear message; agent does not start.
* Duplicate wallet addresses: `ConfigError`.
* RPC/Meteora/Jupiter/LLM failure per wallet: logged, notified, continue to next wallet; does not abort global cycle.
* Missing signer for a wallet listed without `privateKey`: wallet treated as read-only (portfolio only), skipped for trading with warning.
* State migration failure: fall back to empty state, log warning, do not crash.

## 8. Security

* Never log or send `privateKey` to Telegram or Web UI.
* `vexis.config.json` remains gitignored; `vexis.config.example.json` shows placeholder keys.
* Web UI is server-side only for tx; client sends only `wallet` address, never keys.

## 9. Testing Strategy

* No live RPC / Telegram / network in tests.
* `test/config-multi-wallet.test.ts`: schema validation, duplicate detection, legacy migration.
* `test/state-migration.test.ts`: v1 flat file → v2 sharded, missing fields, corrupted file.
* `test/agent-multi-wallet.test.ts`: mocked `MeteoraApi` per wallet, verify isolated budget, cooldown scoping, sequential loop error isolation, `closeInFlight` keying.
* `test/web-wallet-switcher.test.ts`: loader wallet param fallback.
* Existing tests must pass with single-wallet config unchanged.

## 10. Migration & Rollout

1. **Phase 0:** Spec commit (this file) on `feat/multi-wallet-36`.
2. **Phase 1:** Config + State migration + tests.
3. **Phase 2:** Engine sharding + closeInFlight + journal wallet field.
4. **Phase 3:** Web UI switcher + server loaders.
5. **Phase 4:** Telegram arg handling.
6. Verification after each phase: `npm run check && npm run typecheck && npm test && npm run build`.

## 11. Open Questions Resolved

* Budget isolated per wallet — yes (Q2 A).
* Config as `wallets[]` array — yes (Q3 A).
* Per-wallet `enabled` — yes (Q4 C).
* Dashboard per-wallet switcher — yes (Q5 A).
* v1 sequential, global interval — future upgrade to parallel/per-wallet interval is design-compatible.

## 12. References

* `src/domain/config.ts:134`
* `src/services/Config.ts:70`
* `src/services/Solana.ts:6`
* `src/telegram/fx.ts:30`
* `src/telegram/agent/state.ts:31`
* `src/telegram/agent/engine.ts:374`
* `docs/superpowers/specs/2026-08-08-ai-agent-design.md`
* `vexis.config.example.json:2`
