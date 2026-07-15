import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import { api, screenPools } from "../fx.js";
import { tgScreenedPoolList, tgPoolDetail, escapeMarkdown } from "../format.js";
import { MD, replyError } from "../utils.js";
import { parseTimeframe } from "../../lib/screening.js";
import { setInputSession } from "../input-store.js";

const TIMEFRAMES = ["5m", "30m", "1h", "2h", "4h", "12h", "24h"] as const;

export function registerPool(bot: Bot) {
  // ─── /pools — show pool list ─────────────────────────────────────────────
  bot.command("pools", async (ctx) => {
    try {
      const rawArg = (ctx.match as string)?.trim();
      const timeframe = parseTimeframe(rawArg);

      if (rawArg && !timeframe) {
        await ctx.reply("Usage: `/pools` or `/pools <timeframe>`\nValid timeframes: 5m, 30m, 1h, 2h, 4h, 12h, 24h", MD);
        return;
      }

      if (rawArg && timeframe) {
        // Has timeframe arg — direct fetch
        const result = await screenPools({ timeframe });
        await ctx.reply(tgScreenedPoolList(result), MD);
        return;
      }

      // No args — show timeframe selection
      const kb = new InlineKeyboard();
      for (const tf of TIMEFRAMES) {
        kb.text(tf, `pool:tf:${tf}`);
      }
      await ctx.reply("Select timeframe:", { ...MD, reply_markup: kb });
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── pool:tf:<timeframe> — show pools for selected timeframe ────────────
  bot.callbackQuery(/^pool:tf:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tf = ctx.match![1] as typeof TIMEFRAMES[number];
    await ctx.editMessageText("⏳ Screening pools\\.\\.\\.", MD);
    try {
      const result = await screenPools({ timeframe: tf });
      await ctx.editMessageText(tgScreenedPoolList(result), MD);
    } catch (e) {
      await ctx.editMessageText(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, MD);
    }
  });

  // ─── /pool — show pool detail ────────────────────────────────────────────
  bot.command("pool", async (ctx) => {
    try {
      const address = (ctx.match as string)?.trim();
      if (address) {
        // Has address arg — direct fetch
        const pool = await api.pool(address);
        await ctx.reply(tgPoolDetail(pool), MD);
        return;
      }

      // No args — prompt for address
      const chatId = String(ctx.chat?.id ?? ctx.from?.id);
      setInputSession(chatId, async (text, sessionCtx) => {
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text)) {
          await sessionCtx.reply("✖ Invalid pool address\\. Send a valid Solana address:", MD);
          return;
        }
        try {
          const pool = await api.pool(text);
          await sessionCtx.reply(tgPoolDetail(pool), MD);
        } catch (e) {
          await sessionCtx.reply(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, MD);
        }
      });
      await ctx.reply("✏️ Send pool address:", MD);
    } catch (e) {
      await replyError(ctx, e);
    }
  });
}
