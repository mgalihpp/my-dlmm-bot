import { describe, it, expect } from "vitest";
import { Effect, Layer, Option, TestClock, TestContext } from "effect";
import { SessionStore, SessionStoreLive } from "../src/services/SessionStore.js";

const run = <A>(eff: Effect.Effect<A, unknown, SessionStore>) =>
  Effect.runPromise(
    eff.pipe(
      Effect.provide(Layer.provideMerge(SessionStoreLive, TestContext.TestContext)),
    ) as Effect.Effect<A>,
  );

describe("SessionStore actions", () => {
  it("registers and resolves with sequential ids", () =>
    run(
      Effect.gen(function* () {
        const store = yield* SessionStore;
        const id1 = yield* store.registerAction("pool1", "pos1");
        const id2 = yield* store.registerAction("pool2", "pos2");
        expect(id1).toBe("a1");
        expect(id2).toBe("a2");
        const r = yield* store.resolveAction("a1");
        expect(Option.getOrNull(r)).toEqual({ poolAddress: "pool1", positionPubkey: "pos1" });
      }),
    ));

  it("expires after TTL", () =>
    run(
      Effect.gen(function* () {
        const store = yield* SessionStore;
        yield* store.registerAction("pool1", "pos1");
        yield* TestClock.adjust("11 minutes");
        const r = yield* store.resolveAction("a1");
        expect(Option.isNone(r)).toBe(true);
      }),
    ));

  it("delete removes", () =>
    run(
      Effect.gen(function* () {
        const store = yield* SessionStore;
        const id = yield* store.registerAction("pool1", "pos1");
        yield* store.deleteAction(id);
        const r = yield* store.resolveAction(id);
        expect(Option.isNone(r)).toBe(true);
      }),
    ));
});

describe("SessionStore wizards", () => {
  it("create/get/update", () =>
    run(
      Effect.gen(function* () {
        const store = yield* SessionStore;
        const id = yield* store.createWizard({
          poolAddress: "p",
          poolName: "AAA/SOL",
          binStep: 20,
          currentPrice: 1,
        });
        expect(id).toBe("w1");
        const ok = yield* store.updateWizard(id, { strategy: "spot" });
        expect(ok).toBe(true);
        const w = yield* store.getWizard(id);
        expect(Option.getOrNull(w)?.strategy).toBe("spot");
      }),
    ));

  it("update refreshes TTL", () =>
    run(
      Effect.gen(function* () {
        const store = yield* SessionStore;
        const id = yield* store.createWizard({
          poolAddress: "p",
          poolName: "AAA/SOL",
          binStep: 20,
          currentPrice: 1,
        });
        yield* TestClock.adjust("9 minutes");
        const ok = yield* store.updateWizard(id, { strategy: "spot" });
        expect(ok).toBe(true);
        yield* TestClock.adjust("9 minutes");
        const w = yield* store.getWizard(id);
        expect(Option.isSome(w)).toBe(true);
        yield* TestClock.adjust("11 minutes");
        const gone = yield* store.getWizard(id);
        expect(Option.isNone(gone)).toBe(true);
      }),
    ));

  it("update on expired returns false", () =>
    run(
      Effect.gen(function* () {
        const store = yield* SessionStore;
        const id = yield* store.createWizard({
          poolAddress: "p",
          poolName: "AAA/SOL",
          binStep: 20,
          currentPrice: 1,
        });
        yield* TestClock.adjust("11 minutes");
        const ok = yield* store.updateWizard(id, { strategy: "spot" });
        expect(ok).toBe(false);
      }),
    ));
});

describe("SessionStore inputs", () => {
  it("takeInput consumes the session", () =>
    run(
      Effect.gen(function* () {
        const store = yield* SessionStore;
        yield* store.setInput("123", async () => {});
        const first = yield* store.takeInput("123");
        expect(Option.isSome(first)).toBe(true);
        const second = yield* store.takeInput("123");
        expect(Option.isNone(second)).toBe(true);
      }),
    ));

  it("input expires after 5 minutes", () =>
    run(
      Effect.gen(function* () {
        const store = yield* SessionStore;
        yield* store.setInput(42, async () => {});
        yield* TestClock.adjust("6 minutes");
        const r = yield* store.takeInput(42);
        expect(Option.isNone(r)).toBe(true);
      }),
    ));
});
