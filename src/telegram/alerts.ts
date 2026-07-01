// Cron-based alert system: periodic portfolio summaries + open position
// change notifications. State persists to .vexis-alerts.json for restart recovery.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import cron, { type ScheduledTask } from "node-cron";
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { MeteoraClient } from "../api.js";
import type { VexisConfig } from "../config.js";
import { resolveWallet } from "../config.js";
import {
  tgPortfolioSummary,
  tgOpenPools,
  tgWatchlistAlert,
  escapeMarkdown,
  tgBold,
  tgCode,
  tgUsd,
  formatNum,
} from "./format.js";
import { setInputSession } from "./input-store.js";
import { listWallets } from "../watchlist.js";
import { createWizard, getWizard } from "./wizard-store.js";
import { renderStrategyStep, strategyKb } from "./handlers/create.js";

const MD = { parse_mode: "MarkdownV2" as const };
const STATE_FILE = join(process.cwd(), ".vexis-alerts.json");
const PNL_DROP_THRESHOLD = 0.1; // 10% portfolio PnL drop
const PNL_POOL_THRESHOLD = 0.005; // 0.5% per-pool PnL change

interface PoolSnapshot {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  tokenXMint: string;
  tokenYMint: string;
  pnl: string;
  pnlPctChange: string;
  pnlSol: string | null;
  pnlSolPctChange: string | null;
  balances: string;
  unclaimedFees: string;
  openPositionCount: number;
  listPositions: string[];
  outOfRange: boolean | null;
}

interface WalletPoolEntry {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  openPositionCount: number;
}

interface WalletPositionsSnapshot {
  walletAddress: string;
  pools: WalletPoolEntry[];
}

interface AlertState {
  portfolioHours: number; // 0 = off
  positionCheckEnabled: boolean;
  lastPnlUsd: number | null;
  lastOpenSnapshot: PoolSnapshot[];
  watchlistEnabled: boolean;
  watchlistSnapshot: WalletPositionsSnapshot[];
}

interface RuntimeAlerts {
  state: AlertState;
  portfolioTask: ScheduledTask | null;
  positionTask: ScheduledTask | null;
  watchlistTask: ScheduledTask | null;
}

function loadState(): AlertState {
  if (existsSync(STATE_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(STATE_FILE, "utf8"));
      // Migration: remove old fields
      delete raw.trackedPools;
      delete raw.lastPoolApr;
      return raw as AlertState;
    } catch {
      // fall through to defaults
    }
  }
  return {
    portfolioHours: 0,
    positionCheckEnabled: false,
    lastPnlUsd: null,
    lastOpenSnapshot: [],
    watchlistEnabled: false,
    watchlistSnapshot: [],
  };
}

function saveState(state: AlertState) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn("[alerts] Failed to save state:", e);
  }
}

function toSnapshot(p: {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  tokenXMint: string;
  tokenYMint: string;
  pnl: string;
  pnlPctChange: string;
  pnlSol: string | null;
  pnlSolPctChange: string | null;
  balances: string;
  unclaimedFees: string;
  openPositionCount: number;
  listPositions: string[];
  outOfRange: boolean | null;
}): PoolSnapshot {
  return {
    poolAddress: p.poolAddress,
    tokenX: p.tokenX,
    tokenY: p.tokenY,
    tokenXMint: p.tokenXMint,
    tokenYMint: p.tokenYMint,
    pnl: p.pnl,
    pnlPctChange: p.pnlPctChange,
    pnlSol: p.pnlSol,
    pnlSolPctChange: p.pnlSolPctChange,
    balances: p.balances,
    unclaimedFees: p.unclaimedFees,
    openPositionCount: p.openPositionCount,
    listPositions: [...p.listPositions],
    outOfRange: p.outOfRange,
  };
}

export function createAlerts(
  bot: Bot,
  client: MeteoraClient,
  config: VexisConfig,
  chatId: string
): RuntimeAlerts {
  const rt: RuntimeAlerts = {
    state: loadState(),
    portfolioTask: null,
    positionTask: null,
    watchlistTask: null,
  };

  if (rt.state.portfolioHours > 0) {
    schedulePortfolio(rt, bot, client, config, chatId, rt.state.portfolioHours);
  }
  if (rt.state.positionCheckEnabled) {
    schedulePositionChecks(rt, bot, client, config, chatId);
  }
  if (rt.state.watchlistEnabled) {
    scheduleWatchlistChecks(rt, bot, client, config, chatId);
  }

  return rt;
}

// ─── Portfolio summary cron ─────────────────────────────────────────────────

