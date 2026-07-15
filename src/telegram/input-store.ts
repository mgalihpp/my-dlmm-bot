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

export function deleteInputSession(chatId: string | number): void {
  runtime.runSync(Effect.flatMap(SessionStore, (s) => s.deleteInput(chatId)));
}

export async function promptText(
  ctx: Context,
  prompt: string,
  handler: (text: string, ctx: Context) => Promise<void>,
  opts?: { backLabel?: string; backData?: string },
): Promise<void> {
  const chatId = ctx.chat?.id ?? ctx.from?.id;
  if (chatId == null) return;
  setInputSession(chatId, handler, opts);
  await ctx.reply(prompt, { parse_mode: "MarkdownV2" });
}
