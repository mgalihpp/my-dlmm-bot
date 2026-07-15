import { Effect, Option } from "effect";
import { SessionStore, type ActionEntry } from "../services/SessionStore.js";
import { runtime } from "./runtime.js";

export function registerAction(poolAddress: string, positionPubkey: string): string {
  return runtime.runSync(Effect.flatMap(SessionStore, (s) => s.registerAction(poolAddress, positionPubkey)));
}

export function resolveAction(id: string): ActionEntry | null {
  return Option.getOrNull(runtime.runSync(Effect.flatMap(SessionStore, (s) => s.resolveAction(id))));
}

export function deleteAction(id: string): void {
  runtime.runSync(Effect.flatMap(SessionStore, (s) => s.deleteAction(id)));
}