function schedulePortfolio(
  rt: RuntimeAlerts,
  bot: Bot,
  client: MeteoraClient,
  config: VexisConfig,
  chatId: string,
  hours: number
) {
  rt.portfolioTask?.stop();
  const expr = hours >= 24 ? "7 9 * * *" : `7 */${Math.max(1, hours)} * * *`;
  rt.portfolioTask = cron.schedule(expr, async () => {
    try {
      const wallet = resolveWallet(undefined, config);
      const total = await client.totalPnl(wallet);
      await bot.api.sendMessage(chatId, tgPortfolioSummary(total), MD);

      const pnl = parseFloat(total.totalPnlUsd);
      if (
        rt.state.lastPnlUsd !== null &&
        rt.state.lastPnlUsd > 0 &&
        pnl < rt.state.lastPnlUsd * (1 - PNL_DROP_THRESHOLD)
      ) {
        await bot.api.sendMessage(
          chatId,
          `⚠️ ${tgBold("PnL dropped >10%")} since last check`,
          MD
        );
      }
      rt.state.lastPnlUsd = pnl;
      saveState(rt.state);
    } catch (e) {
      console.error("[alerts] Portfolio check failed:", e);
    }
  });
}

// ─── Open position change detection ─────────────────────────────────────────

function schedulePositionChecks(
  rt: RuntimeAlerts,
  bot: Bot,
  client: MeteoraClient,
  config: VexisConfig,
  chatId: string
) {
  if (rt.positionTask) return;

  rt.positionTask = cron.schedule("*/15 * * * *", async () => {
    try {
      console.log("[position-check] Starting position check at", new Date().toISOString());
      const wallet = resolveWallet(undefined, config);
      const res = await client.openPortfolio(wallet, 1, 100);
      const currentPools = res.pools ?? [];
      console.log("[position-check] API returned", currentPools.length, "pools");
      const prevSnapshots = rt.state.lastOpenSnapshot;
      console.log("[position-check] Previous snapshot has", prevSnapshots.length, "pools");
      const prevMap = new Map(prevSnapshots.map((s) => [s.poolAddress, s]));

      // Detect changes vs previous snapshot
      let newCount = 0, changedCount = 0;
      for (const pool of currentPools) {
        const prev = prevMap.get(pool.poolAddress);
        if (!prev) { newCount++; continue; }
        const curPnl = parseFloat(pool.pnl);
        const prePnl = parseFloat(prev.pnl);
        const pnlChanged = prePnl !== 0 && Math.abs(curPnl - prePnl) / Math.abs(prePnl) >= PNL_POOL_THRESHOLD;
        if (pnlChanged || pool.balances !== prev.balances || pool.unclaimedFees !== prev.unclaimedFees || pool.openPositionCount !== prev.openPositionCount || pool.outOfRange !== prev.outOfRange) {
          changedCount++;
        }
      }

      // Detect closed positions
      const currentAddrs = new Set(currentPools.map((p) => p.poolAddress));
      const closedAddrs = prevSnapshots.filter((s) => !currentAddrs.has(s.poolAddress)).map((s) => s.poolAddress);
      const summaryParts: string[] = [];
      if (newCount > 0) summaryParts.push(`${escapeMarkdown(String(newCount))} new`);
      if (changedCount > 0) summaryParts.push(`${escapeMarkdown(String(changedCount))} changed`);
      if (closedAddrs.length > 0) summaryParts.push(`${escapeMarkdown(String(closedAddrs.length))} closed`);

      try {
        if (currentPools.length > 0) {
          const totalBalance = currentPools.reduce((sum, p) => sum + parseFloat(p.balances || "0"), 0);
          const msg = tgBold(`📈 Open Positions (${currentPools.length}) | Total: ${tgUsd(totalBalance)}`);
          console.log("[position-check] Sending position update, new:", newCount, "changed:", changedCount, "closed:", closedAddrs.length);
          await bot.api.sendMessage(chatId, msg, MD);
        } else {
          console.log("[position-check] No open pools found, skipping send");
        }
      } catch (e) {
        console.error("[alerts] Failed to send alert:", e);
      }

      // Save current snapshot
      rt.state.lastOpenSnapshot = currentPools.map(toSnapshot);
      saveState(rt.state);
      console.log("[position-check] Snapshot saved with", currentPools.length, "pools");
    } catch (e) {
      console.error("Position alert check failed:", e);
    }
  });
}

// ─── Watchlist position change detection ──────────────────────────────────────

