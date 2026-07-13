import type { Bot, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { MeteoraClient } from "../../api.js";
import type { VexisConfig } from "../../config.js";
import { resolveRpc } from "../../config.js";
import { addWallet, removeWallet, listWallets } from "../../watchlist.js";
import {
  tgWatchedList,
  tgMultiWalletPositions,
  type WalletPositions,
  escapeMarkdown,
  tgBold,
  tgCode,
} from "../format.js";
import { MD, replyError } from "../utils.js";
import { setInputSession } from "../input-store.js";

const TG_MAX = 4096;

export function registerWatchlist(bot: Bot, client: MeteoraClient, config: VexisConfig) {
  // ─── /watchadd — add wallet to watchlist ─────────────────────────────────
  bot.command("watchadd", async (ctx) => {
    try {
      const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
      const [address, ...labelParts] = parts;

      if (address) {
        // Has args — existing behavior
        const label = labelParts.length > 0 ? labelParts.join(" ") : undefined;
        const wallet = addWallet(address, label);
        const desc = wallet.label ? `\\(${escapeMarkdown(wallet.label)}\\)` : "";
        await ctx.reply(`✅ Added ${tgCode(wallet.address)} ${desc}`, MD);
        return;
      }

      // No args — interactive flow
      const chatId = String(ctx.chat?.id ?? ctx.from?.id);
      let capturedAddr = "";

      setInputSession(chatId, async (text, sessionCtx) => {
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) {
          await sessionCtx.reply("✖ Invalid address\\. Send a valid Solana wallet address:", MD);
          return;
        }
        capturedAddr = text;
        // Ask for label
        const kb = new InlineKeyboard()
          .text("✏️ Add Label", `watchadd:label:${text}`)
          .text("⏭️ Skip", `watchadd:confirm:${text}:`);
        await sessionCtx.reply(`✅ Address: ${tgCode(text)}\n\nAdd a label?`, { ...MD, reply_markup: kb });
      });
      await ctx.reply("✏️ Send wallet address to watch:", MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── watchadd:label:<addr> — prompt for label ────────────────────────────
  bot.callbackQuery(/^watchadd:label:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const addr = ctx.match![1];
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);
    setInputSession(chatId, async (text, sessionCtx) => {
      const wallet = addWallet(addr, text);
      await sessionCtx.reply(`✅ Added ${tgCode(wallet.address)} \\(${escapeMarkdown(wallet.label!)}\\)`, MD);
    });
    await ctx.editMessageText("✏️ Send label for this wallet:", MD);
  });

  // ─── watchadd:confirm:<addr>:<label> — confirm add ──────────────────────
  bot.callbackQuery(/^watchadd:confirm:([^:]+):(.*)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const addr = ctx.match![1];
    const label = ctx.match![2] || undefined;
    const wallet = addWallet(addr, label);
    const desc = wallet.label ? ` \\(${escapeMarkdown(wallet.label)}\\)` : "";
    await ctx.editMessageText(`✅ Added ${tgCode(wallet.address)}${desc}`, MD);
  });

  // ─── /watchremove — remove wallet from watchlist ─────────────────────────
  bot.command("watchremove", async (ctx) => {
    try {
      const addr = (ctx.match as string).trim().split(/\s+/)[0];
      if (addr) {
        // Has args — existing behavior
        if (removeWallet(addr)) {
          await ctx.reply(`✅ Removed ${tgCode(addr)}`, MD);
        } else {
          await ctx.reply(`❌ Wallet not found in watchlist`, MD);
        }
        return;
      }

      // No args — interactive flow
      const wallets = listWallets();
      if (wallets.length === 0) {
        await ctx.reply("📭 No watched wallets\\. Add one with /watchadd", MD);
        return;
      }
      const kb = new InlineKeyboard();
      for (const w of wallets) {
        const label = w.label ? `${w.label}` : w.address.slice(0, 8) + "…";
        kb.text(label.slice(0, 30), `watchremove:confirm:${w.address}`).row();
      }
      await ctx.reply("Select wallet to remove:", { ...MD, reply_markup: kb });
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── watchremove:confirm:<addr> — confirm removal ────────────────────────
  bot.callbackQuery(/^watchremove:confirm:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const addr = ctx.match![1];
    if (removeWallet(addr)) {
      await ctx.editMessageText(`✅ Removed ${tgCode(addr)}`, MD);
    } else {
      await ctx.editMessageText(`❌ Wallet not found`, MD);
    }
  });

  // ─── /watchlist — list watched wallets ───────────────────────────────────
  bot.command("watchlist", async (ctx) => {
    try {
      const wallets = listWallets();
      const text = tgWatchedList(wallets);
      await ctx.reply(text, MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── /watchpositions — all watched wallets' positions ────────────────────
  bot.command("watchpositions", async (ctx) => {
    try {
      const wallets = listWallets();
      if (wallets.length === 0) {
        await ctx.reply("📭 No watched wallets\\. Add one with `/watchadd <wallet>`", MD);
        return;
      }
      const loadingMsg = await ctx.reply("⏳ Loading positions\\.\\.\\.", MD);
      const { attachLivePositions } = await import("../../dlmm.js");
      const results: WalletPositions[] = [];
      for (const w of wallets) {
        try {
          const res = await client.openPortfolio(w.address, 1, 10);
          const pools = res.pools ?? [];
          await attachLivePositions(pools, resolveRpc(config), w.address);
          results.push({ wallet: w, pools });
        } catch {
          results.push({ wallet: w, pools: [] });
        }
      }
      const text = tgMultiWalletPositions(results);
      try { await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id); } catch {}
      await splitSend(ctx, text);
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── /wallets — query any wallets ────────────────────────────────────────
  bot.command("wallets", async (ctx) => {
    try {
      const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);

      if (parts.length > 0) {
        // Has args — existing behavior
        const loadingMsg = await ctx.reply("⏳ Loading positions\\.\\.\\.", MD);
        const { attachLivePositions } = await import("../../dlmm.js");
        const results: WalletPositions[] = [];
        for (const addr of parts) {
          const w = { address: addr, addedAt: "" };
          try {
            const res = await client.openPortfolio(addr, 1, 10);
            const pools = res.pools ?? [];
            await attachLivePositions(pools, resolveRpc(config), addr);
            results.push({ wallet: w, pools });
          } catch {
            results.push({ wallet: w, pools: [] });
          }
        }
        const text = tgMultiWalletPositions(results);
        try { await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id); } catch {}
        await splitSend(ctx, text);
        return;
      }

      // No args — prompt for addresses
      const chatId = String(ctx.chat?.id ?? ctx.from?.id);
      setInputSession(chatId, async (text, sessionCtx) => {
        const addrs = text.split(/\s+/).filter(Boolean);
        if (addrs.length === 0) {
          await sessionCtx.reply("✖ Send at least one wallet address:", MD);
          return;
        }
        const loadingMsg = await sessionCtx.reply("⏳ Loading positions\\.\\.\\.", MD);
        const { attachLivePositions } = await import("../../dlmm.js");
        const results: WalletPositions[] = [];
        for (const addr of addrs) {
          const w = { address: addr, addedAt: "" };
          try {
            const res = await client.openPortfolio(addr, 1, 10);
            const pools = res.pools ?? [];
            await attachLivePositions(pools, resolveRpc(config), addr);
            results.push({ wallet: w, pools });
          } catch {
            results.push({ wallet: w, pools: [] });
          }
        }
        const resText = tgMultiWalletPositions(results);
        try { await sessionCtx.api.deleteMessage(sessionCtx.chat!.id, loadingMsg.message_id); } catch {}
        await splitSend(sessionCtx, resText);
      });
      await ctx.reply("✏️ Send wallet address\\(es\\), space\\-separated:", MD);
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
