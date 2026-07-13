import type { Bot, Context } from "grammy";
import type { MeteoraClient } from "../../api.js";
import type { VexisConfig } from "../../config.js";
import { resolveWallet, resolveRpc } from "../../config.js";
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
      const enriched = await client.enrichOpenPortfolioPnl(res.pools, wallet);
      try {
        const { fetchUserPositions } = await import("../../dlmm.js");
        const live = await fetchUserPositions(resolveRpc(config), wallet);
        const byPool = new Map<string, typeof live>();
        for (const l of live) {
          const arr = byPool.get(l.poolAddress) ?? [];
          arr.push(l);
          byPool.set(l.poolAddress, arr);
        }
        for (const pool of enriched) {
          const l = byPool.get(pool.poolAddress);
          if (l) {
            pool.positionsLive = l.map((x) => ({
              address: x.positionAddress,
              amountX: x.amountX,
              amountY: x.amountY,
              feeX: x.feeX,
              feeY: x.feeY,
            }));
          }
        }
      } catch {
        // SDK/RPC unavailable — datapi data still renders.
      }
      await ctx.reply(tgOpenPools(enriched), MD);
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