function scheduleWatchlistChecks(
  rt: RuntimeAlerts,
  bot: Bot,
  client: MeteoraClient,
  config: VexisConfig,
  chatId: string,
) {
  rt.watchlistTask?.stop();

  rt.watchlistTask = cron.schedule("*/5 * * * *", async () => {
    try {
      const wallets = listWallets();
      if (wallets.length === 0) return;

      const prevAll = rt.state.watchlistSnapshot;
      const prevMap = new Map(prevAll.map((w) => [w.walletAddress, w]));
      const alerts: { msg: string; keyboard?: InlineKeyboard }[] = [];

      for (const w of wallets) {
        try {
          const res = await client.openPortfolio(w.address, 1, 100);
          const currentPools = res.pools ?? [];
          const currentAddrs = new Set(currentPools.map((p) => p.poolAddress));
          const prev = prevMap.get(w.address);

          if (prev) {
            const prevAddrs = new Set(prev.pools.map((p) => p.poolAddress));

            // New positions
            for (const pool of currentPools) {
              if (!prevAddrs.has(pool.poolAddress)) {
                const kb = new InlineKeyboard()
                  .text("🚀 Create Position", `crt:alert:${pool.poolAddress}`);
                alerts.push({
                  msg: tgWatchlistAlert("🆕 New Position", w.address, pool.tokenX, pool.tokenY, pool.poolAddress, pool.openPositionCount, {
                    pnl: pool.pnl,
                    pnlPctChange: pool.pnlPctChange,
                    pnlSol: pool.pnlSol,
                    pnlSolPctChange: pool.pnlSolPctChange,
                    balances: pool.balances,
                    fees: pool.unclaimedFees,
                    binStep: pool.binStep,
                    baseFee: String(pool.baseFee),
                    outOfRange: pool.outOfRange,
                  }),
                  keyboard: kb,
                });
              }
            }

            // Closed positions
            for (const p of prev.pools) {
              if (!currentAddrs.has(p.poolAddress)) {
                const kb = new InlineKeyboard();
                alerts.push({
                  msg: tgWatchlistAlert("🔴 Position Closed", w.address, p.tokenX, p.tokenY, p.poolAddress, p.openPositionCount, {
                    prevPositionCount: p.openPositionCount,
                  }),
                  keyboard: kb,
                });
              }
            }
          } else {
            // First time seeing this wallet — treat all as new
            for (const pool of currentPools) {
              const kb = new InlineKeyboard()
                .text("🚀 Create Position", `crt:alert:${pool.poolAddress}`);
              alerts.push({
                msg: tgWatchlistAlert("🆕 New Position", w.address, pool.tokenX, pool.tokenY, pool.poolAddress, pool.openPositionCount, {
                  pnl: pool.pnl,
                  pnlPctChange: pool.pnlPctChange,
                  pnlSol: pool.pnlSol,
                  pnlSolPctChange: pool.pnlSolPctChange,
                  balances: pool.balances,
                  fees: pool.unclaimedFees,
                  binStep: pool.binStep,
                  baseFee: String(pool.baseFee),
                  outOfRange: pool.outOfRange,
                }),
                keyboard: kb,
              });
            }
          }
        } catch {
          // skip failed wallet, keep old snapshot
        }
      }

      // Send each watchlist alert as a separate message
      for (const alert of alerts) {
        try {
          await bot.api.sendMessage(chatId, alert.msg, {
            ...MD,
            reply_markup: alert.keyboard,
          });
        } catch (e) {
          console.error("[alerts] Failed to send watchlist alert:", e);
        }
      }

      // Refresh snapshot for all wallets
      const snapshot: WalletPositionsSnapshot[] = [];
      for (const w of wallets) {
        try {
          const res = await client.openPortfolio(w.address, 1, 100);
          snapshot.push({
            walletAddress: w.address,
            pools: (res.pools ?? []).map((p) => ({
              poolAddress: p.poolAddress,
              tokenX: p.tokenX,
              tokenY: p.tokenY,
              openPositionCount: p.openPositionCount,
            })),
          });
        } catch {
          // keep old snapshot for this wallet
          const existing = prevMap.get(w.address);
          if (existing) snapshot.push(existing);
        }
      }
      rt.state.watchlistSnapshot = snapshot;
      saveState(rt.state);
    } catch (e) {
      console.error("[alerts] Watchlist check failed:", e);
    }
  });
}

// ─── Bot commands ───────────────────────────────────────────────────────────

