// Cron-based alert system: periodic portfolio summaries + open position
// change notifications. State persists to .vexis-alerts.json for restart recovery.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import cron, { type ScheduledTask } from "node-cron";
import type { Bot } from "grammy";
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
  } catch {
    // best-effort persistence
  }
}

function toSnapshot(p: {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  pnl: string;
  pnlPctChange: string;
  pnlSol: string | null;
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
    } catch {
      // swallow — don't crash the scheduler
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
              balances: pool.balances,
              fees: pool.unclaimedFees,
              positions: pool.openPositionCount,
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
                balances: pool.balances,
                fees: pool.unclaimedFees,
                positions: pool.openPositionCount,
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
              balances: pool.balances,
              fees: pool.unclaimedFees,
              positions: pool.openPositionCount,
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
              balances: "0",
              fees: "0",
              positions: 0,
              outOfRange: null,
            }),
            poolAddr: prev.poolAddress,
          });
        }
      }

      // Fetch pool detail and send combined messages
      for (const alert of alerts) {
        let fullMsg = alert.msg;
        try {
          const poolDetail = await client.pool(alert.poolAddr);
          fullMsg += `\n${tgPoolDetail(poolDetail)}`;
        } catch {
          // pool detail fetch failed — send position alert without pool detail
        }
        await bot.api.sendMessage(chatId, fullMsg, MD);
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
    } else if (kind === "position") {
      rt.state.positionCheckEnabled = true;
      rt.state.lastOpenSnapshot = []; // reset snapshot so first check sends initial notifications
      saveState(rt.state);
      schedulePositionChecks(rt, bot, client, config, chatId);
      await ctx.reply(
        `✅ Position alerts enabled \\(every 15m\\)\nDetects: PnL ±0\\.5%\\, new/closed positions\\, balance changes\\, fee changes\\, out of range`,
        MD
      );
    } else {
      await ctx.reply(
        "Usage:\n`/setalert portfolio <hours>`\n`/setalert position`",
        MD
      );
    }
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
    } else if (kind === "position") {
      rt.state.positionCheckEnabled = false;
      rt.positionTask?.stop();
      rt.positionTask = null;
      saveState(rt.state);
      await ctx.reply("✅ Position alert disabled", MD);
    } else {
      await ctx.reply(
        "Usage:\n`/stopalert portfolio`\n`/stopalert position`",
        MD
      );
    }
  });
}
