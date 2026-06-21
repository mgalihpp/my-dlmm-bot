import { Bot, Context, InlineKeyboard } from "grammy";
import type { MeteoraClient } from "../api.js";
import type { VexisConfig } from "../config.js";
import { resolveWallet } from "../config.js";
import {
  tgPortfolioSummary,
  tgOpenPools,
  tgClosedPools,
  tgPoolList,
  escapeMarkdown,
  tgBold,
} from "./format.js";

const MD = { parse_mode: "MarkdownV2" as const };

export function registerMenu(bot: Bot, client: MeteoraClient, config: VexisConfig) {
  bot.command("menu", async (ctx) => {
    await ctx.reply(mainMenu(), { ...MD, reply_markup: mainMenuKeyboard() });
  });

  // ─── Main menu callback ──────────────────────────────────────────────────
  bot.callbackQuery(/^menu:main$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(mainMenu(), { ...MD, reply_markup: mainMenuKeyboard() });
  });

  // ─── Portfolio ───────────────────────────────────────────────────────────
  bot.callbackQuery(/^menu:portfolio$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Loading portfolio\\.\\.\\.", MD);
    try {
      const wallet = resolveWallet(undefined, config);
      const total = await client.totalPnl(wallet);
      const text = tgPortfolioSummary(total);
      await ctx.editMessageText(text, { ...MD, reply_markup: backKeyboard("main") });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, { ...MD, reply_markup: backKeyboard("main") });
    }
  });

  // ─── Open positions ──────────────────────────────────────────────────────
  bot.callbackQuery(/^menu:open$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Loading positions\\.\\.\\.", MD);
    try {
      const wallet = resolveWallet(undefined, config);
      const res = await client.openPortfolio(wallet, 1, 10);
      const text = tgOpenPools(res.pools);
      await ctx.editMessageText(text, { ...MD, reply_markup: backKeyboard("main") });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, { ...MD, reply_markup: backKeyboard("main") });
    }
  });

  // ─── Closed positions ────────────────────────────────────────────────────
  bot.callbackQuery(/^menu:closed$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Loading\\.\\.\\.", MD);
    try {
      const wallet = resolveWallet(undefined, config);
      const res = await client.closedPortfolio(wallet, 1, 10);
      const text = tgClosedPools(res.pools);
      await ctx.editMessageText(text, { ...MD, reply_markup: backKeyboard("main") });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, { ...MD, reply_markup: backKeyboard("main") });
    }
  });

  // ─── Pools ───────────────────────────────────────────────────────────────
  bot.callbackQuery(/^menu:pools$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Loading pools\\.\\.\\.", MD);
    try {
      const res = await client.pools({ pageSize: 10, minMarketCap: 100000, minHolders: 500 });
      const text = tgPoolList(res.data);
      await ctx.editMessageText(text, { ...MD, reply_markup: backKeyboard("main") });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, { ...MD, reply_markup: backKeyboard("main") });
    }
  });

  // ─── Alerts ──────────────────────────────────────────────────────────────
  bot.callbackQuery(/^menu:alerts$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const text = [
      tgBold("🔔 Alert Commands"),
      "",
      "`/setalert portfolio <hours>` — summary periodik",
      "`/setalert position` — track open positions \\(15m\\)",
      "`/stopalert portfolio` — matikan portfolio alert",
      "`/stopalert position` — matikan position alert",
      "`/alerts` — lihat alert aktif",
    ].join("\n");
    await ctx.editMessageText(text, { ...MD, reply_markup: backKeyboard("main") });
  });

  // ─── Commands list ───────────────────────────────────────────────────────
  bot.callbackQuery(/^menu:commands$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const text = [
      tgBold("📋 All Commands"),
      "",
      tgBold("Read-only"),
      "`/portfolio` — total PnL",
      "`/open` — open positions",
      "`/closed` — closed positions",
      "`/pools` — top pools",
      "`/pool <addr>` — pool detail",
      "",
      tgBold("On-chain"),
      "`/create` — create position",
      "`/close` — close \\+ zap out to SOL",
      "`/addliq` — add liquidity",
      "`/removeliq` — remove liquidity",
      "`/claimfee` — claim fees",
      "`/claimreward` — claim rewards",
      "",
      tgBold("Alerts"),
      "`/setalert` — enable alerts",
      "`/stopalert` — disable alerts",
      "`/alerts` — show active alerts",
    ].join("\n");
    await ctx.editMessageText(text, { ...MD, reply_markup: backKeyboard("main") });
  });
}

// ─── Keyboard builders ─────────────────────────────────────────────────────

function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📊 Portfolio", "menu:portfolio")
    .text("📈 Open", "menu:open")
    .text("📉 Closed", "menu:closed")
    .row()
    .text("🔥 Pools", "menu:pools")
    .text("🔔 Alerts", "menu:alerts")
    .row()
    .text("📋 Commands", "menu:commands");
}

function backKeyboard(target: string): { inline_keyboard: any[][] } {
  return {
    inline_keyboard: [[{ text: "⬅️ Back", callback_data: `menu:${target}` }]],
  };
}

function mainMenu(): string {
  return [
    tgBold("🤖 Vexis DLMM Bot"),
    "",
    "Pilih menu:",
  ].join("\n");
}
