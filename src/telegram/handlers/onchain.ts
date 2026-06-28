import { Bot, Context, InlineKeyboard } from "grammy";
import { Keypair } from "@solana/web3.js";
import type { VexisConfig } from "../../config.js";
import { resolveKeypair, resolveRpc, resolveWallet } from "../../config.js";
import { escapeMarkdown, tgCode, tgTxLink } from "../format.js";
import { MD, replyError } from "../utils.js";
import { registerAction, resolveAction } from "../action-store.js";
import { setInputSession } from "../input-store.js";
import {
  fetchOpenPools,
  showPoolList,
  resolvePoolDetail,
} from "../pool-position-selector.js";
import type { StrategyType } from "../../types.js";

interface Pending {
  summary: string;
  run: () => Promise<string>;
}
const pending = new Map<string, Pending>();
let counter = 0;
const nextId = () => `op${++counter}`;

const STRATEGIES = new Set<StrategyType>(["spot", "bidask", "curve"]);

let DLMMClientCtor: any = null;
async function lazyDLMM() {
  if (!DLMMClientCtor) {
    const mod = await import("../../dlmm.js");
    DLMMClientCtor = mod.DLMMClient;
  }
  return DLMMClientCtor;
}

let ZapClientCtor: any = null;
async function lazyZap() {
  if (!ZapClientCtor) {
    const mod = await import("../../zap.js");
    ZapClientCtor = mod.ZapClient;
  }
  return ZapClientCtor;
}

// ─── Session stores for multi-step interactive flows ────────────────────────

interface AddLiqSession {
  poolAddress: string;
  positionPubkey: string;
  strategy?: StrategyType;
  xAmt?: string;
  yAmt?: string;
}
const addLiqSessions = new Map<string, AddLiqSession>();

interface RemoveLiqSession {
  poolAddress: string;
  positionPubkey: string;
}
const removeLiqSessions = new Map<string, RemoveLiqSession>();

