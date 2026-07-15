// Shared pool & position selection utilities for interactive flows.
import { Context, InlineKeyboard } from "grammy";
import { api, resolveWallet } from "./fx.js";
import { escapeMarkdown, tgBold, tgCode, tgUsd, tgSol, tgPct } from "./format.js";
import { MD } from "./utils.js";
import { registerAction } from "./action-store.js";

export interface PoolInfo {
  poolAddress: string;
  tokenX: string;
  tokenY: string;
  openPositionCount: number;
  outOfRange: boolean | null;
  unclaimedFees: string;
}

/** Fetch open positions from API. */
export async function fetchOpenPools(): Promise<PoolInfo[]> {
  const wallet = await resolveWallet();
  const res = await api.openPortfolio(wallet, 1, 50);
  return [...res.pools];
}

/** Build inline keyboard for pool list with given callback prefix.
 *  Each button callback: `{prefix}:pool:{poolAddress}` */
export function buildPoolKeyboard(
  pools: PoolInfo[],
  prefix: string,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of pools) {
    const range = p.outOfRange ? " ⚠️" : "";
    const label = `${p.tokenX}/${p.tokenY}${range} · ${p.openPositionCount} pos · fees $${Number(p.unclaimedFees).toFixed(2)}`;
    kb.text(label.slice(0, 30), `${prefix}:pool:${p.poolAddress}`).row();
  }
  return kb;
}

/** Render pool list message. */
export function poolListMessage(pools: PoolInfo[]): string {
  const lines = [tgBold("📈 Open Positions — Select Pool"), ""];
  for (const p of pools) {
    const range = p.outOfRange ? " ⚠️" : "";
    lines.push(
      `• ${tgBold(escapeMarkdown(`${p.tokenX}/${p.tokenY}`))}${escapeMarkdown(range)} — ${escapeMarkdown(`${p.openPositionCount} pos · fees $${Number(p.unclaimedFees).toFixed(2)}`)}`,
    );
  }
  return lines.join("\n");
}

/** Show pool list (edit or reply) with a given prefix for callbacks. */
export async function showPoolList(
  ctx: Context,
  pools: PoolInfo[],
  prefix: string,
  mode: "edit" | "reply" = "edit",
  editTarget?: { chatId: number; messageId: number },
) {
  const kb = buildPoolKeyboard(pools, prefix);
  const text = poolListMessage(pools);
  if (editTarget) {
    await ctx.api.editMessageText(editTarget.chatId, editTarget.messageId, text, { ...MD, reply_markup: kb });
  } else if (mode === "edit") {
    await ctx.editMessageText(text, { ...MD, reply_markup: kb });
  } else {
    await ctx.reply(text, { ...MD, reply_markup: kb });
  }
}

/** Build inline keyboard for position list.
 *  Each button callback: `{prefix}:pos:{actionId}:{poolAddr}` */
export function buildPositionKeyboard(
  positions: string[],
  poolAddr: string,
  prefix: string,
): { kb: InlineKeyboard; actionIds: string[] } {
  const actionIds = positions.map((p) => registerAction(poolAddr, p));
  const kb = new InlineKeyboard();
  positions.forEach((pos, i) => {
    kb.text(`#${i + 1}: ${pos.slice(0, 6)}…${pos.slice(-4)}`, `${prefix}:pos:${actionIds[i]}:${poolAddr}`).row();
  });
  return { kb, actionIds };
}

/** Render position selection message. */
export function positionListMessage(
  tokenX: string,
  tokenY: string,
  poolAddr: string,
): string {
  return [
    tgBold(`📋 ${escapeMarkdown(tokenX)}/${escapeMarkdown(tokenY)}`),
    `Pool: ${tgCode(poolAddr)}`,
    "",
    "Select a position:",
  ].join("\n");
}

/** Show position list for a pool (edits current message). */
export async function showPositionList(
  ctx: Context,
  poolAddr: string,
  tokenX: string,
  tokenY: string,
  positions: string[],
  prefix: string,
  backCallback: string,
) {
  const { kb } = buildPositionKeyboard(positions, poolAddr, prefix);
  kb.text("⬅️ Back", backCallback);
  await ctx.editMessageText(positionListMessage(tokenX, tokenY, poolAddr), {
    ...MD,
    reply_markup: kb,
  });
}

/** Resolve pool detail from open portfolio. */
export async function resolvePoolDetail(
  poolAddr: string,
): Promise<{ tokenX: string; tokenY: string; positions: string[]; pnl: string; pnlPctChange: string; pnlSol: string | null; pnlSolPctChange: string | null } | null> {
  try {
    const wallet = await resolveWallet();
    const res = await api.openPortfolio(wallet, 1, 50);
    const pool = res.pools.find((p) => p.poolAddress === poolAddr);
    if (!pool) return null;
    return {
      tokenX: pool.tokenX,
      tokenY: pool.tokenY,
      positions: [...pool.listPositions],
      pnl: pool.pnl,
      pnlPctChange: pool.pnlPctChange,
      pnlSol: pool.pnlSol,
      pnlSolPctChange: pool.pnlSolPctChange,
    };
  } catch {
    return null;
  }
}

export async function resolvePositionPnl(
  poolAddr: string,
  positionAddr: string,
): Promise<{ pnl: string; pnlPctChange: string; pnlSol: string | null; pnlSolPctChange: string | null } | null> {
  try {
    const wallet = await resolveWallet();
    const res = await api.positionPnl(poolAddr, wallet, "open");
    const pos = res.positions.find((p) => p.positionAddress === positionAddr);
    if (!pos) return null;
    return {
      pnl: pos.pnlUsd,
      pnlPctChange: pos.pnlPctChange,
      pnlSol: pos.pnlSol != null ? String(pos.pnlSol) : null,
      pnlSolPctChange: pos.pnlSolPctChange != null ? String(pos.pnlSolPctChange) : null,
    };
  } catch {
    return null;
  }
}

/** Build an action panel keyboard for a position.
 *  prefix determines callback names: e.g. "close" → "close:run:{actionId}" */
export function actionPanelKeyboard(
  actionId: string,
  prefix: string,
  backTarget: string,
  actions: { label: string; action: string }[],
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const a of actions) {
    kb.text(a.label, `${prefix}:${a.action}:${actionId}`);
    kb.row();
  }
  kb.text("⬅️ Back", backTarget);
  return kb;
}

/** Render action panel title. */
export function actionPanelMessage(
  tokenX: string,
  tokenY: string,
  poolAddress: string,
  positionPubkey: string,
  opts?: {
    pnl: string;
    pnlPctChange: string;
    pnlSol: string | null;
    pnlSolPctChange: string | null;
  },
): string {
  const lines = [
    tgBold(`⚡ ${escapeMarkdown(tokenX)}/${escapeMarkdown(tokenY)}`),
    `Pool: ${tgCode(poolAddress)}`,
    `Position: ${tgCode(positionPubkey)}`,
  ];
  if (opts) {
    lines.push(
      `PnL \\(USD\\): ${tgUsd(opts.pnl)} \\(${tgPct(opts.pnlPctChange)}\\)`,
    );
    if (opts.pnlSol != null) {
      lines.push(
        `PnL \\(SOL\\): ${tgSol(opts.pnlSol)} \\(${tgPct(opts.pnlSolPctChange)}\\)`,
      );
    }
  }
  lines.push("", "Select action:");
  return lines.join("\n");
}
