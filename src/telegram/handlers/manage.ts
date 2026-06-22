import { Bot, Context, InlineKeyboard } from "grammy";
import { Keypair } from "@solana/web3.js";
import type { MeteoraClient } from "../../api.js";
import type { VexisConfig } from "../../config.js";
import { resolveKeypair, resolveRpc, resolveWallet } from "../../config.js";
import { escapeMarkdown, tgBold, tgCode, tgTxLink } from "../format.js";
import { MD, replyError } from "../utils.js";
import { registerAction, resolveAction } from "../action-store.js";

interface Pending {
  summary: string;
  run: () => Promise<string>;
}
const pending = new Map<string, Pending>();
let opCounter = 0;
const nextOpId = () => `mop${++opCounter}`;

export function registerManage(bot: Bot, client: MeteoraClient, config: VexisConfig) {
  const requireKeypair = (): Keypair => resolveKeypair(config);

  // ─── /manage — entry point ─────────────────────────────────────────────────
  bot.command("manage", async (ctx) => {
    const loading = await ctx.reply("⏳ Loading positions\\.\\.\\.", MD);
    const editTarget = { chatId: loading.chat.id, messageId: loading.message_id };
    try {
      const wallet = resolveWallet(undefined, config);
      const res = await client.openPortfolio(wallet, 1, 50);
      const pools = res.pools;
      if (pools.length === 0) {
        await ctx.api.editMessageText(editTarget.chatId, editTarget.messageId, tgBold("📭 No open positions"), MD);
        return;
      }
      await sendPoolList(ctx, pools, "edit", editTarget);
    } catch (e) {
      await ctx.api.editMessageText(
        editTarget.chatId,
        editTarget.messageId,
        `✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`,
        MD,
      );
    }
  });

  // ─── mng:pools — refresh pool list ────────────────────────────────────────
  bot.callbackQuery("mng:pools", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Loading positions\\.\\.\\.", MD);
    try {
      const wallet = resolveWallet(undefined, config);
      const res = await client.openPortfolio(wallet, 1, 50);
      const pools = res.pools;
      if (pools.length === 0) {
        await ctx.editMessageText(tgBold("📭 No open positions"), MD);
        return;
      }
      await sendPoolList(ctx, pools, "edit");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, MD);
    }
  });

  // ─── mng:pool:<poolAddr> — show positions for a pool ──────────────────────
  bot.callbackQuery(/^mng:pool:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const poolAddr = ctx.match![1];
    await ctx.editMessageText("⏳ Loading\\.\\.\\.", MD);
    try {
      const wallet = resolveWallet(undefined, config);
      const res = await client.openPortfolio(wallet, 1, 50);
      const pool = res.pools.find((p) => p.poolAddress === poolAddr);
      if (!pool) {
        await ctx.editMessageText("Pool not found\\. It may have been closed\\.", {
          ...MD,
          reply_markup: new InlineKeyboard().text("⬅️ Back", "mng:pools"),
        });
        return;
      }

      if (pool.listPositions.length === 1) {
        // Single position — go straight to action panel, back returns to pool list
        const actionId = registerAction(poolAddr, pool.listPositions[0]);
        await showActionPanel(ctx, pool.tokenX, pool.tokenY, poolAddr, pool.listPositions[0], actionId, "edit", "mng:pools");
        return;
      }

      // Multiple positions — show selection list
      const lines = [
        tgBold(`📋 ${escapeMarkdown(pool.tokenX)}/${escapeMarkdown(pool.tokenY)}`),
        `Pool: ${tgCode(poolAddr)}`,
        "",
        "Select a position:",
      ];
      const kb = new InlineKeyboard();
      pool.listPositions.forEach((pos, i) => {
        const actionId = registerAction(poolAddr, pos);
        // store backTarget in action so the panel can navigate back to position list
        kb.text(`#${i + 1}: ${pos.slice(0, 6)}…${pos.slice(-4)}`, `mng:pos:${actionId}:${poolAddr}`).row();
      });
      kb.text("⬅️ Back", "mng:pools");
      await ctx.editMessageText(lines.join("\n"), { ...MD, reply_markup: kb });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, {
        ...MD,
        reply_markup: new InlineKeyboard().text("⬅️ Back", "mng:pools"),
      });
    }
  });

  // ─── mng:pos:<actionId>:<poolAddr> — show action panel for a position ───────
  // backTarget = mng:pool:<poolAddr> so user returns to position list (multi-pos)
  bot.callbackQuery(/^mng:pos:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const poolAddr = ctx.match![2];
    const pair = resolveAction(actionId);
    if (!pair) {
      await ctx.editMessageText("⌛ Expired\\. Please run /manage again\\.", {
        ...MD,
        reply_markup: new InlineKeyboard().text("🔄 Manage", "mng:pools"),
      });
      return;
    }
    try {
      const wallet = resolveWallet(undefined, config);
      const res = await client.openPortfolio(wallet, 1, 50);
      const pool = res.pools.find((p) => p.poolAddress === pair.poolAddress);
      const tokenX = pool?.tokenX ?? "?";
      const tokenY = pool?.tokenY ?? "?";
      await showActionPanel(ctx, tokenX, tokenY, pair.poolAddress, pair.positionPubkey, actionId, "edit", `mng:pool:${poolAddr}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, {
        ...MD,
        reply_markup: new InlineKeyboard().text("⬅️ Back", "mng:pools"),
      });
    }
  });

  // ─── mng:close:<actionId> ─────────────────────────────────────────────────
  bot.callbackQuery(/^mng:close:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) {
      await ctx.editMessageText("⌛ Expired\\. Please run /manage again\\.", MD);
      return;
    }
    requireKeypair();
    const { poolAddress, positionPubkey } = pair;
    const summary = [
      tgBold("Close & Zap Out?"),
      `Pool: ${tgCode(poolAddress)}`,
      `Position: ${tgCode(positionPubkey)}`,
      "",
      "Remove all liquidity \\+ claim fees\\, then swap to SOL via Jupiter\\.",
    ].join("\n");
    await presentEdit(ctx, summary, async () => {
      const keypair = resolveKeypair(config);
      const rpc = resolveRpc(config);
      const { ZapClient } = await import("../../zap.js");
      const zap = new ZapClient(keypair, rpc);
      const result = await zap.closeAndZapOut(poolAddress, positionPubkey);
      const sig = result.zapSig || result.closeSig;
      if (!sig) throw new Error("Close produced no transaction signature");
      return sig;
    });
  });

  // ─── mng:claimfee:<actionId> ──────────────────────────────────────────────
  bot.callbackQuery(/^mng:claimfee:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) {
      await ctx.editMessageText("⌛ Expired\\. Please run /manage again\\.", MD);
      return;
    }
    requireKeypair();
    const { poolAddress, positionPubkey } = pair;
    const summary = [
      tgBold("Claim Fees \\+ Zap to SOL?"),
      `Pool: ${tgCode(poolAddress)}`,
      `Position: ${tgCode(positionPubkey)}`,
      "",
      "Claim swap fees \\+ swap to SOL via Jupiter\\.",
    ].join("\n");
    await presentEdit(ctx, summary, async () => {
      const keypair = resolveKeypair(config);
      const rpc = resolveRpc(config);
      const { ZapClient } = await import("../../zap.js");
      const zap = new ZapClient(keypair, rpc);
      const result = await zap.claimAndZapOut(poolAddress, positionPubkey);
      const sig = result.zapSig || result.claimSig;
      if (!sig) throw new Error("Claim produced no transaction signature");
      return sig;
    });
  });

  // ─── mng:reward:<actionId> ────────────────────────────────────────────────
  bot.callbackQuery(/^mng:reward:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) {
      await ctx.editMessageText("⌛ Expired\\. Please run /manage again\\.", MD);
      return;
    }
    requireKeypair();
    const { poolAddress, positionPubkey } = pair;
    const summary = [
      tgBold("Claim Rewards?"),
      `Pool: ${tgCode(poolAddress)}`,
      `Position: ${tgCode(positionPubkey)}`,
    ].join("\n");
    await presentEdit(ctx, summary, async () => {
      const keypair = resolveKeypair(config);
      const rpc = resolveRpc(config);
      const { DLMMClient } = await import("../../dlmm.js");
      const dlmm = new DLMMClient(keypair, rpc);
      return dlmm.claimReward(poolAddress, positionPubkey);
    });
  });

  // ─── mng:addliq:<actionId> — show prefilled command hint ─────────────────
  bot.callbackQuery(/^mng:addliq:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) {
      await ctx.editMessageText("⌛ Expired\\. Please run /manage again\\.", MD);
      return;
    }
    const { poolAddress, positionPubkey } = pair;
    const hint = [
      tgBold("➕ Add Liquidity"),
      "",
      "Copy and fill in the amounts:",
      `\`/addliq ${poolAddress} ${positionPubkey} spot <xAmt> <yAmt>\``,
      "",
      escapeMarkdown("Strategies: spot | bidask | curve"),
    ].join("\n");
    await ctx.editMessageText(hint, {
      ...MD,
      reply_markup: new InlineKeyboard().text("⬅️ Back", `mng:pos:${actionId}`),
    });
  });

  // ─── mng:removeliq:<actionId> — show prefilled command hint ───────────────
  bot.callbackQuery(/^mng:removeliq:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) {
      await ctx.editMessageText("⌛ Expired\\. Please run /manage again\\.", MD);
      return;
    }
    const { poolAddress, positionPubkey } = pair;
    const hint = [
      tgBold("➖ Remove Liquidity"),
      "",
      "Copy and fill in the amount \\(bps: 1\\-10000, e\\.g\\. 10000 \\= 100%\\):",
      `\`/removeliq ${poolAddress} ${positionPubkey} <bps>\``,
    ].join("\n");
    await ctx.editMessageText(hint, {
      ...MD,
      reply_markup: new InlineKeyboard().text("⬅️ Back", `mng:pos:${actionId}`),
    });
  });

  // ─── Confirm / cancel callbacks ───────────────────────────────────────────
  bot.callbackQuery(/^mconfirm:(.+)$/, async (ctx) => {
    const opId = ctx.match![1];
    const op = pending.get(opId);
    pending.delete(opId);
    await ctx.answerCallbackQuery();
    if (!op) {
      await ctx.editMessageText("⌛ Expired \\(operation no longer available\\)", MD);
      return;
    }
    await ctx.editMessageText("⏳ Sending transaction\\.\\.\\.", MD);
    try {
      const sig = await op.run();
      await ctx.editMessageText(`✅ Done\\!\n${tgTxLink(sig)}`, MD);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ Failed: ${escapeMarkdown(msg)}`, MD);
    }
  });

  bot.callbackQuery(/^mcancel:(.+)$/, async (ctx) => {
    const opId = ctx.match![1];
    pending.delete(opId);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("❌ Cancelled\\.", MD);
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sendPoolList(
  ctx: Context,
  pools: { poolAddress: string; tokenX: string; tokenY: string; openPositionCount: number; outOfRange: boolean | null; unclaimedFees: string }[],
  mode: "reply" | "edit",
  editTarget?: { chatId: number; messageId: number }
) {
  const lines = [tgBold("📈 Open Positions — Select Pool"), ""];
  const kb = new InlineKeyboard();
  for (const p of pools) {
    const range = p.outOfRange ? " ⚠️" : "";
    const label = `${p.tokenX}/${p.tokenY}${range} · ${p.openPositionCount} pos · fees $${Number(p.unclaimedFees).toFixed(2)}`;
    lines.push(`• ${tgBold(escapeMarkdown(`${p.tokenX}/${p.tokenY}`))}${escapeMarkdown(range)} — ${escapeMarkdown(`${p.openPositionCount} pos · fees $${Number(p.unclaimedFees).toFixed(2)}`)}`);
    // poolAddress is 44 chars; prefix "mng:pool:" is 9 chars → 53 bytes total, under 64
    kb.text(label.slice(0, 30), `mng:pool:${p.poolAddress}`).row();
  }
  kb.row().text("➕ Create New Position", "crt:source");
  const text = lines.join("\n");
  if (editTarget) {
    await ctx.api.editMessageText(editTarget.chatId, editTarget.messageId, text, { ...MD, reply_markup: kb });
  } else if (mode === "reply") {
    await (ctx as any).reply(text, { ...MD, reply_markup: kb });
  } else {
    await (ctx as any).editMessageText(text, { ...MD, reply_markup: kb });
  }
}

async function showActionPanel(
  ctx: Context,
  tokenX: string,
  tokenY: string,
  poolAddress: string,
  positionPubkey: string,
  actionId: string,
  mode: "reply" | "edit",
  backTarget: string
) {
  const text = [
    tgBold(`⚡ ${escapeMarkdown(tokenX)}/${escapeMarkdown(tokenY)}`),
    `Pool: ${tgCode(poolAddress)}`,
    `Position: ${tgCode(positionPubkey)}`,
    "",
    "Select action:",
  ].join("\n");

  const kb = new InlineKeyboard()
    .text("🔴 Close & Zap", `mng:close:${actionId}`)
    .text("💎 Claim Fee", `mng:claimfee:${actionId}`)
    .row()
    .text("🎁 Claim Reward", `mng:reward:${actionId}`)
    .row()
    .text("➕ Add Liq", `mng:addliq:${actionId}`)
    .text("➖ Remove Liq", `mng:removeliq:${actionId}`)
    .row()
    .text("⬅️ Back", backTarget);

  if (mode === "reply") {
    await (ctx as any).reply(text, { ...MD, reply_markup: kb });
  } else {
    await (ctx as any).editMessageText(text, { ...MD, reply_markup: kb });
  }
}

async function presentEdit(
  ctx: Context,
  summary: string,
  run: () => Promise<string>
) {
  const opId = nextOpId();
  pending.set(opId, { summary, run });
  const kb = new InlineKeyboard()
    .text("✅ Confirm", `mconfirm:${opId}`)
    .text("❌ Cancel", `mcancel:${opId}`);
  await ctx.editMessageText(summary, { ...MD, reply_markup: kb });
}