export function registerOnchain(bot: Bot, config: VexisConfig) {
  const requireKeypair = (): Keypair => resolveKeypair(config);

  const makeDlmmRunner = (fn: (dlmm: any) => Promise<string>) => async (): Promise<string> => {
    const kp = resolveKeypair(config);
    const rpc = resolveRpc(config);
    const Ctor = await lazyDLMM();
    const dlmm = new Ctor(kp, rpc);
    return fn(dlmm);
  };

  const makeZapRunner = (fn: (zap: any) => Promise<string>) => async (): Promise<string> => {
    const kp = resolveKeypair(config);
    const rpc = resolveRpc(config);
    const Ctor = await lazyZap();
    const zap = new Ctor(kp, rpc);
    return fn(zap);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  /create — with args (existing), without args → handled by create.ts
  // ═══════════════════════════════════════════════════════════════════════════
  bot.command("create", async (ctx) => {
    try {
      requireKeypair();
      const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
      const usage =
        "Usage:\n" +
        "`/create <poolAddr> <strategy> <xAmt> <yAmt> pct <minPct> <maxPct> [single|single-y]`\n" +
        "`/create <poolAddr> <strategy> <xAmt> <yAmt> <minBin> <maxBin> [single|single-y]`\n" +
        "Pct example: `pct -50 0` \\= from \\-50% to current price\\. Amounts are human \\(e\\.g\\. 0\\.5\\)\\.\n" +
        "`single` = single\\-sided X \\(meme\\), `single-y` = single\\-sided Y \\(SOL\\)";
      if (parts.length < 6) {
        await ctx.reply(usage, MD);
        return;
      }
      const keyword = parts[4].toLowerCase();
      const isPctMode = keyword === "pct" || keyword === "%";
      const keyed = isPctMode;
      const [poolAddress, strategy, xAmt, yAmt] = parts;
      const rangeA = keyed ? parts[5] : parts[4];
      const rangeB = keyed ? parts[6] : parts[5];
      const sideArg = keyed ? parts[7] : parts[6];
      if (rangeA == null || rangeB == null) { await ctx.reply(usage, MD); return; }
      if (!STRATEGIES.has(strategy as StrategyType)) { await ctx.reply("Strategy must be: spot, bidask, or curve", MD); return; }
      const singleSidedX = sideArg === "single" || sideArg === "single-x" || sideArg === "singlex";
      const singleSidedY = sideArg === "single-y" || sideArg === "singley";
      const mode = singleSidedX ? "single-sided X (meme)" : singleSidedY ? "single-sided Y (SOL)" : "two-sided";
      const rangeLabel = isPctMode ? `${rangeA}% to ${rangeB}% (vs current price)` : `bins ${rangeA} to ${rangeB} (relative)`;
      const summary = [
        "*Create position?*",
        `Pool: ${tgCode(poolAddress)}`,
        `Strategy: ${escapeMarkdown(strategy)} \\| Range: ${escapeMarkdown(rangeLabel)}`,
        `X: ${escapeMarkdown(xAmt)} \\| Y: ${escapeMarkdown(yAmt)}`,
        `Mode: ${escapeMarkdown(mode)}`,
      ].join("\n");
      await present(ctx, summary, makeDlmmRunner(async (dlmm) => {
        const res = await dlmm.createPosition({
          poolAddress, strategy: strategy as StrategyType,
          totalXAmount: xAmt, totalYAmount: yAmt, amountsAreHuman: true, singleSidedX, singleSidedY,
          ...(isPctMode
            ? { minPct: parseFloat(rangeA) / 100, maxPct: parseFloat(rangeB) / 100 }
            : { minBinId: parseInt(rangeA, 10), maxBinId: parseInt(rangeB, 10), relativeBins: true }),
        });
        return res.signatures.join("\n");
      }));
    } catch (e) { await replyError(ctx, e); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  /close — with args (existing), without args → interactive pool→position
  // ═══════════════════════════════════════════════════════════════════════════
  bot.command("close", async (ctx) => {
    try {
      requireKeypair();
      const [poolAddress, positionPubkey] = (ctx.match as string).trim().split(/\s+/);
      if (poolAddress && positionPubkey) {
        // Has args — direct execution
        const summary = [
          "*Close & Zap Out?*",
          `Pool: ${tgCode(poolAddress)}`,
          `Position: ${tgCode(positionPubkey)}`,
          "", "Remove all liquidity \\+ claim fees\\, then swap to SOL via Jupiter\\.",
        ].join("\n");
        await present(ctx, summary, makeZapRunner(async (zap) => {
          const result = await zap.closeAndZapOut(poolAddress, positionPubkey);
          const sig = result.zapSig || result.closeSig;
          if (!sig) throw new Error("Close produced no transaction signature");
          return sig;
        }));
        return;
      }
      // No args — interactive pool → position
      await interactivePoolList(ctx, "close");
    } catch (e) { await replyError(ctx, e); }
  });

  // ─── close:pool:<addr> — show positions for close ────────────────────────
  bot.callbackQuery(/^close:pool:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const poolAddr = ctx.match![1];
    await ctx.editMessageText("⏳ Loading\\.\\.\\.", MD);
    try {
      const detail = await resolvePoolDetail(null as any, config, poolAddr);
      if (!detail) {
        await ctx.editMessageText("Pool not found\\.", { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "close:pools") });
        return;
      }
      const kb = new InlineKeyboard();
      const actionIds = detail.positions.map((p) => registerAction(poolAddr, p));
      detail.positions.forEach((pos, i) => {
        kb.text(`#${i + 1}: ${pos.slice(0, 6)}…${pos.slice(-4)}`, `close:pos:${actionIds[i]}`).row();
      });
      kb.text("⬅️ Back", "close:pools");
      const text = [
        "*Close — Select Position*",
        `Pool: ${tgCode(poolAddr)}`,
      ].join("\n");
      await ctx.editMessageText(text, { ...MD, reply_markup: kb });
    } catch (e) {
      await ctx.editMessageText(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "close:pools") });
    }
  });

  // ─── close:pos:<actionId> — confirm close ────────────────────────────────
  bot.callbackQuery(/^close:pos:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) { await ctx.editMessageText("⌛ Expired\\.", MD); return; }
    const { poolAddress, positionPubkey } = pair;
    const summary = [
      "*Close & Zap Out?*",
      `Pool: ${tgCode(poolAddress)}`,
      `Position: ${tgCode(positionPubkey)}`,
      "", "Remove all liquidity \\+ claim fees\\, then swap to SOL via Jupiter\\.",
    ].join("\n");
    await present(ctx, summary, makeZapRunner(async (zap) => {
      const result = await zap.closeAndZapOut(poolAddress, positionPubkey);
      const sig = result.zapSig || result.closeSig;
      if (!sig) throw new Error("Close produced no transaction signature");
      return sig;
    }));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  /addliq — with args (existing), without args → interactive form
  // ═══════════════════════════════════════════════════════════════════════════
  bot.command("addliq", async (ctx) => {
    try {
      requireKeypair();
      const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 5) {
        const [poolAddress, positionPubkey, strategy, xAmt, yAmt] = parts;
        if (!STRATEGIES.has(strategy as StrategyType)) { await ctx.reply("Strategy must be: spot, bidask, or curve", MD); return; }
        const summary = [
          "*Add liquidity?*",
          `Pool: ${tgCode(poolAddress)}`,
          `Position: ${tgCode(positionPubkey)}`,
          `Strategy: ${escapeMarkdown(strategy)} \\| X: ${escapeMarkdown(xAmt)} \\| Y: ${escapeMarkdown(yAmt)}`,
        ].join("\n");
        await present(ctx, summary, makeDlmmRunner((dlmm) =>
          dlmm.addLiquidity({ poolAddress, positionPubkey, strategy: strategy as StrategyType, totalXAmount: xAmt, totalYAmount: yAmt, amountsAreHuman: true, minBinId: 0, maxBinId: 0 })
        ));
        return;
      }
      // No args — interactive pool → position
      await interactivePoolList(ctx, "addliq");
    } catch (e) { await replyError(ctx, e); }
  });

  // ─── addliq:pool:<addr> — show positions ─────────────────────────────────
  bot.callbackQuery(/^addliq:pool:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const poolAddr = ctx.match![1];
    await ctx.editMessageText("⏳ Loading\\.\\.\\.", MD);
    try {
      const detail = await resolvePoolDetail(null as any, config, poolAddr);
      if (!detail) { await ctx.editMessageText("Pool not found\\.", { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "addliq:pools") }); return; }
      const kb = new InlineKeyboard();
      detail.positions.forEach((pos, i) => {
        const aid = registerAction(poolAddr, pos);
        kb.text(`#${i + 1}: ${pos.slice(0, 6)}…${pos.slice(-4)}`, `addliq:pos:${aid}`).row();
      });
      kb.text("⬅️ Back", "addliq:pools");
      await ctx.editMessageText(`*Add Liquidity — Select Position*\nPool: ${tgCode(poolAddr)}`, { ...MD, reply_markup: kb });
    } catch (e) {
      await ctx.editMessageText(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "addliq:pools") });
    }
  });

  // ─── addliq:pos:<actionId> — choose strategy ─────────────────────────────
  bot.callbackQuery(/^addliq:pos:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) { await ctx.editMessageText("⌛ Expired\\.", MD); return; }
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);
    addLiqSessions.set(chatId, { poolAddress: pair.poolAddress, positionPubkey: pair.positionPubkey });
    await ctx.editMessageText("Select strategy:", {
      ...MD,
      reply_markup: new InlineKeyboard()
        .text("📊 Spot", `addliq:strategy:${actionId}:spot`).row()
        .text("📈 Bid-Ask", `addliq:strategy:${actionId}:bidask`).row()
        .text("🔔 Curve", `addliq:strategy:${actionId}:curve`).row()
        .text("⬅️ Back", `addliq:pool:${pair.poolAddress}`),
    });
  });

  // ─── addliq:strategy:<actionId>:<strategy> — prompt X amount ─────────────
  bot.callbackQuery(/^addliq:strategy:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const strategy = ctx.match![2] as StrategyType;
    const pair = resolveAction(actionId);
    if (!pair) { await ctx.editMessageText("⌛ Expired\\.", MD); return; }
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);
    const session = addLiqSessions.get(chatId);
    if (!session) return;
    session.strategy = strategy;
    addLiqSessions.set(chatId, session);

    let retry = 0;
    setInputSession(chatId, async (text) => {
      const val = parseFloat(text);
      if (Number.isNaN(val) || val < 0) {
        retry++;
        if (retry >= 3) { await ctx.reply("✖ Too many invalid attempts\\. Use /addliq to retry\\.", MD); return; }
        await ctx.reply("✖ Invalid amount\\. Send X amount \\(meme token, e\\.g\\. 1000\\):", MD);
        return;
      }
      const s = addLiqSessions.get(chatId);
      if (!s) return;
      s.xAmt = text;
      addLiqSessions.set(chatId, s);

      let retryY = 0;
      setInputSession(chatId, async (text2) => {
        const val2 = parseFloat(text2);
        if (Number.isNaN(val2) || val2 < 0) {
          retryY++;
          if (retryY >= 3) { await ctx.reply("✖ Too many invalid attempts\\. Use /addliq to retry\\.", MD); return; }
          await ctx.reply("✖ Invalid amount\\. Send Y amount \\(SOL/stable, e\\.g\\. 0\\.5\\):", MD);
          return;
        }
        const s2 = addLiqSessions.get(chatId);
        if (!s2) return;
        s2.yAmt = text2;
        addLiqSessions.delete(chatId);
        const summary = [
          "*Add liquidity?*",
          `Pool: ${tgCode(s2.poolAddress)}`,
          `Position: ${tgCode(s2.positionPubkey)}`,
          `Strategy: ${escapeMarkdown(s2.strategy!)} \\| X: ${escapeMarkdown(s2.xAmt!)} \\| Y: ${escapeMarkdown(s2.yAmt!)}`,
        ].join("\n");
        await present(ctx, summary, makeDlmmRunner((dlmm) =>
          dlmm.addLiquidity({
            poolAddress: s2.poolAddress,
            positionPubkey: s2.positionPubkey,
            strategy: s2.strategy!,
            totalXAmount: s2.xAmt!,
            totalYAmount: s2.yAmt!,
            amountsAreHuman: true,
            minBinId: 0,
            maxBinId: 0,
          })
        ));
      });
      await ctx.reply(`✅ X: ${escapeMarkdown(text)}\n\nNow send *Y amount* \\(SOL/stable, e\\.g\\. 0\\.5\\):`, MD);
    });
    await ctx.editMessageText("✏️ Send *X amount* \\(meme token, e\\.g\\. 1000\\):", MD);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  /removeliq — with args (existing), without args → interactive form
  // ═══════════════════════════════════════════════════════════════════════════
  bot.command("removeliq", async (ctx) => {
    try {
      requireKeypair();
      const [poolAddress, positionPubkey, bps] = (ctx.match as string).trim().split(/\s+/);
      if (poolAddress && positionPubkey && bps) {
        const bpsNum = parseInt(bps, 10);
        if (Number.isNaN(bpsNum) || bpsNum < 1 || bpsNum > 10000) { await ctx.reply("bps must be between 1 and 10000", MD); return; }
        const summary = [
          "*Remove liquidity?*",
          `Pool: ${tgCode(poolAddress)}`,
          `Position: ${tgCode(positionPubkey)}`,
          `Amount: ${escapeMarkdown(`${(bpsNum / 100).toFixed(2)}%`)}`,
        ].join("\n");
        await present(ctx, summary, makeDlmmRunner((dlmm) =>
          dlmm.removeLiquidity({ poolAddress, positionPubkey, bpsToRemove: bpsNum, shouldClaimAndClose: false })
        ));
        return;
      }
      await interactivePoolList(ctx, "removeliq");
    } catch (e) { await replyError(ctx, e); }
  });

  // ─── removeliq:pool:<addr> — show positions ──────────────────────────────
  bot.callbackQuery(/^removeliq:pool:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const poolAddr = ctx.match![1];
    await ctx.editMessageText("⏳ Loading\\.\\.\\.", MD);
    try {
      const detail = await resolvePoolDetail(null as any, config, poolAddr);
      if (!detail) { await ctx.editMessageText("Pool not found\\.", { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "removeliq:pools") }); return; }
      const kb = new InlineKeyboard();
      detail.positions.forEach((pos, i) => {
        const aid = registerAction(poolAddr, pos);
        kb.text(`#${i + 1}: ${pos.slice(0, 6)}…${pos.slice(-4)}`, `removeliq:pos:${aid}`).row();
      });
      kb.text("⬅️ Back", "removeliq:pools");
      await ctx.editMessageText(`*Remove Liquidity — Select Position*\nPool: ${tgCode(poolAddr)}`, { ...MD, reply_markup: kb });
    } catch (e) {
      await ctx.editMessageText(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "removeliq:pools") });
    }
  });

  // ─── removeliq:pos:<actionId> — show BPS selection ───────────────────────
  bot.callbackQuery(/^removeliq:pos:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) { await ctx.editMessageText("⌛ Expired\\.", MD); return; }
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);
    removeLiqSessions.set(chatId, { poolAddress: pair.poolAddress, positionPubkey: pair.positionPubkey });
    await ctx.editMessageText("Select amount:", {
      ...MD,
      reply_markup: new InlineKeyboard()
        .text("25%", `removeliq:bps:${actionId}:2500`).text("50%", `removeliq:bps:${actionId}:5000`).row()
        .text("75%", `removeliq:bps:${actionId}:7500`).text("100%", `removeliq:bps:${actionId}:10000`).row()
        .text("✏️ Custom", `removeliq:custom:${actionId}`).row()
        .text("⬅️ Back", `removeliq:pool:${pair.poolAddress}`),
    });
  });

  // ─── removeliq:bps:<actionId>:<bps> — confirm remove ─────────────────────
  bot.callbackQuery(/^removeliq:bps:([^:]+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const bps = parseInt(ctx.match![2], 10);
    const pair = resolveAction(actionId);
    if (!pair) { await ctx.editMessageText("⌛ Expired\\.", MD); return; }
    const { poolAddress, positionPubkey } = pair;
    const summary = [
      "*Remove liquidity?*",
      `Pool: ${tgCode(poolAddress)}`,
      `Position: ${tgCode(positionPubkey)}`,
      `Amount: ${escapeMarkdown(`${(bps / 100).toFixed(2)}%`)}`,
    ].join("\n");
    await present(ctx, summary, makeDlmmRunner((dlmm) =>
      dlmm.removeLiquidity({ poolAddress, positionPubkey, bpsToRemove: bps, shouldClaimAndClose: false })
    ));
  });

  // ─── removeliq:custom:<actionId> — prompt custom BPS ─────────────────────
  bot.callbackQuery(/^removeliq:custom:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) { await ctx.editMessageText("⌛ Expired\\.", MD); return; }
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);
    let retry = 0;
    setInputSession(chatId, async (text) => {
      const bps = parseInt(text, 10);
      if (Number.isNaN(bps) || bps < 1 || bps > 10000) {
        retry++;
        if (retry >= 3) { await ctx.reply("✖ Too many invalid attempts\\. Use /removeliq to retry\\.", MD); return; }
        await ctx.reply("✖ BPS must be between 1 and 10000\\. Send a number:", MD);
        return;
      }
      const { poolAddress, positionPubkey } = pair!;
      const summary = [
        "*Remove liquidity?*",
        `Pool: ${tgCode(poolAddress)}`,
        `Position: ${tgCode(positionPubkey)}`,
        `Amount: ${escapeMarkdown(`${(bps / 100).toFixed(2)}%`)}`,
      ].join("\n");
      await present(ctx, summary, makeDlmmRunner((dlmm) =>
        dlmm.removeLiquidity({ poolAddress, positionPubkey, bpsToRemove: bps, shouldClaimAndClose: false })
      ));
    });
    await ctx.editMessageText("✏️ Send BPS \\(1\\-10000, e\\.g\\. 5000 \\= 50%\\):", MD);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  /claimfee — with args (existing), without args → interactive pool→position
  // ═══════════════════════════════════════════════════════════════════════════
  bot.command("claimfee", async (ctx) => {
    try {
      requireKeypair();
      const [poolAddress, positionPubkey] = (ctx.match as string).trim().split(/\s+/);
      if (poolAddress && positionPubkey) {
        const summary = [
          "*Claim fees \\+ Zap to SOL?*",
          `Pool: ${tgCode(poolAddress)}`,
          `Position: ${tgCode(positionPubkey)}`,
          "", "Claim swap fees \\+ swap to SOL via Jupiter\\.",
        ].join("\n");
        await present(ctx, summary, makeZapRunner(async (zap) => {
          const result = await zap.claimAndZapOut(poolAddress, positionPubkey);
          const sig = result.zapSig || result.claimSig;
          if (!sig) throw new Error("Claim produced no transaction signature");
          return sig;
        }));
        return;
      }
      await interactivePoolList(ctx, "claimfee");
    } catch (e) { await replyError(ctx, e); }
  });

  // ─── claimfee:pool:<addr> — show positions ───────────────────────────────
  bot.callbackQuery(/^claimfee:pool:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const poolAddr = ctx.match![1];
    await ctx.editMessageText("⏳ Loading\\.\\.\\.", MD);
    try {
      const detail = await resolvePoolDetail(null as any, config, poolAddr);
      if (!detail) { await ctx.editMessageText("Pool not found\\.", { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "claimfee:pools") }); return; }
      const kb = new InlineKeyboard();
      detail.positions.forEach((pos, i) => {
        const aid = registerAction(poolAddr, pos);
        kb.text(`#${i + 1}: ${pos.slice(0, 6)}…${pos.slice(-4)}`, `claimfee:pos:${aid}`).row();
      });
      kb.text("⬅️ Back", "claimfee:pools");
      await ctx.editMessageText(`*Claim Fees — Select Position*\nPool: ${tgCode(poolAddr)}`, { ...MD, reply_markup: kb });
    } catch (e) {
      await ctx.editMessageText(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "claimfee:pools") });
    }
  });

  // ─── claimfee:pos:<actionId> — confirm ───────────────────────────────────
  bot.callbackQuery(/^claimfee:pos:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) { await ctx.editMessageText("⌛ Expired\\.", MD); return; }
    const { poolAddress, positionPubkey } = pair;
    const summary = [
      "*Claim fees \\+ Zap to SOL?*",
      `Pool: ${tgCode(poolAddress)}`,
      `Position: ${tgCode(positionPubkey)}`,
      "", "Claim swap fees \\+ swap to SOL via Jupiter\\.",
    ].join("\n");
    await present(ctx, summary, makeZapRunner(async (zap) => {
      const result = await zap.claimAndZapOut(poolAddress, positionPubkey);
      const sig = result.zapSig || result.claimSig;
      if (!sig) throw new Error("Claim produced no transaction signature");
      return sig;
    }));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  /claimreward — with args (existing), without args → interactive
  // ═══════════════════════════════════════════════════════════════════════════
  bot.command("claimreward", async (ctx) => {
    try {
      requireKeypair();
      const [poolAddress, positionPubkey] = (ctx.match as string).trim().split(/\s+/);
      if (poolAddress && positionPubkey) {
        const summary = [
          "*Claim rewards?*",
          `Pool: ${tgCode(poolAddress)}`,
          `Position: ${tgCode(positionPubkey)}`,
        ].join("\n");
        await present(ctx, summary, makeDlmmRunner((dlmm) =>
          dlmm.claimReward(poolAddress, positionPubkey)
        ));
        return;
      }
      await interactivePoolList(ctx, "claimreward");
    } catch (e) { await replyError(ctx, e); }
  });

  // ─── claimreward:pool:<addr> — show positions ────────────────────────────
  bot.callbackQuery(/^claimreward:pool:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const poolAddr = ctx.match![1];
    await ctx.editMessageText("⏳ Loading\\.\\.\\.", MD);
    try {
      const detail = await resolvePoolDetail(null as any, config, poolAddr);
      if (!detail) { await ctx.editMessageText("Pool not found\\.", { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "claimreward:pools") }); return; }
      const kb = new InlineKeyboard();
      detail.positions.forEach((pos, i) => {
        const aid = registerAction(poolAddr, pos);
        kb.text(`#${i + 1}: ${pos.slice(0, 6)}…${pos.slice(-4)}`, `claimreward:pos:${aid}`).row();
      });
      kb.text("⬅️ Back", "claimreward:pools");
      await ctx.editMessageText(`*Claim Rewards — Select Position*\nPool: ${tgCode(poolAddr)}`, { ...MD, reply_markup: kb });
    } catch (e) {
      await ctx.editMessageText(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, { ...MD, reply_markup: new InlineKeyboard().text("⬅️ Back", "claimreward:pools") });
    }
  });

  // ─── claimreward:pos:<actionId> — confirm ────────────────────────────────
  bot.callbackQuery(/^claimreward:pos:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const actionId = ctx.match![1];
    const pair = resolveAction(actionId);
    if (!pair) { await ctx.editMessageText("⌛ Expired\\.", MD); return; }
    const { poolAddress, positionPubkey } = pair;
    const summary = [
      "*Claim rewards?*",
      `Pool: ${tgCode(poolAddress)}`,
      `Position: ${tgCode(positionPubkey)}`,
    ].join("\n");
    await present(ctx, summary, makeDlmmRunner((dlmm) =>
      dlmm.claimReward(poolAddress, positionPubkey)
    ));
  });

  // ─── Generic back-to-pool-list handlers ─────────────────────────────────
  // All interactive commands use "{prefix}:pools" back target to re-show pool list.
  const BACK_PREFIXES = ["close", "addliq", "removeliq", "claimfee", "claimreward"];
  const backPattern = new RegExp(`^(${BACK_PREFIXES.join("|")}):pools$`);
  bot.callbackQuery(backPattern, async (ctx) => {
    await ctx.answerCallbackQuery();
    const prefix = ctx.match![1];
    const pools = await fetchOpenPools(null, config);
    if (pools.length === 0) {
      await ctx.editMessageText("📭 No open positions\\.", MD);
      return;
    }
    const kb = new InlineKeyboard();
    for (const p of pools) {
      const range = p.outOfRange ? " ⚠️" : "";
      const label = `${p.tokenX}/${p.tokenY}${range} · ${p.openPositionCount} pos`;
      kb.text(label.slice(0, 30), `${prefix}:pool:${p.poolAddress}`).row();
    }
    await ctx.editMessageText("📈 Open Positions — Select Pool", { ...MD, reply_markup: kb });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  Confirm / Cancel callbacks
  // ═══════════════════════════════════════════════════════════════════════════
  bot.callbackQuery(/^confirm:(.+)$/, async (ctx) => {
    const id = ctx.match![1];
    const op = pending.get(id);
    pending.delete(id);
    await ctx.answerCallbackQuery();
    if (!op) { await ctx.editMessageText("⌛ Expired \\(operation no longer available\\)", MD); return; }
    await ctx.editMessageText("⏳ Sending transaction\\.\\.\\.", MD);
    try {
      const result = await op.run();
      const sigs = result.split("\n").map((s) => s.trim()).filter(Boolean);
      const body = sigs.map(tgTxLink).join("\n");
      await ctx.editMessageText(`✅ Done\\!\n${body}`, MD);
    } catch (e) {
      await ctx.editMessageText(`✖ Failed: ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, MD);
    }
  });

  bot.callbackQuery(/^cancel:(.+)$/, async (ctx) => {
    const id = ctx.match![1];
    pending.delete(id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("❌ Cancelled\\.", MD);
  });

  // ─── interactivePoolList — internal helper ───────────────────────────────
  async function interactivePoolList(ctx: Context, prefix: string) {
    try {
      const pools = await fetchOpenPools(null, config);
      if (pools.length === 0) {
        await ctx.reply("📭 No open positions\\.", MD);
        return;
      }
      const kb = new InlineKeyboard();
      for (const p of pools) {
        const range = p.outOfRange ? " ⚠️" : "";
        const label = `${p.tokenX}/${p.tokenY}${range} · ${p.openPositionCount} pos`;
        kb.text(label.slice(0, 30), `${prefix}:pool:${p.poolAddress}`).row();
      }
      await ctx.reply("📈 Open Positions — Select Pool", { ...MD, reply_markup: kb });
    } catch (e) {
      await ctx.reply(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, MD);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function present(ctx: Context, summary: string, run: () => Promise<string>) {
  const id = nextId();
  pending.set(id, { summary, run });
  const kb = new InlineKeyboard()
    .text("✅ Confirm", `confirm:${id}`)
    .text("❌ Cancel", `cancel:${id}`);
  await ctx.reply(summary, { ...MD, reply_markup: kb });
}
