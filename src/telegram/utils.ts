import { Context } from "grammy";
import { escapeMarkdown } from "./format.js";

export const MD = { parse_mode: "MarkdownV2" as const, link_preview_options: { is_disabled: true } };

export async function replyError(ctx: Context, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  await ctx.reply(`✖ ${escapeMarkdown(msg)}`, MD);
}
