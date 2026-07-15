import { Effect, Option } from "effect";
import type { Context } from "grammy";
import { SessionStore, type InputSession } from "../services/SessionStore.js";
import { runtime } from "./runtime.js";

export type { InputSession };

export function setInputSession(
  chatId: string | number,
  handler: (text: string, ctx: Context) => Promise<void>,
  opts?: { backLabel?: string; backData?: string },
): void {
  runtime.runSync(Effect.flatMap(SessionStore, (s) => s.setInput(chatId, handler, opts)));
}

export function takeInputSession(chatId: string | number): InputSession | null {
  return Option.getOrNull(
    runtime.runSync(Effect.flatMap(SessionStore, (s) => s.takeInput(chatId))),
  );
}
