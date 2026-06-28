// Generic text input session store.
// Allows any handler to prompt for text input and capture the next message.
import { Context } from "grammy";

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface InputSession {
  handler: (text: string, ctx: Context) => Promise<void>;
  expiresAt: number;
  backLabel?: string;
  backData?: string;
}

const sessions = new Map<string, InputSession>();

export function setInputSession(
  chatId: string | number,
  handler: (text: string, ctx: Context) => Promise<void>,
  opts?: { backLabel?: string; backData?: string },
) {
  sessions.set(String(chatId), {
    handler,
    expiresAt: Date.now() + TTL_MS,
    backLabel: opts?.backLabel,
    backData: opts?.backData,
  });
}

export function getInputSession(chatId: string | number): InputSession | null {
  const s = sessions.get(String(chatId));
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(String(chatId));
    return null;
  }
  return s;
}

export function deleteInputSession(chatId: string | number) {
  sessions.delete(String(chatId));
}

/** Convenience: set a session and reply with a prompt. */
export async function promptText(
  ctx: Context,
  prompt: string,
  handler: (text: string, ctx: Context) => Promise<void>,
  opts?: { backLabel?: string; backData?: string },
) {
  const chatId = ctx.chat?.id ?? ctx.from?.id;
  if (chatId == null) return;
  setInputSession(chatId, handler, opts);
  await ctx.reply(prompt, { parse_mode: "MarkdownV2" });
}
