import type { Bot, Context } from "grammy";
import type { MeteoraClient } from "../../api.js";
import type { VexisConfig } from "../../config.js";
import { tgScreenedPoolList, tgPoolDetail } from "../format.js";
import { MD, replyError } from "../utils.js";
import { screenPools, parseTimeframe } from "../../screening.js";

export function registerPool(bot: Bot, client: MeteoraClient, config: VexisConfig) {
  bot.command("pools", async (ctx: Context) => {
    try {
      const rawArg = (ctx.match as string)?.trim();
      const timeframe = parseTimeframe(rawArg);

      if (rawArg && !timeframe) {
        await ctx.reply(
          "Usage: `/pools` or `/pools <timeframe>`\nValid timeframes: 5m, 15m, 30m, 1h, 2h, 4h, 12h, 24h",
          MD,
        );
        return;
      }

      const result = await screenPools(client, config, timeframe ?? undefined);
      await ctx.reply(tgScreenedPoolList(result), MD);
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
