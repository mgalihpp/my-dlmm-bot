import type { Bot, Context } from "grammy";
import type { MeteoraClient } from "../../api.js";
import { tgPoolList, tgPoolDetail, escapeMarkdown } from "../format.js";

const MD = { parse_mode: "MarkdownV2" as const };

export function registerPool(bot: Bot, client: MeteoraClient) {
  bot.command("pools", async (ctx: Context) => {
    try {
      const res = await client.pools({
        pageSize: 15,
        maxMarketCap: 2000000,
        sortBy: "fee_tvl_ratio_30m:desc",
      });
      await ctx.reply(tgPoolList(res.data), MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("pool", async (ctx: Context) => {
    try {
      const address = (ctx.match as string)?.trim();
      if (!address) {
        await ctx.reply("Usage: `/pool <address>`", MD);
        return;
      }
      const pool = await client.pool(address);
      await ctx.reply(tgPoolDetail(pool), MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });
}

async function replyError(ctx: Context, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  await ctx.reply(`✖ ${escapeMarkdown(msg)}`, MD);
}
