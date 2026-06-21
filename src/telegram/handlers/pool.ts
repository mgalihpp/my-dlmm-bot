import type { Bot, Context } from "grammy";
import type { MeteoraClient } from "../../api.js";
import type { VexisConfig } from "../../config.js";
import { tgPoolList, tgPoolDetail } from "../format.js";
import { MD, replyError } from "../utils.js";

export function registerPool(bot: Bot, client: MeteoraClient, config: VexisConfig) {
  bot.command("pools", async (ctx: Context) => {
    try {
      const poolCfg = config.pools ?? {};
      const sortBy = poolCfg.sortBy ?? "fee_tvl_ratio_30m:desc";
      const filterBy = poolCfg.filterBy ?? "tvl>100";
      const pageSize = poolCfg.pageSize ?? 15;
      const minMc = poolCfg.minMarketCap ?? 100000;
      const maxMc = poolCfg.maxMarketCap ?? 2000000;

      const res = await client.pools({ pageSize, filterBy, sortBy });
      const filtered = res.data.filter((p) => p.token_x.market_cap >= minMc && p.token_x.market_cap <= maxMc);
      await ctx.reply(tgPoolList(filtered), MD);
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
