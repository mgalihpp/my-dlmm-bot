import type { Bot, Context } from "grammy";
import { api, dlmm, resolveWallet } from "../fx.js";
import {
  tgPortfolioSummary,
  tgOpenPools,
  tgClosedPools,
} from "../format.js";
import { MD, replyError } from "../utils.js";

export function registerPortfolio(bot: Bot) {
  bot.command("portfolio", async (ctx: Context) => {
    try {
      const wallet = await resolveWallet();
      const total = await api.totalPnl(wallet);
      await ctx.reply(tgPortfolioSummary(total), MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("open", async (ctx: Context) => {
    try {
      const wallet = await resolveWallet();
      const res = await api.openPortfolio(wallet, 1, 10);
      const enriched = await api.enrichOpenPortfolioPnl(res.pools, wallet);
      await dlmm.attachLivePositions(enriched, wallet);
      await ctx.reply(tgOpenPools(enriched), MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("closed", async (ctx: Context) => {
    try {
      const wallet = await resolveWallet();
      const res = await api.closedPortfolio(wallet, 1, 10);
      await ctx.reply(tgClosedPools(res.pools), MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });
}