export function registerAlertCommands(
  bot: Bot,
  client: MeteoraClient,
  config: VexisConfig,
  chatId: string,
  rt: RuntimeAlerts
) {
  bot.command("alerts", async (ctx) => {
    const s = rt.state;
    const posStatus = s.positionCheckEnabled
      ? escapeMarkdown(`on (every 15m, ${s.lastOpenSnapshot.length} pools tracked)`)
      : "off";
    const wlStatus = s.watchlistEnabled
      ? escapeMarkdown(`on (every 5m, ${listWallets().length} wallets tracked)`)
      : "off";
    const lines = [
      tgBold("🔔 Active Alerts"),
      "",
      `Portfolio: ${s.portfolioHours > 0 ? escapeMarkdown(`every ${s.portfolioHours}h`) : "off"}`,
      `Position: ${posStatus}`,
      `Watchlist: ${wlStatus}`,
    ];
    await ctx.reply(lines.join("\n"), MD);
  });

  bot.command("setalert", async (ctx) => {
    const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
    const [kind, arg] = parts;

    if (kind === "portfolio") {
      const hours = parseInt(arg, 10);
      if (Number.isNaN(hours) || hours < 1) {
        await ctx.reply("Usage: `/setalert portfolio <hours>`", MD);
        return;
      }
      rt.state.portfolioHours = hours;
      saveState(rt.state);
      schedulePortfolio(rt, bot, client, config, chatId, hours);
      await ctx.reply(`✅ Portfolio alert every ${escapeMarkdown(String(hours))}h`, MD);
      return;
    }
    if (kind === "position") {
      rt.state.positionCheckEnabled = true;
      rt.state.lastOpenSnapshot = [];
      saveState(rt.state);
      schedulePositionChecks(rt, bot, client, config, chatId);
      await ctx.reply(
        `✅ Position alerts enabled \\(every 15m\\)\nDetects: PnL ±0\\.5%\\, new/closed positions\\, balance changes\\, fee changes\\, out of range`,
        MD
      );
      return;
    }
    if (kind === "watchlist") {
      rt.state.watchlistEnabled = true;
      rt.state.watchlistSnapshot = [];
      saveState(rt.state);
      scheduleWatchlistChecks(rt, bot, client, config, chatId);
      await ctx.reply(
        `✅ Watchlist alerts enabled \\(every 5m\\)\nDetects: new/closed positions for watched wallets`,
        MD
      );
      return;
    }

    // No args — interactive selection
    const kb = new InlineKeyboard()
      .text("📊 Portfolio", "setalert:type:portfolio")
      .row()
      .text("📈 Position", "setalert:type:position")
      .row()
      .text("👁️ Watchlist", "setalert:type:watchlist");
    await ctx.reply("Enable which alert?", { ...MD, reply_markup: kb });
  });

  // ─── setalert:type:portfolio — show hours selection ─────────────────────
  bot.callbackQuery(/^setalert:type:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const type = ctx.match![1];
    if (type === "portfolio") {
      const kb = new InlineKeyboard()
        .text("1h", `setalert:hours:1`).text("4h", `setalert:hours:4`).row()
        .text("12h", `setalert:hours:12`).text("24h", `setalert:hours:24`).row()
        .text("✏️ Custom", "setalert:hours:custom");
      await ctx.editMessageText("Portfolio alert — select interval:", { ...MD, reply_markup: kb });
    } else if (type === "position") {
      rt.state.positionCheckEnabled = true;
      rt.state.lastOpenSnapshot = [];
      saveState(rt.state);
      schedulePositionChecks(rt, bot, client, config, chatId);
      await ctx.editMessageText(
        `✅ Position alerts enabled \\(every 15m\\)\nDetects: PnL ±0\\.5%\\, new/closed positions\\, balance changes\\, fee changes\\, out of range`,
        MD
      );
    } else if (type === "watchlist") {
      rt.state.watchlistEnabled = true;
      rt.state.watchlistSnapshot = [];
      saveState(rt.state);
      scheduleWatchlistChecks(rt, bot, client, config, chatId);
      await ctx.editMessageText(
        `✅ Watchlist alerts enabled \\(every 5m\\)\nDetects: new/closed positions for watched wallets`,
        MD
      );
    }
  });

  // ─── setalert:hours:<n> — set portfolio hours ────────────────────────────
  bot.callbackQuery(/^setalert:hours:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const val = ctx.match![1];
    if (val === "custom") {
      const chatIdCapture = String(ctx.chat?.id ?? ctx.from?.id);
      setInputSession(chatIdCapture, async (text, sessionCtx) => {
        const hours = parseInt(text, 10);
        if (Number.isNaN(hours) || hours < 1) {
          await sessionCtx.reply("✖ Invalid number\\. Send hours \\(e\\.g\\. 4\\):", MD);
          return;
        }
        rt.state.portfolioHours = hours;
        saveState(rt.state);
        schedulePortfolio(rt, bot, client, config, chatId, hours);
        await sessionCtx.reply(`✅ Portfolio alert every ${escapeMarkdown(String(hours))}h`, MD);
      });
      await ctx.editMessageText("✏️ Send hours interval \\(e\\.g\\. 6\\):", MD);
      return;
    }
    const hours = parseInt(val, 10);
    if (Number.isNaN(hours) || hours < 1) return;
    rt.state.portfolioHours = hours;
    saveState(rt.state);
    schedulePortfolio(rt, bot, client, config, chatId, hours);
    await ctx.editMessageText(`✅ Portfolio alert every ${escapeMarkdown(String(hours))}h`, MD);
  });

  bot.command("stopalert", async (ctx) => {
    const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
    const [kind] = parts;

    if (kind === "portfolio") {
      rt.state.portfolioHours = 0;
      rt.portfolioTask?.stop();
      rt.portfolioTask = null;
      saveState(rt.state);
      await ctx.reply("✅ Portfolio alert disabled", MD);
      return;
    }
    if (kind === "position") {
      rt.state.positionCheckEnabled = false;
      rt.positionTask?.stop();
      rt.positionTask = null;
      saveState(rt.state);
      await ctx.reply("✅ Position alert disabled", MD);
      return;
    }
    if (kind === "watchlist") {
      rt.state.watchlistEnabled = false;
      rt.watchlistTask?.stop();
      rt.watchlistTask = null;
      saveState(rt.state);
      await ctx.reply("✅ Watchlist alert disabled", MD);
      return;
    }

    // No args — show active alerts as buttons
    const kb = new InlineKeyboard();
    let hasActive = false;
    if (rt.state.portfolioHours > 0) {
      kb.text("📊 Portfolio", "stopalert:type:portfolio").row();
      hasActive = true;
    }
    if (rt.state.positionCheckEnabled) {
      kb.text("📈 Position", "stopalert:type:position").row();
      hasActive = true;
    }
    if (rt.state.watchlistEnabled) {
      kb.text("👁️ Watchlist", "stopalert:type:watchlist").row();
      hasActive = true;
    }
    if (!hasActive) {
      await ctx.reply("No active alerts\\. Use /setalert to enable one\\.", MD);
      return;
    }
    await ctx.reply("Disable which alert?", { ...MD, reply_markup: kb });
  });

  // ─── stopalert:type:<kind> — stop specific alert ─────────────────────────
  bot.callbackQuery(/^stopalert:type:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const kind = ctx.match![1];
    if (kind === "portfolio") {
      rt.state.portfolioHours = 0;
      rt.portfolioTask?.stop();
      rt.portfolioTask = null;
      saveState(rt.state);
      await ctx.editMessageText("✅ Portfolio alert disabled", MD);
    } else if (kind === "position") {
      rt.state.positionCheckEnabled = false;
      rt.positionTask?.stop();
      rt.positionTask = null;
      saveState(rt.state);
      await ctx.editMessageText("✅ Position alert disabled", MD);
    } else if (kind === "watchlist") {
      rt.state.watchlistEnabled = false;
      rt.watchlistTask?.stop();
      rt.watchlistTask = null;
      saveState(rt.state);
      await ctx.editMessageText("✅ Watchlist alert disabled", MD);
    }
  });

  // ─── crt:alert:<pool> — direct create from watchlist alert ───────────────
  bot.callbackQuery(/^crt:alert:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const address = ctx.match![1];
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      await ctx.editMessageText("✖ Invalid pool address.", MD);
      return;
    }
    await ctx.editMessageText("⏳ Loading pool...", MD);
    try {
      const detail = await client.pool(address);
      const wid = createWizard({
        poolAddress: detail.address,
        poolName: detail.name,
        binStep: detail.pool_config.bin_step,
        currentPrice: detail.current_price,
        tvl: detail.tvl,
        volume24h: detail.volume["24h"],
        holders: detail.token_x.holders,
        baseFeePct: detail.pool_config.base_fee_pct,
      });
      await ctx.editMessageText(await renderStrategyStep(wid), {
        ...MD,
        reply_markup: strategyKb(wid),
      });
    } catch (e) {
      await ctx.editMessageText(
        `✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`,
        MD,
      );
    }
  });
}
