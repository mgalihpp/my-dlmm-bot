import { Bot, Context, InlineKeyboard } from "grammy";
import { Keypair } from "@solana/web3.js";
import type { VexisConfig } from "../../config.js";
import { resolveKeypair, resolveRpc } from "../../config.js";
import { escapeMarkdown, tgCode, tgTxLink } from "../format.js";
import { MD, replyError } from "../utils.js";
import type { StrategyType } from "../../types.js";

// Pending operations — run() is self-contained (signs + sends tx internally).
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

export function registerOnchain(bot: Bot, config: VexisConfig) {
  const requireKeypair = (): Keypair => resolveKeypair(config);

  const makeDlmmRunner = (fn: (dlmm: any) => Promise<string>) => async (): Promise<string> => {
    const keypair = resolveKeypair(config);
    const rpc = resolveRpc(config);
    const Ctor = await lazyDLMM();
    const dlmm = new Ctor(keypair, rpc);
    return fn(dlmm);
  };

  const makeZapRunner = (fn: (zap: any) => Promise<string>) => async (): Promise<string> => {
    const keypair = resolveKeypair(config);
    const rpc = resolveRpc(config);
    const Ctor = await lazyZap();
    const zap = new Ctor(keypair, rpc);
    return fn(zap);
  };

  // ─── /create ────────────────────────────────────────────────────────────
  bot.command("create", async (ctx) => {
    try {
      requireKeypair();
      const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
      // Two range syntaxes:
      //   /create <pool> <strategy> <xAmt> <yAmt> <minBin> <maxBin> [side]      (bins, relative to active)
      //   /create <pool> <strategy> <xAmt> <yAmt> price <minPrice> <maxPrice> [side]
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
      if (rangeA == null || rangeB == null) {
        await ctx.reply(usage, MD);
        return;
      }
      if (!STRATEGIES.has(strategy as StrategyType)) {
        await ctx.reply("Strategy must be: spot, bidask, or curve", MD);
        return;
      }
      const singleSidedX =
        sideArg === "single" || sideArg === "single-x" || sideArg === "singlex";
      const singleSidedY = sideArg === "single-y" || sideArg === "singley";
      const mode = singleSidedX ? "single-sided X (meme)" : singleSidedY ? "single-sided Y (SOL)" : "two-sided";
      const rangeLabel = isPctMode
        ? `${rangeA}% to ${rangeB}% (vs current price)`
        : `bins ${rangeA} to ${rangeB} (relative)`;
      const summary = [
        "*Create position?*",
        `Pool: ${tgCode(poolAddress)}`,
        `Strategy: ${escapeMarkdown(strategy)} \\| Range: ${escapeMarkdown(rangeLabel)}`,
        `X: ${escapeMarkdown(xAmt)} \\| Y: ${escapeMarkdown(yAmt)}`,
        `Mode: ${escapeMarkdown(mode)}`,
      ].join("\n");
      await present(ctx, summary, makeDlmmRunner(async (dlmm) => {
        const res = await dlmm.createPosition({
          poolAddress,
          strategy: strategy as StrategyType,
          totalXAmount: xAmt,
          totalYAmount: yAmt,
          amountsAreHuman: true,
          singleSidedX,
          ...(isPctMode
            ? { minPct: parseFloat(rangeA) / 100, maxPct: parseFloat(rangeB) / 100 }
            : { minBinId: parseInt(rangeA, 10), maxBinId: parseInt(rangeB, 10), relativeBins: true }),
        });
        return res.signatures.join("\n");
      }));
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── /close — close position + zap out to SOL ───────────────────────────
  bot.command("close", async (ctx) => {
    try {
      requireKeypair();
      const [poolAddress, positionPubkey] = (ctx.match as string).trim().split(/\s+/);
      if (!poolAddress || !positionPubkey) {
        await ctx.reply("Use /manage to select a position interactively\\.", MD);
        return;
      }
      const summary = [
        "*Close & Zap Out?*",
        `Pool: ${tgCode(poolAddress)}`,
        `Position: ${tgCode(positionPubkey)}`,
        "",
        "Remove all liquidity \\+ claim fees\\, then swap to SOL via Jupiter\\.",
      ].join("\n");
      await present(ctx, summary, makeZapRunner(async (zap) => {
        // closeAndZapOut now sends its own txs (close first, then zap the
        // actual withdrawn balance). Prefer the zap sig; fall back to close.
        const result = await zap.closeAndZapOut(poolAddress, positionPubkey);
        const sig = result.zapSig || result.closeSig;
        if (!sig) throw new Error("Close produced no transaction signature");
        return sig;
      }));
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── /addliq ────────────────────────────────────────────────────────────
  bot.command("addliq", async (ctx) => {
    try {
      requireKeypair();
      const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
      if (parts.length < 5) {
        await ctx.reply(
          "Use /manage to select a position, or provide all args:\n`/addliq <poolAddr> <positionPubkey> <strategy> <xAmt> <yAmt>`",
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
      await present(ctx, summary, makeDlmmRunner((dlmm) =>
        dlmm.addLiquidity({
          poolAddress,
          positionPubkey,
          strategy: strategy as StrategyType,
          totalXAmount: xAmt,
          totalYAmount: yAmt,
          minBinId: 0,
          maxBinId: 0,
        })
      ));
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── /removeliq ─────────────────────────────────────────────────────────
  bot.command("removeliq", async (ctx) => {
    try {
      requireKeypair();
      const [poolAddress, positionPubkey, bps] = (ctx.match as string).trim().split(/\s+/);
      if (!poolAddress || !positionPubkey || !bps) {
        await ctx.reply(
          "Use /manage to select a position, or provide all args:\n`/removeliq <poolAddr> <positionPubkey> <bps 1-10000>`",
          MD
        );
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
      await present(ctx, summary, makeDlmmRunner((dlmm) =>
        dlmm.removeLiquidity({
          poolAddress,
          positionPubkey,
          bpsToRemove: bpsNum,
          shouldClaimAndClose: false,
        })
      ));
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── /claimfee — claim fees + zap out to SOL ────────────────────────────
  bot.command("claimfee", async (ctx) => {
    try {
      requireKeypair();
      const [poolAddress, positionPubkey] = (ctx.match as string).trim().split(/\s+/);
      if (!poolAddress || !positionPubkey) {
        await ctx.reply("Use /manage to select a position interactively\\.", MD);
        return;
      }
      const summary = [
        "*Claim fees \\+ Zap to SOL?*",
        `Pool: ${tgCode(poolAddress)}`,
        `Position: ${tgCode(positionPubkey)}`,
        "",
        "Claim swap fees \\+ swap to SOL via Jupiter\\.",
      ].join("\n");
      await present(ctx, summary, makeZapRunner(async (zap) => {
        const result = await zap.claimAndZapOut(poolAddress, positionPubkey);
        // Prefer the Jupiter zap-out tx; fall back to the claim tx if the
        // swap was skipped (e.g. no Jupiter quote). Either is a real sig.
        const sig = result.zapSig || result.claimSig;
        if (!sig) throw new Error("Claim produced no transaction signature");
        return sig;
      }));
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── /claimreward ───────────────────────────────────────────────────────
  bot.command("claimreward", async (ctx) => {
    try {
      requireKeypair();
      const [poolAddress, positionPubkey] = (ctx.match as string).trim().split(/\s+/);
      if (!poolAddress || !positionPubkey) {
        await ctx.reply("Use /manage to select a position interactively\\.", MD);
        return;
      }
      const summary = [
        "*Claim rewards?*",
        `Pool: ${tgCode(poolAddress)}`,
        `Position: ${tgCode(positionPubkey)}`,
      ].join("\n");
      await present(ctx, summary, makeDlmmRunner((dlmm) =>
        dlmm.claimReward(poolAddress, positionPubkey)
      ));
    } catch (e) {
      await replyError(ctx, e);
    }
  });

  // ─── Confirm / cancel callbacks ─────────────────────────────────────────
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
      const result = await op.run();
      // run() may return several signatures joined by newlines (e.g. a wide
      // range that creates + expands across multiple txs). Render one Solscan
      // link per signature — joining them into a single tgTxLink would produce
      // an invalid `/tx/<sig1>\n<sig2>` URL that Solscan reports as not found.
      const sigs = result.split("\n").map((s) => s.trim()).filter(Boolean);
      const body = sigs.map(tgTxLink).join("\n");
      await ctx.editMessageText(
        `✅ Done\\!\n${body}`,
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

// ─── Helpers ──────────────────────────────────────────────────────────────

async function present(
  ctx: Context,
  summary: string,
  run: () => Promise<string>
) {
  const id = nextId();
  pending.set(id, { summary, run });
  const kb = new InlineKeyboard()
    .text("✅ Confirm", `confirm:${id}`)
    .text("❌ Cancel", `cancel:${id}`);
  await ctx.reply(summary, { ...MD, reply_markup: kb });
}

