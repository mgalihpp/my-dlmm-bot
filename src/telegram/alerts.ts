import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Effect, Fiber, Schedule } from "effect";
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  tgPortfolioSummary,
  tgOpenPools,
  tgWatchlistAlert,
  escapeMarkdown,
  tgBold,
  formatNum,
} from "./format.js";
import { setInputSession } from "./input-store.js";
import { createWizard } from "./wizard-store.js";
import { renderStrategyStep, strategyKb } from "./handlers/create.js";
import { MD } from "./utils.js";
import { api, dlmm, resolveWallet, watchlist } from "./fx.js";
import { runtime } from "./runtime.js";
import type { OpenPool } from "../domain/index.js";

const STATE_FILE = join(process.cwd(), ".vexis-alerts.json");
const PNL_DROP_THRESHOLD = 0.1;
const PNL_POOL_THRESHOLD = 0.005;

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
  portfolioHours: number;
  positionCheckEnabled: boolean;
  lastPnlUsd: number | null;
  lastOpenSnapshot: PoolSnapshot[];
  watchlistEnabled: boolean;
  watchlistSnapshot: WalletPositionsSnapshot[];
}

type AlertFiber = Fiber.RuntimeFiber<unknown, unknown>;

export interface RuntimeAlerts {
  state: AlertState;
  portfolioFiber: AlertFiber | null;
  positionFiber: AlertFiber | null;
  watchlistFiber: AlertFiber | null;
}

