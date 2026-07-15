import { Bot, Context, InlineKeyboard } from "grammy";
import { api, dlmm, screenPools, resolveWallet, watchlist } from "./fx.js";
import {
  tgPortfolioSummary,
  tgOpenPools,
  tgClosedPools,
  tgScreenedPoolList,
  escapeMarkdown,
  tgBold,
  type WalletPositions,
} from "./format.js";
import { MD } from "./utils.js";

export function registerMenu(bot: Bot) {
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
      const wallet = await resolveWallet();
      const total = await api.totalPnl(wallet);
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
      const wallet = await resolveWallet();
      const res = await api.openPortfolio(wallet, 1, 10);
      const enriched = await api.enrichOpenPortfolioPnl(res.pools, wallet);
      await dlmm.attachLivePositions(enriched, wallet);
      const text = tgOpenPools(enriched);
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
      const wallet = await resolveWallet();
      const res = await api.closedPortfolio(wallet, 1, 10);
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
    await ctx.editMessageText("⏳ Screening pools\\.\\.\\.", MD);
    try {
      const result = await screenPools();
      const text = tgScreenedPoolList(result);
      await ctx.editMessageText(text, { ...MD, reply_markup: backKeyboard("main") });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, { ...MD, reply_markup: backKeyboard("main") });
    }
  });

  // ─── Watchlist ───────────────────────────────────────────────────────────
  bot.callbackQuery(/^menu:watchlist$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const text = [
      tgBold("👁️ Watchlist"),
      "",
      "`/watchadd <wallet> [label]` — add wallet",
      "`/watchremove <wallet>` — remove wallet",
      "`/watchlist` — list watched wallets",
      "`/watchpositions` — all wallet positions",
      "`/wallets <w1> [w2]...` — query any wallets",
      "",
    ].join("\n");
    const kb = new InlineKeyboard()
      .text("📋 List Wallets", "menu:watchlist_list")
      .text("📈 Positions", "menu:watchlist_positions")
      .row()
      .text("⬅️ Back", "menu:main");
    await ctx.editMessageText(text, { ...MD, reply_markup: kb });
  });

  bot.callbackQuery(/^menu:watchlist_list$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wallets = await watchlist.list();
    const { tgWatchedList } = await import("./format.js");
    const text = tgWatchedList(wallets);
    const kb = new InlineKeyboard()
      .text("📈 Positions", "menu:watchlist_positions")
      .row()
      .text("⬅️ Watchlist", "menu:watchlist");
    await ctx.editMessageText(text, { ...MD, reply_markup: kb });
  });

  bot.callbackQuery(/^menu:watchlist_positions$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Loading positions\\.\\.\\.", MD);
    try {
      const wallets = await watchlist.list();
      const { tgMultiWalletPositions } = await import("./format.js");
      const results: WalletPositions[] = [];
      for (const w of wallets) {
        try {
          const res = await api.openPortfolio(w.address, 1, 10);
          const pools = [...(res.pools ?? [])];
          await dlmm.attachLivePositions(pools, w.address);
          results.push({ wallet: w, pools });
        } catch {
          results.push({ wallet: w, pools: [] });
        }
      }
      const text = tgMultiWalletPositions(results);
      const kb = new InlineKeyboard()
        .text("🔄 Refresh", "menu:watchlist_positions")
        .row()
        .text("⬅️ Watchlist", "menu:watchlist");
      await ctx.editMessageText(text, { ...MD, reply_markup: kb });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, { ...MD, reply_markup: backKeyboard("watchlist") });
    }
  });

  // ─── Alerts ──────────────────────────────────────────────────────────────
  bot.callbackQuery(/^menu:alerts$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const text = [
      tgBold("🔔 Alert Commands"),
      "",
      "`/setalert portfolio <hours>` — periodic portfolio summary",
      "`/setalert position` — track open positions \\(15m\\)",
      "`/stopalert portfolio` — disable portfolio alert",
      "`/stopalert position` — disable position alert",
      "`/alerts` — show active alerts",
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
      "`/manage` — position manager",
      "`/create` — create position",
      "`/close` — close \\+ zap out to SOL",
      "`/addliq` — add liquidity",
      "`/removeliq` — remove liquidity",
      "`/claimfee` — claim fees",
      "`/claimreward` — claim rewards",
      "",
      tgBold("Watchlist"),
      "`/watchadd <wallet>` — add to watchlist",
      "`/watchremove <wallet>` — remove from watchlist",
      "`/watchlist` — list watched wallets",
      "`/watchpositions` — all wallet positions",
      "`/wallets <w1> [w2]...` — query any wallets",
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
    .text("⚡ Manage", "mng:pools")
    .text("🔥 Pools", "menu:pools")
    .text("🔔 Alerts", "menu:alerts")
    .row()
    .text("👁️ Watch", "menu:watchlist")
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
    "Select a menu:",
  ].join("\n");
}
