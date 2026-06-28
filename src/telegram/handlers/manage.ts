import { Bot, Context, InlineKeyboard } from "grammy";
import { Keypair } from "@solana/web3.js";
import type { MeteoraClient } from "../../api.js";
import type { VexisConfig } from "../../config.js";
import { resolveKeypair, resolveRpc, resolveWallet } from "../../config.js";
import { escapeMarkdown, tgBold, tgCode, tgTxLink } from "../format.js";
import { MD, replyError } from "../utils.js";
import { registerAction, resolveAction } from "../action-store.js";
import { setInputSession } from "../input-store.js";
import {
  fetchOpenPools,
  showPoolList,
  showPositionList,
  resolvePoolDetail,
  actionPanelMessage,
  actionPanelKeyboard,
  buildPositionKeyboard,
} from "../pool-position-selector.js";
import type { StrategyType } from "../../types.js";

interface Pending {
  summary: string;
  run: () => Promise<string>;
}
const pending = new Map<string, Pending>();
let opCounter = 0;
const nextOpId = () => `mop${++opCounter}`;

const PREFIX = "mng";

const DLMM_CLIENT_CACHE: Record<string, any> = {};
async function lazyDLMM() {
  if (!DLMM_CLIENT_CACHE.ctor) {
    const mod = await import("../../dlmm.js");
    DLMM_CLIENT_CACHE.ctor = mod.DLMMClient;
  }
  return DLMM_CLIENT_CACHE.ctor;
}

let ZAP_CLIENT_CACHE: Record<string, any> = {};
async function lazyZap() {
  if (!ZAP_CLIENT_CACHE.ctor) {
    const mod = await import("../../zap.js");
    ZAP_CLIENT_CACHE.ctor = mod.ZapClient;
  }
  return ZAP_CLIENT_CACHE.ctor;
}