function loadState(): AlertState {
  if (existsSync(STATE_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(STATE_FILE, "utf8"));
      delete raw.trackedPools;
      delete raw.lastPoolApr;
      return raw as AlertState;
    } catch {}
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

function toSnapshot(p: OpenPool): PoolSnapshot {
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

const scheduleLoop = (
  label: string,
  cronExpr: string,
  job: () => Promise<void>,
): AlertFiber =>
  runtime.runFork(
    Effect.tryPromise(job).pipe(
      Effect.catchAll((e) =>
        Effect.sync(() => {
          console.error(`[alerts] ${label} failed:`, e);
        }),
      ),
      Effect.schedule(Schedule.cron(cronExpr)),
    ),
  );

const stopFiber = (fiber: AlertFiber | null) => {
  if (fiber) runtime.runFork(Fiber.interrupt(fiber));
};

export function createAlerts(bot: Bot, chatId: string): RuntimeAlerts {
  const rt: RuntimeAlerts = {
    state: loadState(),
    portfolioFiber: null,
    positionFiber: null,
    watchlistFiber: null,
  };

  if (rt.state.portfolioHours > 0) {
    schedulePortfolio(rt, bot, chatId, rt.state.portfolioHours);
  }
  if (rt.state.positionCheckEnabled) {
    schedulePositionChecks(rt, bot, chatId);
  }
  if (rt.state.watchlistEnabled) {
    scheduleWatchlistChecks(rt, bot, chatId);
  }

  return rt;
}

function schedulePortfolio(rt: RuntimeAlerts, bot: Bot, chatId: string, hours: number) {
  stopFiber(rt.portfolioFiber);
  rt.portfolioFiber = scheduleLoop("portfolio", `0 */${Math.max(1, hours)} * * *`, async () => {
    const wallet = await resolveWallet();
    const total = await api.totalPnl(wallet);
    await bot.api.sendMessage(chatId, tgPortfolioSummary(total), MD);

    const pnl = parseFloat(total.totalPnlUsd);
    if (
      rt.state.lastPnlUsd !== null &&
      rt.state.lastPnlUsd > 0 &&
      pnl < rt.state.lastPnlUsd * (1 - PNL_DROP_THRESHOLD)
    ) {
      await bot.api.sendMessage(chatId, `⚠️ ${tgBold("PnL dropped >10%")} since last check`, MD);
    }
    rt.state.lastPnlUsd = pnl;
    saveState(rt.state);
  });
}

function schedulePositionChecks(rt: RuntimeAlerts, bot: Bot, chatId: string) {
  if (rt.positionFiber) return;

  rt.positionFiber = scheduleLoop("position-check", "*/15 * * * *", async () => {
    console.log("[position-check] Starting position check at", new Date().toISOString());
    const wallet = await resolveWallet();
    const res = await api.openPortfolio(wallet, 1, 100);
    let currentPools = await api.enrichOpenPortfolioPnl(res.pools ?? [], wallet);
    currentPools = await dlmm.attachLivePositions(currentPools, wallet);
    console.log("[position-check] API returned", currentPools.length, "pools");
    const prevSnapshots = rt.state.lastOpenSnapshot;
    console.log("[position-check] Previous snapshot has", prevSnapshots.length, "pools");
    const prevMap = new Map(prevSnapshots.map((s) => [s.poolAddress, s]));

    let newCount = 0,
      changedCount = 0;
    for (const pool of currentPools) {
      const prev = prevMap.get(pool.poolAddress);
      if (!prev) {
        newCount++;
        continue;
      }
      const curPnl = parseFloat(pool.pnl);
      const prePnl = parseFloat(prev.pnl);
      const pnlChanged = prePnl !== 0 && Math.abs(curPnl - prePnl) / Math.abs(prePnl) >= PNL_POOL_THRESHOLD;
      if (
        pnlChanged ||
        pool.balances !== prev.balances ||
        pool.unclaimedFees !== prev.unclaimedFees ||
        pool.openPositionCount !== prev.openPositionCount ||
        pool.outOfRange !== prev.outOfRange
      ) {
        changedCount++;
      }
    }

    const currentAddrs = new Set(currentPools.map((p) => p.poolAddress));
    const closedAddrs = prevSnapshots.filter((s) => !currentAddrs.has(s.poolAddress)).map((s) => s.poolAddress);

    try {
      if (currentPools.length > 0) {
        const totalBalance = currentPools.reduce((sum, p) => sum + parseFloat(p.balances || "0"), 0);
        const detail = tgOpenPools(currentPools).split("\n").slice(1).join("\n");
        const msg = [
          tgBold(`📈 Position Updates (${currentPools.length}) | Total: $${formatNum(totalBalance)}`),
          "",
          detail,
        ].join("\n");
        console.log(
          "[position-check] Sending position update, new:",
          newCount,
          "changed:",
          changedCount,
          "closed:",
          closedAddrs.length,
        );
        await bot.api.sendMessage(chatId, msg, MD);
      } else {
        console.log("[position-check] No open pools found, skipping send");
      }
    } catch (e) {
      console.error("[alerts] Failed to send alert:", e);
    }

    rt.state.lastOpenSnapshot = currentPools.map(toSnapshot);
    saveState(rt.state);
    console.log("[position-check] Snapshot saved with", currentPools.length, "pools");
  });
}

function scheduleWatchlistChecks(rt: RuntimeAlerts, bot: Bot, chatId: string) {
  stopFiber(rt.watchlistFiber);

  rt.watchlistFiber = scheduleLoop("watchlist", "*/5 * * * *", async () => {
    const wallets = await watchlist.list();
    if (wallets.length === 0) return;

    const prevAll = rt.state.watchlistSnapshot;
    const prevMap = new Map(prevAll.map((w) => [w.walletAddress, w]));
    const alerts: { msg: string; keyboard?: InlineKeyboard }[] = [];

    for (const w of wallets) {
      try {
        const res = await api.openPortfolio(w.address, 1, 100);
        const currentPools = await dlmm.attachLivePositions([...(res.pools ?? [])], w.address);
        const currentAddrs = new Set(currentPools.map((p) => p.poolAddress));
        const prev = prevMap.get(w.address);

        if (prev) {
          const prevAddrs = new Set(prev.pools.map((p) => p.poolAddress));

          for (const pool of currentPools) {
            if (!prevAddrs.has(pool.poolAddress)) {
              const kb = new InlineKeyboard().text("🚀 Create Position", `crt:alert:${pool.poolAddress}`);
              alerts.push({
                msg: tgWatchlistAlert(
                  "🆕 New Position",
                  w.address,
                  pool.tokenX,
                  pool.tokenY,
                  pool.poolAddress,
                  pool.openPositionCount,
                  {
                    pnl: pool.pnl,
                    pnlPctChange: pool.pnlPctChange,
                    pnlSol: pool.pnlSol,
                    pnlSolPctChange: pool.pnlSolPctChange,
                    balances: pool.balances,
                    fees: pool.unclaimedFees,
                    binStep: pool.binStep,
                    baseFee: String(pool.baseFee),
                    outOfRange: pool.outOfRange,
                  },
                ),
                keyboard: kb,
              });
            }
          }

          for (const p of prev.pools) {
            if (!currentAddrs.has(p.poolAddress)) {
              const kb = new InlineKeyboard();
              alerts.push({
                msg: tgWatchlistAlert(
                  "🔴 Position Closed",
                  w.address,
                  p.tokenX,
                  p.tokenY,
                  p.poolAddress,
                  p.openPositionCount,
                  {
                    prevPositionCount: p.openPositionCount,
                  },
                ),
                keyboard: kb,
              });
            }
          }
        } else {
          for (const pool of currentPools) {
            const kb = new InlineKeyboard().text("🚀 Create Position", `crt:alert:${pool.poolAddress}`);
            alerts.push({
              msg: tgWatchlistAlert(
                "🆕 New Position",
                w.address,
                pool.tokenX,
                pool.tokenY,
                pool.poolAddress,
                pool.openPositionCount,
                {
                  pnl: pool.pnl,
                  pnlPctChange: pool.pnlPctChange,
                  pnlSol: pool.pnlSol,
                  pnlSolPctChange: pool.pnlSolPctChange,
                  balances: pool.balances,
                  fees: pool.unclaimedFees,
                  binStep: pool.binStep,
                  baseFee: String(pool.baseFee),
                  outOfRange: pool.outOfRange,
                  listPositions: pool.listPositions,
                  positionsOutOfRange: pool.positionsOutOfRange,
                  positionsLive: pool.positionsLive,
                },
              ),
              keyboard: kb,
            });
          }
        }
      } catch {}
    }

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

    const snapshot: WalletPositionsSnapshot[] = [];
    for (const w of wallets) {
      try {
        const res = await api.openPortfolio(w.address, 1, 100);
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
        const existing = prevMap.get(w.address);
        if (existing) snapshot.push(existing);
      }
    }
    rt.state.watchlistSnapshot = snapshot;
    saveState(rt.state);
  });
}

export function registerAlertCommands(bot: Bot, chatId: string, rt: RuntimeAlerts) {
  bot.command("alerts", async (ctx) => {
    const s = rt.state;
    const wallets = await watchlist.list();
    const posStatus = s.positionCheckEnabled
      ? escapeMarkdown(`on (every 15m, ${s.lastOpenSnapshot.length} pools tracked)`)
      : "off";
    const wlStatus = s.watchlistEnabled
      ? escapeMarkdown(`on (every 5m, ${wallets.length} wallets tracked)`)
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
      schedulePortfolio(rt, bot, chatId, hours);
      await ctx.reply(`✅ Portfolio alert every ${escapeMarkdown(String(hours))}h`, MD);
      return;
    }
    if (kind === "position") {
      rt.state.positionCheckEnabled = true;
      rt.state.lastOpenSnapshot = [];
      saveState(rt.state);
      schedulePositionChecks(rt, bot, chatId);
      await ctx.reply(
        `✅ Position alerts enabled \\(every 15m\\)\nDetects: PnL ±0\\.5%\\, new/closed positions\\, balance changes\\, fee changes\\, out of range`,
        MD,
      );
      return;
    }
    if (kind === "watchlist") {
      rt.state.watchlistEnabled = true;
      rt.state.watchlistSnapshot = [];
      saveState(rt.state);
      scheduleWatchlistChecks(rt, bot, chatId);
      await ctx.reply(
        `✅ Watchlist alerts enabled \\(every 5m\\)\nDetects: new/closed positions for watched wallets`,
        MD,
      );
      return;
    }

    const kb = new InlineKeyboard()
      .text("📊 Portfolio", "setalert:type:portfolio")
      .row()
      .text("📈 Position", "setalert:type:position")
      .row()
      .text("👁️ Watchlist", "setalert:type:watchlist");
    await ctx.reply("Enable which alert?", { ...MD, reply_markup: kb });
  });

  bot.callbackQuery(/^setalert:type:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const type = ctx.match![1];
    if (type === "portfolio") {
      const kb = new InlineKeyboard()
        .text("1h", `setalert:hours:1`)
        .text("4h", `setalert:hours:4`)
        .row()
        .text("12h", `setalert:hours:12`)
        .text("24h", `setalert:hours:24`)
        .row()
        .text("✏️ Custom", "setalert:hours:custom");
      await ctx.editMessageText("Portfolio alert — select interval:", { ...MD, reply_markup: kb });
    } else if (type === "position") {
      rt.state.positionCheckEnabled = true;
      rt.state.lastOpenSnapshot = [];
      saveState(rt.state);
      schedulePositionChecks(rt, bot, chatId);
      await ctx.editMessageText(
        `✅ Position alerts enabled \\(every 15m\\)\nDetects: PnL ±0\\.5%\\, new/closed positions\\, balance changes\\, fee changes\\, out of range`,
        MD,
      );
    } else if (type === "watchlist") {
      rt.state.watchlistEnabled = true;
      rt.state.watchlistSnapshot = [];
      saveState(rt.state);
      scheduleWatchlistChecks(rt, bot, chatId);
      await ctx.editMessageText(
        `✅ Watchlist alerts enabled \\(every 5m\\)\nDetects: new/closed positions for watched wallets`,
        MD,
      );
    }
  });

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
        schedulePortfolio(rt, bot, chatId, hours);
        await sessionCtx.reply(`✅ Portfolio alert every ${escapeMarkdown(String(hours))}h`, MD);
      });
      await ctx.editMessageText("✏️ Send hours interval \\(e\\.g\\. 6\\):", MD);
      return;
    }
    const hours = parseInt(val, 10);
    if (Number.isNaN(hours) || hours < 1) return;
    rt.state.portfolioHours = hours;
    saveState(rt.state);
    schedulePortfolio(rt, bot, chatId, hours);
    await ctx.editMessageText(`✅ Portfolio alert every ${escapeMarkdown(String(hours))}h`, MD);
  });

  bot.command("stopalert", async (ctx) => {
    const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
    const [kind] = parts;

    if (kind === "portfolio") {
      rt.state.portfolioHours = 0;
      stopFiber(rt.portfolioFiber);
      rt.portfolioFiber = null;
      saveState(rt.state);
      await ctx.reply("✅ Portfolio alert disabled", MD);
      return;
    }
    if (kind === "position") {
      rt.state.positionCheckEnabled = false;
      stopFiber(rt.positionFiber);
      rt.positionFiber = null;
      saveState(rt.state);
      await ctx.reply("✅ Position alert disabled", MD);
      return;
    }
    if (kind === "watchlist") {
      rt.state.watchlistEnabled = false;
      stopFiber(rt.watchlistFiber);
      rt.watchlistFiber = null;
      saveState(rt.state);
      await ctx.reply("✅ Watchlist alert disabled", MD);
      return;
    }

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

  bot.callbackQuery(/^stopalert:type:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const kind = ctx.match![1];
    if (kind === "portfolio") {
      rt.state.portfolioHours = 0;
      stopFiber(rt.portfolioFiber);
      rt.portfolioFiber = null;
      saveState(rt.state);
      await ctx.editMessageText("✅ Portfolio alert disabled", MD);
    } else if (kind === "position") {
      rt.state.positionCheckEnabled = false;
      stopFiber(rt.positionFiber);
      rt.positionFiber = null;
      saveState(rt.state);
      await ctx.editMessageText("✅ Position alert disabled", MD);
    } else if (kind === "watchlist") {
      rt.state.watchlistEnabled = false;
      stopFiber(rt.watchlistFiber);
      rt.watchlistFiber = null;
      saveState(rt.state);
      await ctx.editMessageText("✅ Watchlist alert disabled", MD);
    }
  });

  bot.callbackQuery(/^crt:alert:(.+)$/, async (ctx) => {
    try {
      await ctx.answerCallbackQuery();
      const address = ctx.match![1];
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        await ctx.editMessageText("✖ Invalid pool address\\.", MD);
        return;
      }
      await ctx.editMessageText("⏳ Loading pool\\.\\.\\.", MD);
      const detail = await api.pool(address);
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
      await ctx
        .editMessageText(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, MD)
        .catch(() => {
          console.error("[alerts] crt:alert failed:", e);
        });
    }
  });
}
