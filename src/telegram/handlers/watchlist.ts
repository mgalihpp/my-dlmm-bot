import type { Bot, Context } from "grammy";
import type { MeteoraClient } from "../../api.js";
import {
  addWallet,
  removeWallet,
  listWallets,
} from "../../watchlist.js";
import {
  tgWatchedList,
  tgMultiWalletPositions,
  type WalletPositions,
  escapeMarkdown,
  tgBold,
  tgCode,
} from "../format.js";
import { MD, replyError } from "../utils.js";
const TG_MAX = 4096;

export function registerWatchlist(bot: Bot, client: MeteoraClient) {
  bot.command("watchadd", async (ctx: Context) => {
    try {
      const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
      const [address, ...labelParts] = parts;
      if (!address) {
        await ctx.reply("Usage: `/watchadd <wallet> [label]`", MD);
        return;
      }
      const label = labelParts.length > 0 ? labelParts.join(" ") : undefined;
      const wallet = addWallet(address, label);
      const desc = wallet.label
        ? `\\(${escapeMarkdown(wallet.label)}\\)`
        : "";
      await ctx.reply(
        `✅ Added ${tgCode(wallet.address)} ${desc}`,
        MD,
      );
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("watchremove", async (ctx: Context) => {
    try {
      const addr = (ctx.match as string).trim().split(/\s+/)[0];
      if (!addr) {
        await ctx.reply("Usage: `/watchremove <wallet>`", MD);
        return;
      }
      if (removeWallet(addr)) {
        await ctx.reply(`✅ Removed ${tgCode(addr)}`, MD);
      } else {
        await ctx.reply(`❌ Wallet not found in watchlist`, MD);
      }
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("watchlist", async (ctx: Context) => {
    try {
      const wallets = listWallets();
      const text = tgWatchedList(wallets);
      await ctx.reply(text, MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("watchpositions", async (ctx: Context) => {
    try {
      const wallets = listWallets();
      if (wallets.length === 0) {
        await ctx.reply("📭 No watched wallets\\. Add one with `/watchadd <wallet>`", MD);
        return;
      }
      const loadingMsg = await ctx.reply("⏳ Loading positions\\.\\.\\.", MD);
      const results: WalletPositions[] = [];
      for (const w of wallets) {
        try {
          const res = await client.openPortfolio(w.address, 1, 10);
          results.push({ wallet: w, pools: res.pools });
        } catch {
          results.push({ wallet: w, pools: [] });
        }
      }
      const text = tgMultiWalletPositions(results);
      try {
        await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
      } catch {}
      await splitSend(ctx, text);
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("wallets", async (ctx: Context) => {
    try {
      const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) {
        await ctx.reply("Usage: `/wallets <wallet1> [wallet2] \\.\\.\\.`", MD);
        return;
      }
      const loadingMsg = await ctx.reply("⏳ Loading positions\\.\\.\\.", MD);
      const results: WalletPositions[] = [];
      for (const addr of parts) {
        const w = { address: addr, addedAt: "" };
        try {
          const res = await client.openPortfolio(addr, 1, 10);
          results.push({ wallet: w, pools: res.pools });
        } catch {
          results.push({ wallet: w, pools: [] });
        }
      }
      const text = tgMultiWalletPositions(results);
      try {
        await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
      } catch {}
      await splitSend(ctx, text);
    } catch (e) {
      await replyError(ctx, e);
    }
  });
}

async function splitSend(ctx: Context, text: string) {
  if (text.length <= TG_MAX) {
    await ctx.reply(text, MD);
    return;
  }
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (current.length + line.length + 1 > TG_MAX) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }
  if (current) chunks.push(current);
  for (const chunk of chunks) {
    await ctx.reply(chunk, MD);
  }
}

