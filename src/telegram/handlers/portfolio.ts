import type { Bot, Context } from "grammy";
import type { MeteoraClient } from "../../api.js";
import type { VexisConfig } from "../../config.js";
import { resolveWallet } from "../../config.js";
import {
  tgPortfolioSummary,
  tgOpenPools,
  tgClosedPools,
} from "../format.js";
import { MD, replyError } from "../utils.js";

export function registerPortfolio(
  bot: Bot,
  client: MeteoraClient,
  config: VexisConfig
) {
  bot.command("portfolio", async (ctx: Context) => {
    try {
      const wallet = resolveWallet(undefined, config);
      const total = await client.totalPnl(wallet);
      await ctx.reply(tgPortfolioSummary(total), MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("open", async (ctx: Context) => {
    try {
      const wallet = resolveWallet(undefined, config);
      const res = await client.openPortfolio(wallet, 1, 10);
      await ctx.reply(tgOpenPools(res.pools), MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("closed", async (ctx: Context) => {
    try {
      const wallet = resolveWallet(undefined, config);
      const res = await client.closedPortfolio(wallet, 1, 10);
      await ctx.reply(tgClosedPools(res.pools), MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });
}
