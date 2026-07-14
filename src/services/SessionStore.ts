import { Clock, Context, Effect, HashMap, Layer, Option, Ref } from "effect";
import type { Context as GrammyContext } from "grammy";

const INPUT_TTL_MS = 5 * 60 * 1000;
const ACTION_TTL_MS = 10 * 60 * 1000;
const WIZARD_TTL_MS = 10 * 60 * 1000;

export interface InputSession {
  handler: (text: string, ctx: GrammyContext) => Promise<void>;
  expiresAt: number;
  backLabel?: string;
  backData?: string;
}

export interface ActionEntry {
  poolAddress: string;
  positionPubkey: string;
}

export interface WizardState {
  poolAddress: string;
  poolName: string;
  binStep: number;
  currentPrice: number;
  tvl?: number;
  volume24h?: number;
  holders?: number;
  baseFeePct?: number;
  strategy?: string;
  mode?: "two-sided" | "single-x" | "single-y";
  minBin?: number;
  maxBin?: number;
  minPct?: number;
  maxPct?: number;
  isPctMode?: boolean;
  xAmount?: string;
  yAmount?: string;
  swapBudget?: number;
}

export interface SessionStoreService {
  readonly setInput: (
    chatId: string | number,
    handler: (text: string, ctx: GrammyContext) => Promise<void>,
    opts?: { backLabel?: string; backData?: string },
  ) => Effect.Effect<void>;
  readonly takeInput: (chatId: string | number) => Effect.Effect<Option.Option<InputSession>>;
  readonly deleteInput: (chatId: string | number) => Effect.Effect<void>;

  readonly registerAction: (poolAddress: string, positionPubkey: string) => Effect.Effect<string>;
  readonly resolveAction: (id: string) => Effect.Effect<Option.Option<ActionEntry>>;
  readonly deleteAction: (id: string) => Effect.Effect<void>;

  readonly createWizard: (state: WizardState) => Effect.Effect<string>;
  readonly getWizard: (id: string) => Effect.Effect<Option.Option<WizardState>>;
  readonly updateWizard: (id: string, patch: Partial<WizardState>) => Effect.Effect<boolean>;
  readonly deleteWizard: (id: string) => Effect.Effect<void>;
}

export class SessionStore extends Context.Tag("SessionStore")<SessionStore, SessionStoreService>() {}

interface Expiring<A> {
  value: A;
  expiresAt: number;
}

const make = Effect.gen(function* () {
  const inputs = yield* Ref.make(HashMap.empty<string, Expiring<InputSession>>());
  const actions = yield* Ref.make(HashMap.empty<string, Expiring<ActionEntry>>());
  const wizards = yield* Ref.make(HashMap.empty<string, Expiring<WizardState>>());
  const actionCounter = yield* Ref.make(0);
  const wizardCounter = yield* Ref.make(0);

  const takeAlive = <A>(
    ref: Ref.Ref<HashMap.HashMap<string, Expiring<A>>>,
    key: string,
    remove: boolean,
  ): Effect.Effect<Option.Option<A>> =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const map = yield* Ref.get(ref);
      const entry = HashMap.get(map, key);
      if (Option.isNone(entry)) return Option.none<A>();
      if (now > entry.value.expiresAt) {
        yield* Ref.update(ref, HashMap.remove(key));
        return Option.none<A>();
      }
      if (remove) yield* Ref.update(ref, HashMap.remove(key));
      return Option.some(entry.value.value);
    });

  const service: SessionStoreService = {
    setInput: (chatId, handler, opts) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const session: InputSession = {
          handler,
          expiresAt: now + INPUT_TTL_MS,
          backLabel: opts?.backLabel,
          backData: opts?.backData,
        };
        yield* Ref.update(
          inputs,
          HashMap.set(String(chatId), { value: session, expiresAt: now + INPUT_TTL_MS }),
        );
      }),
    takeInput: (chatId) => takeAlive(inputs, String(chatId), true),
    deleteInput: (chatId) => Ref.update(inputs, HashMap.remove(String(chatId))),

    registerAction: (poolAddress, positionPubkey) =>
      Effect.gen(function* () {
        const n = yield* Ref.updateAndGet(actionCounter, (c) => c + 1);
        const now = yield* Clock.currentTimeMillis;
        const id = `a${n}`;
        yield* Ref.update(
          actions,
          HashMap.set(id, { value: { poolAddress, positionPubkey }, expiresAt: now + ACTION_TTL_MS }),
        );
        return id;
      }),
    resolveAction: (id) => takeAlive(actions, id, false),
    deleteAction: (id) => Ref.update(actions, HashMap.remove(id)),

    createWizard: (state) =>
      Effect.gen(function* () {
        const n = yield* Ref.updateAndGet(wizardCounter, (c) => c + 1);
        const now = yield* Clock.currentTimeMillis;
        const id = `w${n}`;
        yield* Ref.update(wizards, HashMap.set(id, { value: state, expiresAt: now + WIZARD_TTL_MS }));
        return id;
      }),
    getWizard: (id) => takeAlive(wizards, id, false),
    updateWizard: (id, patch) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const map = yield* Ref.get(wizards);
        const entry = HashMap.get(map, id);
        if (Option.isNone(entry) || now > entry.value.expiresAt) return false;
        const next = { value: { ...entry.value.value, ...patch }, expiresAt: now + WIZARD_TTL_MS };
        yield* Ref.update(wizards, HashMap.set(id, next));
        return true;
      }),
    deleteWizard: (id) => Ref.update(wizards, HashMap.remove(id)),
  };
  return service;
});

export const SessionStoreLive = Layer.effect(SessionStore, make);
