import { Bot, Context, InlineKeyboard } from "grammy";
import type { Keypair } from "@solana/web3.js";
import type { VexisConfig } from "../../config.js";
import { resolveKeypair, resolveRpc } from "../../config.js";
import { escapeMarkdown, tgCode } from "../format.js";
import type { StrategyType } from "../../types.js";

const MD = { parse_mode: "MarkdownV2" as const };

// Pending operations awaiting confirmation, keyed by a short id embedded in the
// inline-keyboard callback data. Each entry is a thunk that performs the tx.
interface Pending {
  summary: string;
  run: (dlmm: any) => Promise<string>;
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

export function registerOnchain(bot: Bot, config: VexisConfig) {
  // Ensure a keypair is configured before allowing any write command.
  const requireKeypair = (): Keypair => resolveKeypair(config);

  bot.command("create", async (ctx) => {
    try {
      requireKeypair();
      const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
      if (parts.length < 6) {
        await ctx.reply(
          "Usage: `/create <poolAddr> <strategy> <xAmt> <yAmt> <minBin> <maxBin> [single]`\n" +
            "Optional `single` = single\\-sided X \\(meme\\)\n" +
            "`single-y` = single\\-sided Y \\(SOL\\)",
          MD
        );
        return;
      }
      const [poolAddress, strategy, xAmt, yAmt, minBin, maxBin, sideArg] = parts;
      if (!STRATEGIES.has(strategy as StrategyType)) {
        await ctx.reply("Strategy must be: spot, bidask, or curve", MD);
        return;
      }
      const singleSidedX =
        sideArg === "single" || sideArg === "single-x" || sideArg === "singlex";
      const singleSidedY = sideArg === "single-y" || sideArg === "singley";
      const isSingleSided = singleSidedX || singleSidedY;
      const mode = singleSidedX ? "single-sided X (meme)" : singleSidedY ? "single-sided Y (SOL)" : "two-sided";
      const summary = [
        "*Create position?*",
        `Pool: ${tgCode(poolAddress)}`,
        `Strategy: ${escapeMarkdown(strategy)} \\| Range: ${escapeMarkdown(`${minBin} to ${maxBin}`)}`,
        `X: ${escapeMarkdown(xAmt)} \\| Y: ${escapeMarkdown(yAmt)}`,
        `Mode: ${escapeMarkdown(mode)}`,
      ].join("\n");
      await present(ctx, summary, (dlmm) =>
        dlmm.createPosition({
          poolAddress,
          strategy: strategy as StrategyType,
          totalXAmount: xAmt,
          totalYAmount: yAmt,
          minBinId: parseInt(minBin, 10),
          maxBinId: parseInt(maxBin, 10),
          singleSidedX,
        })
      );
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("close", async (ctx) => {
    try {
      requireKeypair();
      const [poolAddress, positionPubkey] = (ctx.match as string).trim().split(/\s+/);
      if (!poolAddress || !positionPubkey) {
        await ctx.reply("Usage: `/close <poolAddr> <positionPubkey>`", MD);
        return;
      }
      const summary = [
        "*Close position?*",
        `Pool: ${tgCode(poolAddress)}`,
        `Position: ${tgCode(positionPubkey)}`,
      ].join("\n");
      await present(ctx, summary, (dlmm) => dlmm.closePosition(poolAddress, positionPubkey));
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("addliq", async (ctx) => {
    try {
      requireKeypair();
      const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
      if (parts.length < 5) {
        await ctx.reply(
          "Usage: `/addliq <poolAddr> <positionPubkey> <strategy> <xAmt> <yAmt>`",
          MD
        );
        return;
      }
      const [poolAddress, positionPubkey, strategy, xAmt, yAmt] = parts;
      if (!STRATEGIES.has(strategy as StrategyType)) {
        await ctx.reply("Strategy must be: spot, bidask, or curve", MD);
        return;
      }
      const summary = [
        "*Add liquidity?*",
        `Pool: ${tgCode(poolAddress)}`,
        `Position: ${tgCode(positionPubkey)}`,
        `Strategy: ${escapeMarkdown(strategy)} \\| X: ${escapeMarkdown(xAmt)} \\| Y: ${escapeMarkdown(yAmt)}`,
      ].join("\n");
      await present(ctx, summary, (dlmm) =>
        dlmm.addLiquidity({
          poolAddress,
          positionPubkey,
          strategy: strategy as StrategyType,
          totalXAmount: xAmt,
          totalYAmount: yAmt,
          minBinId: 0,
          maxBinId: 0,
        })
      );
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("removeliq", async (ctx) => {
    try {
      requireKeypair();
      const [poolAddress, positionPubkey, bps] = (ctx.match as string).trim().split(/\s+/);
      if (!poolAddress || !positionPubkey || !bps) {
        await ctx.reply("Usage: `/removeliq <poolAddr> <positionPubkey> <bps 1-10000>`", MD);
        return;
      }
      const bpsNum = parseInt(bps, 10);
      if (Number.isNaN(bpsNum) || bpsNum < 1 || bpsNum > 10000) {
        await ctx.reply("bps must be between 1 and 10000", MD);
        return;
      }
      const summary = [
        "*Remove liquidity?*",
        `Pool: ${tgCode(poolAddress)}`,
        `Position: ${tgCode(positionPubkey)}`,
        `Amount: ${escapeMarkdown(`${(bpsNum / 100).toFixed(2)}%`)}`,
      ].join("\n");
      await present(ctx, summary, (dlmm) =>
        dlmm.removeLiquidity({
          poolAddress,
          positionPubkey,
          bpsToRemove: bpsNum,
          shouldClaimAndClose: false,
        })
      );
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("claimfee", async (ctx) => {
    try {
      requireKeypair();
      const [poolAddress, positionPubkey] = (ctx.match as string).trim().split(/\s+/);
      if (!poolAddress || !positionPubkey) {
        await ctx.reply("Usage: `/claimfee <poolAddr> <positionPubkey>`", MD);
        return;
      }
      const summary = [
        "*Claim fees?*",
        `Pool: ${tgCode(poolAddress)}`,
        `Position: ${tgCode(positionPubkey)}`,
      ].join("\n");
      await present(ctx, summary, (dlmm) => dlmm.claimFee(poolAddress, positionPubkey));
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  bot.command("claimreward", async (ctx) => {
    try {
      requireKeypair();
      const [poolAddress, positionPubkey] = (ctx.match as string).trim().split(/\s+/);
      if (!poolAddress || !positionPubkey) {
        await ctx.reply("Usage: `/claimreward <poolAddr> <positionPubkey>`", MD);
        return;
      }
      const summary = [
        "*Claim rewards?*",
        `Pool: ${tgCode(poolAddress)}`,
        `Position: ${tgCode(positionPubkey)}`,
      ].join("\n");
      await present(ctx, summary, (dlmm) => dlmm.claimReward(poolAddress, positionPubkey));
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // Confirm / cancel callbacks.
  bot.callbackQuery(/^confirm:(.+)$/, async (ctx) => {
    const id = ctx.match![1];
    const op = pending.get(id);
    pending.delete(id);
    await ctx.answerCallbackQuery();
    if (!op) {
      await ctx.editMessageText("⌛ Expired \\(operation no longer available\\)", MD);
      return;
    }
    await ctx.editMessageText("⏳ Sending transaction\\.\\.\\.", MD);
    try {
      const keypair = resolveKeypair(config);
      const rpc = resolveRpc(config);
      const Ctor = await lazyDLMM();
      const dlmm = new Ctor(keypair, rpc);
      const sig = await op.run(dlmm);
      await ctx.editMessageText(
        `✅ Done\\!\nSignature: ${tgCode(sig)}`,
        MD
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ Failed: ${escapeMarkdown(msg)}`, MD);
    }
  });

  bot.callbackQuery(/^cancel:(.+)$/, async (ctx) => {
    const id = ctx.match![1];
    pending.delete(id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("❌ Cancelled\\.", MD);
  });
}

async function present(
  ctx: Context,
  summary: string,
  run: (dlmm: any) => Promise<string>
) {
  const id = nextId();
  pending.set(id, { summary, run });
  const kb = new InlineKeyboard()
    .text("✅ Confirm", `confirm:${id}`)
    .text("❌ Cancel", `cancel:${id}`);
  await ctx.reply(summary, { ...MD, reply_markup: kb });
}

async function replyError(ctx: Context, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  await ctx.reply(`✖ ${escapeMarkdown(msg)}`, MD);
}
