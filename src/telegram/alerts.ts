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
  tgPositionAlert,
  tgPoolDetail,
  escapeMarkdown,
  tgBold,
} from "./format.js";
import { setInputSession } from "./input-store.js";

const MD = { parse_mode: "MarkdownV2" as const };
const STATE_FILE = join(process.cwd(), ".vexis-alerts.json");
const PNL_DROP_THRESHOLD = 0.1; // 10% portfolio PnL drop
const PNL_POOL_THRESHOLD = 0.005; // 0.5% per-pool PnL change

interface PoolSnapshot {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
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

interface AlertState {
  portfolioHours: number; // 0 = off
  positionCheckEnabled: boolean;
  lastPnlUsd: number | null;
  lastOpenSnapshot: PoolSnapshot[];
}

interface RuntimeAlerts {
  state: AlertState;
  portfolioTask: ScheduledTask | null;
  positionTask: ScheduledTask | null;
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
  };

  if (rt.state.portfolioHours > 0) {
    schedulePortfolio(rt, bot, client, config, chatId, rt.state.portfolioHours);
  }
  if (rt.state.positionCheckEnabled) {
    schedulePositionChecks(rt, bot, client, config, chatId);
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
      const wallet = resolveWallet(undefined, config);
      const res = await client.openPortfolio(wallet, 1, 100);
      const currentPools = res.pools;
      const prevSnapshots = rt.state.lastOpenSnapshot;
      const prevMap = new Map(prevSnapshots.map((s) => [s.poolAddress, s]));

      const alerts: { msg: string; poolAddr: string }[] = [];

      for (const pool of currentPools) {
        const prev = prevMap.get(pool.poolAddress);

        if (!prev) {
          alerts.push({
            msg: tgPositionAlert("🆕 New Position", pool.tokenX, pool.tokenY, pool.poolAddress, {
              pnl: pool.pnl,
              pnlPctChange: pool.pnlPctChange,
              pnlSol: pool.pnlSol,
              pnlSolPctChange: pool.pnlSolPctChange,
              balances: pool.balances,
              fees: pool.unclaimedFees,
              positions: pool.openPositionCount,
              listPositions: pool.listPositions,
              outOfRange: pool.outOfRange,
            }),
            poolAddr: pool.poolAddress,
          });
          continue;
        }

        // Check per-pool PnL change ≥ 0.5%
        const curPnl = parseFloat(pool.pnl);
        const prePnl = parseFloat(prev.pnl);
        if (prePnl !== 0) {
          const pnlChange = Math.abs(curPnl - prePnl) / Math.abs(prePnl);
          if (pnlChange >= PNL_POOL_THRESHOLD) {
            const dir = curPnl > prePnl ? "📈 PnL Up" : "📉 PnL Down";
            alerts.push({
              msg: tgPositionAlert(dir, pool.tokenX, pool.tokenY, pool.poolAddress, {
                pnl: pool.pnl,
                pnlPctChange: pool.pnlPctChange,
                pnlSol: pool.pnlSol,
                pnlSolPctChange: pool.pnlSolPctChange,
                balances: pool.balances,
                fees: pool.unclaimedFees,
                positions: pool.openPositionCount,
                listPositions: pool.listPositions,
                outOfRange: pool.outOfRange,
                prevPnl: prev.pnl,
              }),
              poolAddr: pool.poolAddress,
            });
            continue;
          }
        }

        // Check other changes
        const changes: string[] = [];

        if (pool.balances !== prev.balances) {
          changes.push("💰 Balance changed");
        }
        if (pool.unclaimedFees !== prev.unclaimedFees) {
          changes.push("💎 Fees changed");
        }
        if (pool.openPositionCount !== prev.openPositionCount) {
          changes.push(
            `📋 Positions: ${prev.openPositionCount} → ${pool.openPositionCount}`
          );
        }
        if (pool.outOfRange !== prev.outOfRange) {
          if (pool.outOfRange) {
            changes.push("⚠️ Out of range");
          } else {
            changes.push("✅ Back in range");
          }
        }

        if (changes.length > 0) {
          alerts.push({
            msg: tgPositionAlert(changes[0], pool.tokenX, pool.tokenY, pool.poolAddress, {
              pnl: pool.pnl,
              pnlPctChange: pool.pnlPctChange,
              pnlSol: pool.pnlSol,
              pnlSolPctChange: pool.pnlSolPctChange,
              balances: pool.balances,
              fees: pool.unclaimedFees,
              positions: pool.openPositionCount,
              listPositions: pool.listPositions,
              outOfRange: pool.outOfRange,
            }),
            poolAddr: pool.poolAddress,
          });
        }
      }

      // Check for removed pools (closed positions)
      const currentAddrs = new Set(currentPools.map((p) => p.poolAddress));
      for (const prev of prevSnapshots) {
        if (!currentAddrs.has(prev.poolAddress)) {
          alerts.push({
            msg: tgPositionAlert("🔴 Position Closed", prev.tokenX, prev.tokenY, prev.poolAddress, {
              pnl: prev.pnl,
              pnlPctChange: prev.pnlPctChange,
              pnlSol: prev.pnlSol,
              pnlSolPctChange: prev.pnlSolPctChange,
              balances: "0",
              fees: "0",
              positions: prev.openPositionCount,
              listPositions: prev.listPositions,
              outOfRange: null,
            }),
            poolAddr: prev.poolAddress,
          });
        }
      }

      // Fetch pool details in parallel, then send all alerts as one message
      if (alerts.length > 0) {
        const fullMsgs = await Promise.all(
          alerts.map(async (alert) => {
            let msg = alert.msg;
            try {
              const poolDetail = await client.pool(alert.poolAddr);
              msg += `\n${tgPoolDetail(poolDetail)}`;
            } catch {
              // pool detail fetch failed — send position alert without pool detail
            }
            return msg;
          })
        );
        const combined = fullMsgs.join("\n\n─────────────────────\n\n");
        await bot.api.sendMessage(chatId, combined, MD);
      }

      // Save current snapshot
      rt.state.lastOpenSnapshot = currentPools.map(toSnapshot);
      saveState(rt.state);
    } catch (e) {
      console.error("Position alert check failed:", e);
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
    const lines = [
      tgBold("🔔 Active Alerts"),
      "",
      `Portfolio: ${s.portfolioHours > 0 ? escapeMarkdown(`every ${s.portfolioHours}h`) : "off"}`,
      `Position: ${posStatus}`,
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

    // No args — interactive selection
    const kb = new InlineKeyboard()
      .text("📊 Portfolio", "setalert:type:portfolio")
      .row()
      .text("📈 Position", "setalert:type:position");
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
    }
  });
}
