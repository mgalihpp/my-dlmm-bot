import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Duration, Effect, Fiber, Schedule } from "effect";
import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import { escapeMarkdown, tgBold, tgCode, tgPct } from "./format.js";
import { MD } from "./utils.js";
import { registerAction } from "./action-store.js";
import { api, getConfig, resolveWallet } from "./fx.js";
import { runtime } from "./runtime.js";

const STATE_FILE = join(process.cwd(), ".vexis-tpsl.json");

interface TriggerFlags {
  sl: boolean;
  tp: boolean;
}

interface TpSlState {
  triggered: Record<string, TriggerFlags>;
}

export interface RuntimeTpSl {
  state: TpSlState;
  fiber: Fiber.RuntimeFiber<unknown, unknown> | null;
}

function loadState(): TpSlState {
  if (existsSync(STATE_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(STATE_FILE, "utf8"));
      return { triggered: raw.triggered && typeof raw.triggered === "object" ? raw.triggered : {} };
    } catch {}
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

function threshold(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pnlPct(pos: { pnlSolPctChange: number | null; pnlPctChange: string }): {
  value: number;
  basis: "sol" | "usd";
} | null {
  if (pos.pnlSolPctChange !== null) {
    const val = Number(pos.pnlSolPctChange);
    if (Number.isFinite(val)) return { value: val, basis: "sol" };
  }
  const usd = parseFloat(pos.pnlPctChange);
  if (Number.isFinite(usd)) return { value: usd, basis: "usd" };
  return null;
}

export function createTpSl(bot: Bot, chatId: string): RuntimeTpSl {
  const rt: RuntimeTpSl = { state: loadState(), fiber: null };

  const check = Effect.tryPromise(() => runCheck(rt, bot, chatId)).pipe(
    Effect.catchAll((e) =>
      Effect.sync(() => {
        console.error("[tpsl] check failed:", e);
      }),
    ),
  );

  rt.fiber = runtime.runFork(
    check.pipe(Effect.repeat(Schedule.spaced(Duration.minutes(1)))),
  );

  return rt;
}

async function runCheck(rt: RuntimeTpSl, bot: Bot, chatId: string): Promise<void> {
  const config = await getConfig();
  const sl = threshold(config.stopLossPct);
  const tp = threshold(config.takeProfitPct);
  if (sl === null && tp === null) return;

  const wallet = await resolveWallet();
  const res = await api.openPortfolio(wallet, 1, 100);
  const pools = res.pools ?? [];
  const seen = new Set<string>();

  for (const pool of pools) {
    let pdata;
    try {
      pdata = await api.positionPnl(pool.poolAddress, wallet, "open");
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

      if (tp !== null && pct.value >= tp) {
        if (!flags.tp) {
          flags.tp = true;
          await sendTrigger(bot, chatId, "tp", pool.poolAddress, p.positionAddress, pair, pct, tp);
        }
      } else {
        flags.tp = false;
      }

      if (sl !== null && pct.value <= sl) {
        if (!flags.sl) {
          flags.sl = true;
          await sendTrigger(bot, chatId, "sl", pool.poolAddress, p.positionAddress, pair, pct, sl);
        }
      } else {
        flags.sl = false;
      }

      rt.state.triggered[p.positionAddress] = flags;
    }
  }

  for (const key of Object.keys(rt.state.triggered)) {
    if (!seen.has(key)) delete rt.state.triggered[key];
  }
  saveState(rt.state);
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
  const icon = kind === "tp" ? "🎯" : "🛑";
  const label = kind === "tp" ? "Target" : "Limit";
  const basisStr = pct.basis === "sol" ? "SOL" : "USD";
  const arrow = kind === "tp" ? "↑" : "↓";
  const pctEmoji = pct.value > 0 ? "🟢" : "🔴";
  const actionId = registerAction(poolAddress, positionAddress);
  const kb = new InlineKeyboard().text("🔴 Close & Zap Out", `mng:close:${actionId}`);
  const msg = [
    `${icon} ${tgBold(kind === "tp" ? "Take Profit" : "Stop Loss")} Triggered`,
    "",
    `Pair: ${tgBold(pair)}`,
    `PnL: ${pctEmoji} ${tgPct(pct.value)} \\(${basisStr}\\) ${arrow} ${escapeMarkdown(label)} ${tgPct(target)}`,
    "",
    `Pool: ${tgCode(poolAddress)}`,
    `Position: ${tgCode(positionAddress)}`,
  ].join("\n");
  try {
    await bot.api.sendMessage(chatId, msg, { ...MD, reply_markup: kb });
  } catch (e) {
    console.error("[tpsl] Failed to send trigger:", e);
  }
}

export function registerTpSlCommands(bot: Bot) {
  bot.command("tpsl", async (ctx) => {
    const config = await getConfig();
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
