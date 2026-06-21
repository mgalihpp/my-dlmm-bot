// Cron-based alert system: periodic portfolio summaries + smart pool/position
// change notifications. State persists to .vexis-alerts.json for restart recovery.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import cron, { type ScheduledTask } from "node-cron";
import type { Bot } from "grammy";
import type { MeteoraClient } from "../api.js";
import type { VexisConfig } from "../config.js";
import { resolveWallet } from "../config.js";
import { tgPortfolioSummary, tgPoolDetail, escapeMarkdown, tgBold } from "./format.js";

const MD = { parse_mode: "MarkdownV2" as const };
const STATE_FILE = join(process.cwd(), ".vexis-alerts.json");
const CHANGE_THRESHOLD = 0.2; // 20%
const PNL_DROP_THRESHOLD = 0.1; // 10%

interface AlertState {
  portfolioHours: number; // 0 = off
  trackedPools: string[];
  // last-known values for change detection
  lastPoolApr: Record<string, number>;
  lastPnlUsd: number | null;
}

interface RuntimeAlerts {
  state: AlertState;
  portfolioTask: ScheduledTask | null;
  poolTask: ScheduledTask | null;
}

function loadState(): AlertState {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, "utf8")) as AlertState;
    } catch {
      // fall through to defaults
    }
  }
  return { portfolioHours: 0, trackedPools: [], lastPoolApr: {}, lastPnlUsd: null };
}

function saveState(state: AlertState) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // best-effort persistence
  }
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
    poolTask: null,
  };

  // Restore portfolio schedule if persisted.
  if (rt.state.portfolioHours > 0) {
    schedulePortfolio(rt, bot, client, config, chatId, rt.state.portfolioHours);
  }
  // Always run the pool-tracking checker if any pools are tracked.
  if (rt.state.trackedPools.length > 0) {
    schedulePoolChecks(rt, bot, client, chatId);
  }

  return rt;
}

function schedulePortfolio(
  rt: RuntimeAlerts,
  bot: Bot,
  client: MeteoraClient,
  config: VexisConfig,
  chatId: string,
  hours: number
) {
  rt.portfolioTask?.stop();
  // Run at minute 7 of every `hours`-th hour.
  const expr = hours >= 24 ? "7 9 * * *" : `7 */${Math.max(1, hours)} * * *`;
  rt.portfolioTask = cron.schedule(expr, async () => {
    try {
      const wallet = resolveWallet(undefined, config);
      const total = await client.totalPnl(wallet);
      await bot.api.sendMessage(chatId, tgPortfolioSummary(total), MD);

      // Smart alert: PnL dropped sharply since last check.
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

function schedulePoolChecks(
  rt: RuntimeAlerts,
  bot: Bot,
  client: MeteoraClient,
  chatId: string
) {
  if (rt.poolTask) return; // single shared checker
  // Every 15 minutes.
  rt.poolTask = cron.schedule("*/15 * * * *", async () => {
    for (const addr of rt.state.trackedPools) {
      try {
        const pool = await client.pool(addr);
        const prev = rt.state.lastPoolApr[addr];
        const apr = pool.apr;
        if (
          prev !== undefined &&
          prev > 0 &&
          Math.abs(apr - prev) / prev >= CHANGE_THRESHOLD
        ) {
          const dir = apr > prev ? "📈 up" : "📉 down";
          await bot.api.sendMessage(
            chatId,
            `${escapeMarkdown(dir)} APR change on ${tgBold(pool.name)}\n${tgPoolDetail(pool)}`,
            MD
          );
        }
        rt.state.lastPoolApr[addr] = apr;
      } catch {
        // ignore individual pool errors
      }
    }
    saveState(rt.state);
  });
}

export function registerAlertCommands(
  bot: Bot,
  client: MeteoraClient,
  config: VexisConfig,
  chatId: string,
  rt: RuntimeAlerts
) {
  bot.command("alerts", async (ctx) => {
    const s = rt.state;
    const lines = [
      tgBold("🔔 Active Alerts"),
      "",
      `Portfolio: ${s.portfolioHours > 0 ? escapeMarkdown(`every ${s.portfolioHours}h`) : "off"}`,
      `Tracked pools: ${s.trackedPools.length === 0 ? "none" : escapeMarkdown(String(s.trackedPools.length))}`,
    ];
    for (const p of s.trackedPools) lines.push(`  • ${escapeMarkdown(p)}`);
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
    } else if (kind === "pool") {
      if (!arg) {
        await ctx.reply("Usage: `/setalert pool <address>`", MD);
        return;
      }
      if (!rt.state.trackedPools.includes(arg)) {
        rt.state.trackedPools.push(arg);
        saveState(rt.state);
        schedulePoolChecks(rt, bot, client, chatId);
      }
      await ctx.reply(`✅ Tracking pool ${escapeMarkdown(arg)}`, MD);
    } else {
      await ctx.reply("Usage: `/setalert portfolio <hours>` or `/setalert pool <address>`", MD);
    }
  });

  bot.command("stopalert", async (ctx) => {
    const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
    const [kind, arg] = parts;
    if (kind === "portfolio") {
      rt.state.portfolioHours = 0;
      rt.portfolioTask?.stop();
      rt.portfolioTask = null;
      saveState(rt.state);
      await ctx.reply("✅ Portfolio alert disabled", MD);
    } else if (kind === "pool" && arg) {
      rt.state.trackedPools = rt.state.trackedPools.filter((p) => p !== arg);
      delete rt.state.lastPoolApr[arg];
      saveState(rt.state);
      await ctx.reply(`✅ Stopped tracking ${escapeMarkdown(arg)}`, MD);
    } else {
      await ctx.reply("Usage: `/stopalert portfolio` or `/stopalert pool <address>`", MD);
    }
  });
}
