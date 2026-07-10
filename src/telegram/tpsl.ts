// Stop Loss / Take Profit alerts. Global thresholds read from vexis.config.json
// (stopLossPct / takeProfitPct), applied automatically to ALL open positions.
// A cron polls open positions every minute; when a position's SOL-denominated
// PnL % crosses a threshold it sends a Telegram alert with a "Close & Zap Out"
// button (reusing the existing mng:close flow). No auto-signing — the user
// confirms the close. Only per-position trigger flags persist (for dedup) to
// .vexis-tpsl.json; the thresholds themselves live in the config file.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import cron, { type ScheduledTask } from "node-cron";
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { MeteoraClient } from "../api.js";
import type { VexisConfig } from "../config.js";
import { resolveWallet } from "../config.js";
import { escapeMarkdown, tgBold, tgCode, tgPct } from "./format.js";
import { MD } from "./utils.js";
import { registerAction } from "./action-store.js";

const STATE_FILE = join(process.cwd(), ".vexis-tpsl.json");
const CRON_EXPR = "* * * * *"; // every minute

interface TriggerFlags {
  sl: boolean;
  tp: boolean;
}

interface TpSlState {
  // positionAddress → which side has already fired (dedup)
  triggered: Record<string, TriggerFlags>;
}

interface RuntimeTpSl {
  state: TpSlState;
  task: ScheduledTask | null;
}

function loadState(): TpSlState {
  if (existsSync(STATE_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(STATE_FILE, "utf8"));
      return { triggered: raw.triggered && typeof raw.triggered === "object" ? raw.triggered : {} };
    } catch {
      // fall through to defaults
    }
  }
  return { triggered: {} };
}

function saveState(state: TpSlState) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn("[tpsl] Failed to save state:", e);
  }
}

/** Coerce a config threshold to a usable number, or null if unset/invalid. */
function threshold(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Numeric PnL % for a position, preferring SOL basis, falling back to USD. */
function pnlPct(pos: { pnlSolPctChange: number | null; pnlPctChange: string }): {
  value: number;
  basis: "sol" | "usd";
} | null {
  if (pos.pnlSolPctChange !== null && Number.isFinite(pos.pnlSolPctChange)) {
    return { value: pos.pnlSolPctChange, basis: "sol" };
  }
  const usd = parseFloat(pos.pnlPctChange);
  if (Number.isFinite(usd)) return { value: usd, basis: "usd" };
  return null;
}

export function createTpSl(
  bot: Bot,
  client: MeteoraClient,
  config: VexisConfig,
  chatId: string,
): RuntimeTpSl {
  const rt: RuntimeTpSl = { state: loadState(), task: null };
  // Always schedule — the cron reads live config each run and no-ops when both
  // thresholds are unset, so runtime config edits take effect without a restart.
  scheduleTpSlChecks(rt, bot, client, config, chatId);
  return rt;
}

function scheduleTpSlChecks(
  rt: RuntimeTpSl,
  bot: Bot,
  client: MeteoraClient,
  config: VexisConfig,
  chatId: string,
) {
  rt.task?.stop();
  rt.task = cron.schedule(CRON_EXPR, async () => {
    try {
      const sl = threshold(config.stopLossPct);
      const tp = threshold(config.takeProfitPct);
      if (sl === null && tp === null) return; // feature off

      const wallet = resolveWallet(undefined, config);
      const res = await client.openPortfolio(wallet, 1, 100);
      const pools = res.pools ?? [];
      const seen = new Set<string>();

      for (const pool of pools) {
        let pdata;
        try {
          pdata = await client.positionPnl(pool.poolAddress, wallet, "open");
        } catch (e) {
          console.error("[tpsl] positionPnl failed for pool", pool.poolAddress, e);
          continue;
        }
        const pair = `${pdata.tokenX ?? pool.tokenX}/${pdata.tokenY ?? pool.tokenY}`;

        for (const p of pdata.positions) {
          if (p.isClosed) continue;
          seen.add(p.positionAddress);
          const pct = pnlPct(p);
          if (!pct) continue;

          const flags = rt.state.triggered[p.positionAddress] ?? { sl: false, tp: false };

          // Take profit
          if (tp !== null && pct.value >= tp) {
            if (!flags.tp) {
              flags.tp = true;
              await sendTrigger(bot, chatId, "tp", pool.poolAddress, p.positionAddress, pair, pct, tp);
            }
          } else {
            flags.tp = false; // re-arm once back below target
          }

          // Stop loss
          if (sl !== null && pct.value <= sl) {
            if (!flags.sl) {
              flags.sl = true;
              await sendTrigger(bot, chatId, "sl", pool.poolAddress, p.positionAddress, pair, pct, sl);
            }
          } else {
            flags.sl = false; // re-arm once back above limit
          }

          rt.state.triggered[p.positionAddress] = flags;
        }
      }

      // Prune flags for positions no longer open
      for (const key of Object.keys(rt.state.triggered)) {
        if (!seen.has(key)) delete rt.state.triggered[key];
      }
      saveState(rt.state);
    } catch (e) {
      console.error("[tpsl] check failed:", e);
    }
  });
}

async function sendTrigger(
  bot: Bot,
  chatId: string,
  kind: "sl" | "tp",
  poolAddress: string,
  positionAddress: string,
  pair: string,
  pct: { value: number; basis: "sol" | "usd" },
  target: number,
) {
  const title = kind === "tp" ? "🎯 Take Profit hit" : "🛑 Stop Loss hit";
  const label = kind === "tp" ? "target" : "limit";
  const basisNote = pct.basis === "usd" ? " \\(USD basis\\)" : "";
  const actionId = registerAction(poolAddress, positionAddress);
  const kb = new InlineKeyboard().text("🔴 Close & Zap Out", `mng:close:${actionId}`);
  const msg = [
    `${title} — ${tgBold(pair)}`,
    `Position: ${tgCode(positionAddress)}`,
    `PnL: ${tgPct(pct.value)}${basisNote} \\(${escapeMarkdown(label)} ${tgPct(target)}\\)`,
  ].join("\n");
  try {
    await bot.api.sendMessage(chatId, msg, { ...MD, reply_markup: kb });
  } catch (e) {
    console.error("[tpsl] Failed to send trigger:", e);
  }
}

// ─── Bot commands ───────────────────────────────────────────────────────────

export function registerTpSlCommands(
  bot: Bot,
  _client: MeteoraClient,
  config: VexisConfig,
  _chatId: string,
  _rt: RuntimeTpSl,
) {
  // ─── /tpsl — show current global thresholds ─────────────────────────────
  bot.command("tpsl", async (ctx) => {
    const sl = threshold(config.stopLossPct);
    const tp = threshold(config.takeProfitPct);
    const slTxt = sl !== null ? tgPct(sl) : escapeMarkdown("— (off)");
    const tpTxt = tp !== null ? tgPct(tp) : escapeMarkdown("— (off)");
    const lines = [
      tgBold("🎯 TP/SL (global)"),
      "",
      `Stop Loss: ${slTxt}`,
      `Take Profit: ${tpTxt}`,
      "",
      escapeMarkdown("Basis: PnL % (SOL). Applies to all open positions, checked every 1m."),
      escapeMarkdown("Edit via /config → Stop Loss % / Take Profit %, or vexis.config.json."),
    ];
    await ctx.reply(lines.join("\n"), MD);
  });
}