export function registerManage(bot: Bot, client: MeteoraClient, config: VexisConfig) {
  const requireKeypair = (): Keypair => resolveKeypair(config);

  // ─── /manage — entry point ─────────────────────────────────────────────────
  bot.command("manage", async (ctx) => {
    const loading = await ctx.reply("⏳ Loading positions\\.\\.\\.", MD);
    try {
      const pools = await fetchOpenPools(client, config);
      if (pools.length === 0) {
        await ctx.api.editMessageText(loading.chat.id, loading.message_id, tgBold("📭 No open positions"), MD);
        return;
      }
      await showPoolList(ctx, pools, PREFIX, "edit", { chatId: loading.chat.id, messageId: loading.message_id });
    } catch (e) {
      await ctx.api.editMessageText(loading.chat.id, loading.message_id, `✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, MD);
    }
  });

  // ─── mng:pools — refresh pool list ────────────────────────────────────────
  bot.callbackQuery("mng:pools", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Loading positions\\.\\.\\.", MD);
    try {
      const pools = await fetchOpenPools(client, config);
      if (pools.length === 0) {
        await ctx.editMessageText(tgBold("📭 No open positions"), MD);
        return;
      }
      await showPoolList(ctx, pools, PREFIX, "edit");
    } catch (e) {
      await ctx.editMessageText(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, MD);
    }
  });

  // ─── mng:pool:<poolAddr> — show positions for a pool ──────────────────────
  bot.callbackQuery(/^mng:pool:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const poolAddr = ctx.match![1];
    await ctx.editMessageText("⏳ Loading\\.\\.\\.", MD);
    try {
      const detail = await resolvePoolDetail(client, config, poolAddr);
      if (!detail) {
        await ctx.editMessageText("Pool not found\\.", { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "mng:pools") });
        return;
      }
      if (detail.positions.length === 1) {
        const actionId = registerAction(poolAddr, detail.positions[0]);
        await showActionPanel(ctx, detail.tokenX, detail.tokenY, poolAddr, detail.positions[0], actionId, "mng:pools");
        return;
      }
      await showPositionList(ctx, poolAddr, detail.tokenX, detail.tokenY, detail.positions, PREFIX, "mng:pools");
    } catch (e) {
      await ctx.editMessageText(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "mng:pools") });
    }
  });

  // ─── mng:pos:<actionId>:<poolAddr> — show action panel ────────────────────
  bot.callbackQuery(/^mng:pos:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const poolAddr = ctx.match![2];
    const pair = resolveAction(actionId);
    if (!pair) {
      await ctx.editMessageText("⌛ Expired\\. Please run /manage again\\.", { ...MD, reply_markup: new InlineKeyboard().text("🔄 Manage", "mng:pools") });
      return;
    }
    try {
      const detail = await resolvePoolDetail(client, config, poolAddr);
      const tokenX = detail?.tokenX ?? "?";
      const tokenY = detail?.tokenY ?? "?";
      await showActionPanel(ctx, tokenX, tokenY, pair.poolAddress, pair.positionPubkey, actionId, `mng:pool:${poolAddr}`);
    } catch (e) {
      await ctx.editMessageText(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "mng:pools") });
    }
  });

  // ─── mng:close:<actionId> ─────────────────────────────────────────────────
  bot.callbackQuery(/^mng:close:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) return await expired(ctx);
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
      const Ctor = await lazyZap();
      const zap = new Ctor(keypair, rpc);
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
    if (!pair) return await expired(ctx);
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
      const Ctor = await lazyZap();
      const zap = new Ctor(keypair, rpc);
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
    if (!pair) return await expired(ctx);
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
      const Ctor = await lazyDLMM();
      const dlmm = new Ctor(keypair, rpc);
      return dlmm.claimReward(poolAddress, positionPubkey);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── mng:addliq — FULL INTERACTIVE FORM ──────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  // addliq session state (in-memory, per-chat)
  interface AddLiqSession {
    actionId: string;
    poolAddress: string;
    positionPubkey: string;
    tokenX: string;
    tokenY: string;
    strategy?: StrategyType;
    xAmt?: string;
    yAmt?: string;
  }
  const addLiqSessions = new Map<string, AddLiqSession>();

  bot.callbackQuery(/^mng:addliq:(a\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) return await expired(ctx);
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);
    addLiqSessions.set(chatId, { actionId, poolAddress: pair.poolAddress, positionPubkey: pair.positionPubkey, tokenX: "?", tokenY: "?" });
    // resolve pool detail for token names
    try {
      const detail = await resolvePoolDetail(client, config, pair.poolAddress);
      if (detail) {
        addLiqSessions.set(chatId, { ...addLiqSessions.get(chatId)!, tokenX: detail.tokenX, tokenY: detail.tokenY });
      }
    } catch {}
    await ctx.editMessageText(
      `${tgBold("➕ Add Liquidity")}\n\nSelect strategy:`,
      {
        ...MD,
        reply_markup: new InlineKeyboard()
          .text("📊 Spot", `mng:addliq:strategy:${actionId}:spot`)
          .row()
          .text("📈 Bid-Ask", `mng:addliq:strategy:${actionId}:bidask`)
          .row()
          .text("🔔 Curve", `mng:addliq:strategy:${actionId}:curve`)
          .row()
          .text("⬅️ Back", `mng:pos:${actionId}`),
      },
    );
  });

  bot.callbackQuery(/^mng:addliq:strategy:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const strategy = ctx.match![2] as StrategyType;
    const pair = resolveAction(actionId);
    if (!pair) return await expired(ctx);
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);
    const session = addLiqSessions.get(chatId);
    if (!session) return;
    session.strategy = strategy;
    addLiqSessions.set(chatId, session);

    const xToken = session.tokenX || "X";
    const yToken = session.tokenY || "Y";
    // prompt for X amount
    const xHandler = async (text: string, sessionCtx: Context) => {
      const val = parseFloat(text);
      if (Number.isNaN(val) || val < 0) {
        await sessionCtx.reply(`✖ Invalid amount\\. Send a positive number for ${escapeMarkdown(xToken)}:`, MD);
        setInputSession(chatId, xHandler);
        return;
      }
      const s = addLiqSessions.get(chatId);
      if (!s) return;
      s.xAmt = text;
      addLiqSessions.set(chatId, s);
      const yHandler = async (text2: string, sessionCtx2: Context) => {
        const val2 = parseFloat(text2);
        if (Number.isNaN(val2) || val2 < 0) {
          await sessionCtx2.reply(`✖ Invalid amount\\. Send a positive number for ${escapeMarkdown(yToken)}:`, MD);
          setInputSession(chatId, yHandler);
          return;
        }
        const s2 = addLiqSessions.get(chatId);
        if (!s2) return;
        s2.yAmt = text2;
        addLiqSessions.set(chatId, s2);
        const summary = [
          tgBold("➕ Add Liquidity?"),
          `Pool: ${tgCode(s2.poolAddress)}`,
          `Position: ${tgCode(s2.positionPubkey)}`,
          `Strategy: ${escapeMarkdown(s2.strategy!)} \\| ${escapeMarkdown(xToken)}: ${escapeMarkdown(s2.xAmt!)} \\| ${escapeMarkdown(yToken)}: ${escapeMarkdown(s2.yAmt!)}`,
        ].join("\n");
        await presentNew(sessionCtx2, summary, async () => {
          const kp = resolveKeypair(config);
          const rpc = resolveRpc(config);
          const Ctor = await lazyDLMM();
          const dlmm = new Ctor(kp, rpc);
          return dlmm.addLiquidity({
            poolAddress: s2.poolAddress,
            positionPubkey: s2.positionPubkey,
            strategy: s2.strategy!,
            totalXAmount: s2.xAmt!,
            totalYAmount: s2.yAmt!,
            amountsAreHuman: true,
            minBinId: 0,
            maxBinId: 0,
          });
        });
      };
      await sessionCtx.reply(`✅ ${escapeMarkdown(xToken)}: ${escapeMarkdown(text)}\n\nNow send ${escapeMarkdown(yToken)} amount \\(or 0 if single\\-sided\\):`, MD);
      setInputSession(chatId, yHandler);
    };
    setInputSession(chatId, xHandler);
    await ctx.editMessageText(`✏️ Send amount for *${escapeMarkdown(xToken)}* \\(e\\.g\\. 0\\.5\\):`, MD);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── mng:removeliq — FULL INTERACTIVE FORM ───────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  bot.callbackQuery(/^mng:removeliq:(a\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) return await expired(ctx);
    const { poolAddress, positionPubkey } = pair;
    await ctx.editMessageText(
      `${tgBold("➖ Remove Liquidity")}\n\nSelect amount:`,
      {
        ...MD,
        reply_markup: new InlineKeyboard()
          .text("25%", `mng:removeliq:bps:${actionId}:2500`)
          .text("50%", `mng:removeliq:bps:${actionId}:5000`)
          .row()
          .text("75%", `mng:removeliq:bps:${actionId}:7500`)
          .text("100%", `mng:removeliq:bps:${actionId}:10000`)
          .row()
          .text("✏️ Custom", `mng:removeliq:custom:${actionId}`)
          .row()
          .text("⬅️ Back", `mng:pos:${actionId}`),
      },
    );
  });

  bot.callbackQuery(/^mng:removeliq:bps:([^:]+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const bps = parseInt(ctx.match![2], 10);
    const pair = resolveAction(actionId);
    if (!pair) return await expired(ctx);
    const { poolAddress, positionPubkey } = pair;
    const summary = [
      tgBold("➖ Remove Liquidity?"),
      `Pool: ${tgCode(poolAddress)}`,
      `Position: ${tgCode(positionPubkey)}`,
      `Amount: ${escapeMarkdown(`${(bps / 100).toFixed(2)}%`)}`,
    ].join("\n");
    await presentEdit(ctx, summary, async () => {
      const kp = resolveKeypair(config);
      const rpc = resolveRpc(config);
      const Ctor = await lazyDLMM();
      const dlmm = new Ctor(kp, rpc);
      return dlmm.removeLiquidity({
        poolAddress,
        positionPubkey,
        bpsToRemove: bps,
        shouldClaimAndClose: false,
      });
    });
  });

  bot.callbackQuery(/^mng:removeliq:custom:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) return await expired(ctx);
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);
    const { poolAddress, positionPubkey } = pair;
    const bpsHandler = async (text: string, sessionCtx: Context) => {
      const bps = parseInt(text, 10);
      if (Number.isNaN(bps) || bps < 1 || bps > 10000) {
        await sessionCtx.reply("✖ BPS must be between 1 and 10000\\. Send a number:", MD);
        setInputSession(chatId, bpsHandler);
        return;
      }
      const summary = [
        tgBold("➖ Remove Liquidity?"),
        `Pool: ${tgCode(poolAddress)}`,
        `Position: ${tgCode(positionPubkey)}`,
        `Amount: ${escapeMarkdown(`${(bps / 100).toFixed(2)}%`)}`,
      ].join("\n");
      await presentNew(sessionCtx, summary, async () => {
        const kp = resolveKeypair(config);
        const rpc = resolveRpc(config);
        const Ctor = await lazyDLMM();
        const dlmm = new Ctor(kp, rpc);
        return dlmm.removeLiquidity({
          poolAddress,
          positionPubkey,
          bpsToRemove: bps,
          shouldClaimAndClose: false,
        });
      });
    };
    setInputSession(chatId, bpsHandler);
    await ctx.editMessageText("✏️ Send BPS \\(1\\-10000, e\\.g\\. 5000 \\= 50%\\):", MD);
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

async function showActionPanel(
  ctx: Context,
  tokenX: string,
  tokenY: string,
  poolAddress: string,
  positionPubkey: string,
  actionId: string,
  backTarget: string,
) {
  const text = actionPanelMessage(tokenX, tokenY, poolAddress, positionPubkey);
  const kb = actionPanelKeyboard(actionId, PREFIX, backTarget, [
    { label: "🔴 Close & Zap", action: "close" },
    { label: "💎 Claim Fee", action: "claimfee" },
    { label: "🎁 Claim Reward", action: "reward" },
    { label: "➕ Add Liq", action: "addliq" },
    { label: "➖ Remove Liq", action: "removeliq" },
  ]);
  await ctx.editMessageText(text, { ...MD, reply_markup: kb });
}

async function presentEdit(ctx: Context, summary: string, run: () => Promise<string>) {
  const opId = nextOpId();
  pending.set(opId, { summary, run });
  const kb = new InlineKeyboard()
    .text("✅ Confirm", `mconfirm:${opId}`)
    .text("❌ Cancel", `mcancel:${opId}`);
  await ctx.editMessageText(summary, { ...MD, reply_markup: kb });
}

async function presentNew(ctx: Context, summary: string, run: () => Promise<string>) {
  const opId = nextOpId();
  pending.set(opId, { summary, run });
  const kb = new InlineKeyboard()
    .text("✅ Confirm", `mconfirm:${opId}`)
    .text("❌ Cancel", `mcancel:${opId}`);
  await ctx.reply(summary, { ...MD, reply_markup: kb });
}

async function expired(ctx: Context) {
  await ctx.editMessageText("⌛ Expired\\. Please run /manage again\\.", {
    ...MD,
    reply_markup: new InlineKeyboard().text("🔄 Manage", "mng:pools"),
  });
}
