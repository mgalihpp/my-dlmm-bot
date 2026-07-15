import { Effect, ManagedRuntime } from "effect";
import { AppLayer } from "../layers.js";

export const runtime = ManagedRuntime.make(AppLayer);

export const runFx = <A, E>(eff: Effect.Effect<A, E, ManagedRuntime.ManagedRuntime.Context<typeof runtime>>): Promise<A> =>
  runtime.runPromise(eff);
