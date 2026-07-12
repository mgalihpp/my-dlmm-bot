import { Bot, Context, InlineKeyboard } from "grammy";
import type { MeteoraClient } from "../../api.js";
import type { VexisConfig } from "../../config.js";
import { resolveKeypair, resolveRpc, resolveWallet } from "../../config.js";
import {
  escapeMarkdown,
  tgBold,
  tgCode,
  tgTxLink,
  tgUsd,
  tgPct,
  tgPoolAddr,
  tgOrganic,
  formatNum,
} from "../format.js";
import { MD } from "../utils.js";
import { screenPools } from "../../screening.js";
import { setInputSession } from "../input-store.js";
import {
  createWizard,
  getWizard,
  updateWizard,
  deleteWizard,
} from "../wizard-store.js";
import type { StrategyType } from "../../types.js";

const DEFAULT_BINS: Record<
  string,
  { minBin: number; maxBin: number; label: string }
> = {
  "two-sided": { minBin: -33, maxBin: 34, label: "-33+34 bins" },
  "single-x": { minBin: 0, maxBin: 69, label: "0+70 bins (above price)" },
  "single-y": { minBin: -69, maxBin: 0, label: "-70+0 bins (below price)" },
};

const WIDE_PRESETS = [
  { label: "-90% → 0%", minPct: -0.9, maxPct: 0 },
  { label: "-80% → 0%", minPct: -0.8, maxPct: 0 },
  { label: "-70% → 0%", minPct: -0.7, maxPct: 0 },
  { label: "-60% → 0%", minPct: -0.6, maxPct: 0 },
  { label: "-50% → 0%", minPct: -0.5, maxPct: 0 },
] as const;

let DLMMClientCtor: any = null;
async function lazyDLMM() {
  if (!DLMMClientCtor) {
    const mod = await import("../../dlmm.js");
    DLMMClientCtor = mod.DLMMClient;
  }
  return DLMMClientCtor;
}

export function registerCreate(
  bot: Bot,
  client: MeteoraClient,
  config: VexisConfig,
) {
  // ─── Entry: /create without args ────────────────────────────────────────
  bot.command("create", async (ctx, next) => {
    const args = (ctx.match as string).trim();
    if (args) return next();
    await showSourceMenu(ctx, "reply");
  });

  // ─── crt:source — pick pool source ──────────────────────────────────────
  bot.callbackQuery("crt:source", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSourceMenu(ctx, "edit");
  });

  bot.callbackQuery("crt:from:trending", async (ctx) => {
    await ctx.answerCallbackQuery();
    const kb = new InlineKeyboard();
    for (const tf of ["5m", "30m", "1h", "2h", "4h", "12h", "24h"]) {
      kb.text(tf, `crt:trending:tf:${tf}`);
    }
    await ctx.editMessageText("Select timeframe:", {
      ...MD,
      reply_markup: kb.row().text("⬅️ Back", "crt:source"),
    });
  });

  bot.callbackQuery(/^crt:trending:tf:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const timeframe = ctx.match![1];
    await ctx.editMessageText("⏳ Screening trending pools\\.\\.\\.", MD);
    try {
      const result = await screenPools(client, config, timeframe);
      if (result.pools.length === 0) {
        await ctx.editMessageText("No pools found\\.", {
          ...MD,
          reply_markup: backToSourceKb(),
        });
        return;
      }
      const lines = [tgBold("🔥 Trending Pools — Select"), ""];
      const kb = new InlineKeyboard();
      for (const p of result.pools.slice(0, 10)) {
        const rug =
          p.rugScore != null ? escapeMarkdown(String(p.rugScore)) : "\\-";
        const priceChg =
          p.priceChangePct != null ? tgPct(p.priceChangePct) : "\\-";
        const volChg =
          p.volumeChangePct != null ? tgPct(p.volumeChangePct) : "\\-";
        const age = p.tokenAgeHours != null ? `${p.tokenAgeHours}h` : "\\-";
        lines.push(
          `${tgBold(escapeMarkdown(`${p.baseSymbol}/${p.quoteSymbol}`))}  ${tgPoolAddr(p.pool)}`,
          `MC ${tgUsd(p.mcap)} \\| TVL ${tgUsd(p.tvl)} \\| Vol ${tgUsd(p.volume)}`,
          `Fee ${tgUsd(p.fee)} \\| Fee/TVL ${escapeMarkdown(`${formatNum(p.feeActiveTvlRatio)}%`)} \\| Holders ${escapeMarkdown(formatNum(p.holders))}`,
          `Organic ${tgOrganic(p.organicScore)} \\| Bin ${escapeMarkdown(String(p.binStep))} \\| BaseFee ${escapeMarkdown(`${p.baseFeePct}%`)} \\| Age ${escapeMarkdown(age)}`,
          `Price ${escapeMarkdown(formatNum(p.price, 6))} ${priceChg} \\| Vol ${volChg} \\| Rug ${rug}`,
          "",
        );
        const wid = createWizard({
          poolAddress: p.pool,
          poolName: `${p.baseSymbol}/${p.quoteSymbol}`,
          binStep: p.binStep,
          currentPrice: p.price,
          tvl: p.tvl,
          volume24h: p.volume,
          holders: p.holders,
          baseFeePct: p.baseFeePct,
        });
        kb.text(
          `${p.baseSymbol}/${p.quoteSymbol} B${p.binStep} ${p.baseFeePct}%`.slice(0, 30),
          `crt:strategy:${wid}`,
        ).row();
      }
      lines.push("");
      await ctx.editMessageText(lines.join("\n"), {
        ...MD,
        reply_markup: kb.text("⬅️ Back", "crt:source"),
      });
    } catch (e) {
      await ctx.editMessageText(
        `✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`,
        { ...MD, reply_markup: backToSourceKb() },
      );
    }
  });

  bot.callbackQuery("crt:from:my", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Loading your pools\\.\\.\\.", MD);
    try {
      const wallet = resolveWallet(undefined, config);
      const res = await client.openPortfolio(wallet, 1, 50);
      if (res.pools.length === 0) {
        await ctx.editMessageText(
          "No open positions\\. Choose Trending instead\\.",
          { ...MD, reply_markup: backToSourceKb() },
        );
        return;
      }
      const lines = [tgBold("📈 Your Pools — Select"), ""];
      const kb = new InlineKeyboard();
      for (const p of res.pools) {
        const label = `${p.tokenX}/${p.tokenY}`;
        const range = p.outOfRange ? " ⚠️" : "";
        const fees = `$${Number(p.unclaimedFees).toFixed(2)}`;
        const pnlNum = parseFloat(p.pnl);
        const pnlSign = pnlNum >= 0 ? "+" : "";
        const pnlStr = `${pnlSign}$${Math.abs(pnlNum).toFixed(2)}`;
        const balNum = parseFloat(p.balances);
        const balStr = `$${balNum.toFixed(2)}`;
        lines.push(
          `• ${tgBold(escapeMarkdown(label))}${escapeMarkdown(range)}`,
          `  Fees: ${escapeMarkdown(fees)} \\| PnL: ${escapeMarkdown(pnlStr)} \\| Bal: ${escapeMarkdown(balStr)}`,
        );
        try {
          const detail = await client.pool(p.poolAddress);
          const wid = createWizard({
            poolAddress: p.poolAddress,
            poolName: label,
            binStep: detail.pool_config.bin_step,
            currentPrice: detail.current_price,
            tvl: detail.tvl,
            volume24h: detail.volume["24h"],
            holders: detail.token_x.holders,
            baseFeePct: detail.pool_config.base_fee_pct,
          });
          kb.text(`${label} B${detail.pool_config.bin_step} ${detail.pool_config.base_fee_pct}%`.slice(0, 30), `crt:strategy:${wid}`).row();
        } catch {}
      }
      lines.push("");
      await ctx.editMessageText(lines.join("\n"), {
        ...MD,
        reply_markup: kb.text("⬅️ Back", "crt:source"),
      });
    } catch (e) {
      await ctx.editMessageText(
        `✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`,
        { ...MD, reply_markup: backToSourceKb() },
      );
    }
  });

  // ─── crt:from:address — prompt user to paste a pool address ─────────────
  bot.callbackQuery("crt:from:address", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id ?? ctx.from?.id;
    if (chatId != null) {
      let retry = 0;
      const addrHandler = async (text: string, sessionCtx: Context) => {
        const address = extractAddress(text);
        if (!address || !isLikelyPubkey(address)) {
          retry++;
          if (retry >= 2) {
            await sessionCtx.reply(
              "✖ Invalid address\\. Use /create to retry\\.",
              MD,
            );
            return;
          }
          await sessionCtx.reply(
            "✖ That doesn't look like a valid address or Meteora URL\\. Send a valid Solana address or pool link:",
            MD,
          );
          setInputSession(chatId, addrHandler);
          return;
        }
        const loading = await sessionCtx.reply("⏳ Loading pool\\.\\.\\.", MD);
        try {
          const detail = await client.pool(address);
          const wid = createWizard({
            poolAddress: detail.address,
            poolName: detail.name,
            binStep: detail.pool_config.bin_step,
            currentPrice: detail.current_price,
            tvl: detail.tvl,
            volume24h: detail.volume["24h"],
            holders: detail.token_x.holders,
            baseFeePct: detail.pool_config.base_fee_pct,
          });
          await sessionCtx.api.editMessageText(
            loading.chat.id,
            loading.message_id,
            await renderStrategyStep(wid),
            { ...MD, reply_markup: strategyKb(wid) },
          );
        } catch (e) {
          await sessionCtx.api.editMessageText(
            loading.chat.id,
            loading.message_id,
            `✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`,
            { ...MD, reply_markup: backToSourceKb() },
          );
        }
      };
      setInputSession(chatId, addrHandler);
    }
    await ctx.editMessageText(
      [
        tgBold("📍 Paste Pool Address"),
        "",
        "Send the DLMM pool address or Meteora pool link as your next message\\.",
        escapeMarkdown("Example: 5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6"),
        escapeMarkdown("Or: https://app.meteora.ag/dlmm/5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6"),
      ].join("\n"),
      { ...MD, reply_markup: backToSourceKb() },
    );
  });

  // ─── crt:strategy:<wid> — pick strategy ─────────────────────────────────
  bot.callbackQuery(/^crt:strategy:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    if (!getWizard(wid)) return await expired(ctx);
    await ctx.editMessageText(await renderStrategyStep(wid), {
      ...MD,
      reply_markup: strategyKb(wid),
    });
  });

  // ─── crt:mode:<wid>:<strategy> — pick side ──────────────────────────────
  bot.callbackQuery(/^crt:mode:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const strategy = ctx.match![2];
    const state = getWizard(wid);
    if (!state) return await expired(ctx);
    updateWizard(wid, { strategy });

    const text = [
      tgBold(`📋 ${escapeMarkdown(state.poolName)}`),
      `Strategy: ${escapeMarkdown(strategy)}`,
      "",
      tgBold("Step 2/3 — Pick side:"),
      "",
      "• *Two\\-sided* — deposit both tokens",
      "• *Single X* — deposit meme token only",
      "• *Single Y* — deposit SOL/stable only",
    ].join("\n");

    const kb = new InlineKeyboard()
      .text("↔️ Two-sided", `crt:range:${wid}:two-sided`)
      .row()
      .text("➡️ Single X (meme)", `crt:range:${wid}:single-x`)
      .row()
      .text("⬅️ Single Y (SOL)", `crt:range:${wid}:single-y`)
      .row()
      .text("⬅️ Back", `crt:strategy:${wid}`);

    await ctx.editMessageText(text, { ...MD, reply_markup: kb });
  });

  // ─── crt:range:<wid>:<mode> — pick range ────────────────────────────────
  bot.callbackQuery(/^crt:range:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const mode = ctx.match![2] as "two-sided" | "single-x" | "single-y";
    const state = getWizard(wid);
    if (!state) return await expired(ctx);
    updateWizard(wid, { mode });

    const def = DEFAULT_BINS[mode] ?? DEFAULT_BINS["two-sided"];
    const text = [
      tgBold(`📋 ${escapeMarkdown(state.poolName)}`),
      `Strategy: ${escapeMarkdown(state.strategy!)} \\| Mode: ${escapeMarkdown(mode)}`,
      "",
      tgBold("Step 3/4 — Pick range:"),
      "",
      `🎯 *Default* — ${escapeMarkdown(def.label)}`,
      "",
      "• *Wide presets* — pct\\-based ranges below current price",
    ].join("\n");

    const kb = new InlineKeyboard()
      .text(`🎯 Default (${def.label})`, `crt:default:${wid}`)
      .row();
    WIDE_PRESETS.forEach(({ label }, i) => {
      kb.text(label, `crt:wide:${wid}:${i}`).row();
    });
    kb.text("✏️ Custom", `crt:custom:${wid}`)
      .row()
      .text("⬅️ Back", `crt:mode:${wid}:${state.strategy}`);

    await ctx.editMessageText(text, { ...MD, reply_markup: kb });
  });

  // ─── crt:default:<wid> — default bins by mode → prompt amounts → execute ──
  bot.callbackQuery(/^crt:default:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const state = getWizard(wid);
    if (!state) return await expired(ctx);
    const def =
      DEFAULT_BINS[state.mode ?? "two-sided"] ?? DEFAULT_BINS["two-sided"];
    updateWizard(wid, {
      minBin: def.minBin,
      maxBin: def.maxBin,
      isPctMode: false,
    });
    await promptAmounts(ctx, wid);
  });

  // ─── crt:wide:<wid>:<idx> — wide pct preset → prompt amounts → execute ──
  bot.callbackQuery(/^crt:wide:([^:]+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const preset = WIDE_PRESETS[parseInt(ctx.match![2], 10)];
    const state = getWizard(wid);
    if (!state || !preset) return await expired(ctx);
    updateWizard(wid, {
      minPct: preset.minPct,
      maxPct: preset.maxPct,
      isPctMode: true,
    });
    await promptAmounts(ctx, wid);
  });

  // ─── crt:custom:<wid> — custom range → ask mode → input values → amounts ─
  bot.callbackQuery(/^crt:custom:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const state = getWizard(wid);
    if (!state) return await expired(ctx);
    await ctx.editMessageText(
      [
        tgBold("✏️ Custom Range"),
        "",
        `Bin step: ${escapeMarkdown(String(state.binStep))} \\(1 bin ≈ ${escapeMarkdown(`${state.binStep / 100}%`)}\\)`,
        "",
        "Choose range mode:",
      ].join("\n"),
      {
        ...MD,
        reply_markup: new InlineKeyboard()
          .text("📊 Bin mode (relative)", `crt:custom:bin:${wid}`)
          .row()
          .text("📈 Pct mode (% vs price)", `crt:custom:pct:${wid}`)
          .row()
          .text("⬅️ Back", `crt:range:${wid}:${state.mode ?? "two-sided"}`),
      },
    );
  });

  // ─── crt:custom:bin:<wid> — ask for min/max bin ─────────────────────────
  bot.callbackQuery(/^crt:custom:bin:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const state = getWizard(wid);
    if (!state) return await expired(ctx);
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);

    setInputSession(chatId, async (minBinText, sessionCtx) => {
      const minBin = parseInt(minBinText, 10);
      if (Number.isNaN(minBin)) {
        await sessionCtx.reply(
          "✖ Invalid number\\. Send min bin \\(e\\.g\\. \\-70\\):",
          MD,
        );
        return;
      }
      setInputSession(chatId, async (maxBinText, sessionCtx2) => {
        const maxBin = parseInt(maxBinText, 10);
        if (Number.isNaN(maxBin) || maxBin <= minBin) {
          await sessionCtx2.reply(
            "✖ Max bin must be a number greater than min bin\\. Send max bin:",
            MD,
          );
          return;
        }
        updateWizard(wid, { minBin, maxBin, isPctMode: false });
        await promptAmounts(sessionCtx2, wid);
      });
      await sessionCtx.reply(
        `✏️ Min bin: ${escapeMarkdown(minBinText)}\n\nNow send *max bin* \\(e\\.g\\. 70\\):`,
        MD,
      );
    });
    await ctx.editMessageText(
      "✏️ Send *min bin* \\(relative to active bin, e\\.g\\. \\-70\\):",
      MD,
    );
  });

  // ─── crt:custom:pct:<wid> — ask for min/max pct ─────────────────────────
  bot.callbackQuery(/^crt:custom:pct:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const state = getWizard(wid);
    if (!state) return await expired(ctx);
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);

    setInputSession(chatId, async (minPctText, sessionCtx) => {
      const minPct = parseFloat(minPctText) / 100;
      if (Number.isNaN(minPct)) {
        await sessionCtx.reply(
          "✖ Invalid number\\. Send min %% \\(e\\.g\\. \\-50\\):",
          MD,
        );
        return;
      }
      setInputSession(chatId, async (maxPctText, sessionCtx2) => {
        const maxPct = parseFloat(maxPctText) / 100;
        if (Number.isNaN(maxPct) || maxPct <= minPct) {
          await sessionCtx2.reply(
            "✖ Max %% must be a number greater than min %%\\. Send max %% \\(e\\.g\\. 0\\):",
            MD,
          );
          return;
        }
        updateWizard(wid, { minPct, maxPct, isPctMode: true });
        await promptAmounts(sessionCtx2, wid);
      });
      await sessionCtx.reply(
        `✏️ Min: ${escapeMarkdown(minPctText)}%\n\nNow send *max %%* \\(e\\.g\\. 0\\):`,
        MD,
      );
    });
    await ctx.editMessageText(
      "✏️ Send *min %%* \\(negative, e\\.g\\. \\-50 means 50% below price\\):",
      MD,
    );
  });

  // ─── crt:execute — execute create position ───────────────────────────────
  bot.callbackQuery(/^crt:execute:([^:]+):(.+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const xAmt = ctx.match![2];
    const yAmt = ctx.match![3];
    const state = getWizard(wid);
    if (!state) {
      await ctx.editMessageText(
        "⌛ Session expired\\. Run /create again\\.",
        MD,
      );
      return;
    }
    deleteWizard(wid);

    const strategy = state.strategy! as StrategyType;
    const mode = state.mode ?? "two-sided";
    const singleSidedX = mode === "single-x";
    const singleSidedY = mode === "single-y";
    const isPctMode = state.isPctMode;

    await ctx.editMessageText("⏳ Creating position\\.\\.\\.", MD);
    try {
      const keypair = resolveKeypair(config);
      const rpc = resolveRpc(config);
      const Ctor = await lazyDLMM();
      const dlmm = new Ctor(keypair, rpc);
      const res = await dlmm.createPosition({
        poolAddress: state.poolAddress,
        strategy,
        totalXAmount: xAmt,
        totalYAmount: yAmt,
        amountsAreHuman: true,
        singleSidedX,
        singleSidedY,
        ...(isPctMode
          ? { minPct: state.minPct!, maxPct: state.maxPct! }
          : {
              minBinId: state.minBin!,
              maxBinId: state.maxBin!,
              relativeBins: true,
            }),
      });
      const sigs = (res.signatures ?? [res]).join("\n");
      const body = sigs
        .split("\n")
        .map((s: string) => s.trim())
        .filter(Boolean)
        .map((s: string) => tgTxLink(s))
        .join("\n");
      await ctx.editMessageText(`✅ Done\\!\n${body}`, MD);
    } catch (e) {
      await ctx.editMessageText(
        `✖ Failed: ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`,
        MD,
      );
    }
  });

  // ─── crt:cancel — cancel create ──────────────────────────────────────────
  bot.callbackQuery(/^crt:cancel:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    deleteWizard(wid);
    await ctx.editMessageText("❌ Cancelled\\.", MD);
  });
}

// ─── Amount prompt & execution ───────────────────────────────────────────────

async function promptAmounts(ctx: Context, wid: string) {
  const chatId = String(ctx.chat?.id ?? ctx.from?.id);
  const state = getWizard(wid);
  if (!state) return;

  const mode = state.mode ?? "two-sided";
  const poolName = state.poolName;

  if (mode === "single-y") {
    setInputSession(chatId, async (yAmtText, sessionCtx) => {
      const yAmt = parseFloat(yAmtText);
      if (Number.isNaN(yAmt) || yAmt <= 0) {
        await sessionCtx.reply(
          "✖ Invalid amount\\. Send Y amount \\(SOL/stable\\):",
          MD,
        );
        return;
      }
      await confirmAndExecute(sessionCtx, wid, "0", yAmtText);
    });
    await ctx.editMessageText(
      [
        tgBold(`📋 ${escapeMarkdown(poolName)}`),
        `Mode: single\\-sided Y \\(SOL/stable\\)`,
        "",
        "✏️ Send *Y amount* \\(SOL/stable, e\\.g\\. 0\\.5\\):",
      ].join("\n"),
      MD,
    );
  } else if (mode === "single-x") {
    setInputSession(chatId, async (xAmtText, sessionCtx) => {
      const xAmt = parseFloat(xAmtText);
      if (Number.isNaN(xAmt) || xAmt <= 0) {
        await sessionCtx.reply(
          "✖ Invalid amount\\. Send X amount \\(meme token\\):",
          MD,
        );
        return;
      }
      await confirmAndExecute(sessionCtx, wid, xAmtText, "0");
    });
    await ctx.editMessageText(
      [
        tgBold(`📋 ${escapeMarkdown(poolName)}`),
        `Mode: single\\-sided X \\(meme\\)`,
        "",
        "✏️ Send *X amount* \\(meme token, e\\.g\\. 1000\\):",
      ].join("\n"),
      MD,
    );
  } else {
    setInputSession(chatId, async (xAmtText, sessionCtxX) => {
      const xAmt = parseFloat(xAmtText);
      if (Number.isNaN(xAmt) || xAmt <= 0) {
        await sessionCtxX.reply(
          "✖ Invalid amount\\. Send X amount \\(meme token\\):",
          MD,
        );
        return;
      }
      setInputSession(chatId, async (yAmtText, sessionCtxY) => {
        const yAmt = parseFloat(yAmtText);
        if (Number.isNaN(yAmt) || yAmt <= 0) {
          await sessionCtxY.reply(
            "✖ Invalid amount\\. Send Y amount \\(SOL/stable\\):",
            MD,
          );
          return;
        }
        await confirmAndExecute(sessionCtxY, wid, xAmtText, yAmtText);
      });
      await sessionCtxX.reply(
        `✅ X: ${escapeMarkdown(xAmtText)}\n\nNow send *Y amount* \\(SOL/stable, e\\.g\\. 0\\.5\\):`,
        MD,
      );
    });
    await ctx.editMessageText(
      [
        tgBold(`📋 ${escapeMarkdown(poolName)}`),
        `Mode: two\\-sided`,
        "",
        "✏️ Send *X amount* \\(meme token, e\\.g\\. 1000\\):",
      ].join("\n"),
      MD,
    );
  }
}

async function confirmAndExecute(
  ctx: Context,
  wid: string,
  xAmt: string,
  yAmt: string,
) {
  const state = getWizard(wid);
  if (!state) {
    await ctx.reply("⌛ Session expired\\. Run /create again\\.", MD);
    return;
  }

  const strategy = state.strategy!;
  const mode = state.mode ?? "two-sided";
  const isPctMode = state.isPctMode;
  const rangeLabel = isPctMode
    ? `${(state.minPct! * 100).toFixed(2)}% to ${(state.maxPct! * 100).toFixed(2)}%`
    : `bins ${state.minBin!} to ${state.maxBin!}`;

  const summary = [
    "*Create position?*",
    `Pool: ${tgCode(state.poolAddress)}`,
    `Strategy: ${escapeMarkdown(strategy)} \\| Range: ${escapeMarkdown(rangeLabel)}`,
    `X: ${escapeMarkdown(xAmt)} \\| Y: ${escapeMarkdown(yAmt)}`,
    `Mode: ${escapeMarkdown(mode === "single-x" ? "single-sided X" : mode === "single-y" ? "single-sided Y" : "two-sided")}`,
  ].join("\n");

  const kb = new InlineKeyboard()
    .text("✅ Confirm", `crt:execute:${wid}:${xAmt}:${yAmt}`)
    .text("❌ Cancel", `crt:cancel:${wid}`);

  try {
    await ctx.reply(summary, { ...MD, reply_markup: kb });
  } catch (e) {
    await ctx.reply(
      `✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`,
      MD,
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLikelyPubkey(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

/**
 * Extract a Solana address from user input.
 * Accepts raw base58 addresses OR Meteora pool URLs:
 *   https://app.meteora.ag/dlmm/<address>
 *   https://app.meteora.ag/dlmm/SOL-USDC-<address>
 */
function extractAddress(input: string): string | null {
  const trimmed = input.trim();
  // Raw address — return as-is
  if (isLikelyPubkey(trimmed)) return trimmed;
  // Meteora URL — extract last path segment
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, "");
    const last = path.split("/").pop() || "";
    // The last segment may be "SYMBOL-SYMBOL-ADDRESS" or just "ADDRESS"
    const parts = last.split("-");
    const candidate = parts[parts.length - 1];
    if (isLikelyPubkey(candidate)) return candidate;
  } catch {
    // not a URL
  }
  return null;
}

export async function renderStrategyStep(wid: string): Promise<string> {
  const state = getWizard(wid)!;
  const lines = [
    tgBold(`📋 ${escapeMarkdown(state.poolName)}`),
    `Pool: ${tgCode(state.poolAddress)}`,
  ];
  if (state.baseFeePct != null) {
    lines.push(`Bin: ${escapeMarkdown(String(state.binStep))} \\| Fee: ${escapeMarkdown(`${state.baseFeePct}%`)}`);
  }
  if (state.tvl != null) {
    lines.push(`TVL: ${tgUsd(state.tvl)} \\| Holders: ${escapeMarkdown(formatNum(state.holders ?? 0))}`);
  }
  if (state.volume24h != null) {
    lines.push(`Vol 24h: ${tgUsd(state.volume24h)}`);
  }
  lines.push(
    "",
    tgBold("Step 1/3 — Pick strategy:"),
    "",
    "• *Spot* — uniform liquidity across range",
    "• *Bid\\-Ask* — concentrated at edges \\(volatility\\)",
    "• *Curve* — bell curve centered on price",
  );
  return lines.join("\n");
}

export function strategyKb(wid: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("📊 Spot", `crt:mode:${wid}:spot`)
    .text("📈 Bid-Ask", `crt:mode:${wid}:bidask`)
    .text("🔔 Curve", `crt:mode:${wid}:curve`)
    .row()
    .text("⬅️ Back", "crt:source");
}

async function showSourceMenu(ctx: Context, mode: "reply" | "edit") {
  const text = [
    tgBold("➕ Create Position"),
    "",
    "Which pool do you want to use?",
  ].join("\n");
  const kb = new InlineKeyboard()
    .text("🔥 Trending Pools", "crt:from:trending")
    .row()
    .text("📈 My Active Pools", "crt:from:my")
    .row()
    .text("📍 Paste Pool Address", "crt:from:address");

  if (mode === "reply") {
    await (ctx as any).reply(text, { ...MD, reply_markup: kb });
  } else {
    await (ctx as any).editMessageText(text, { ...MD, reply_markup: kb });
  }
}

async function expired(ctx: Context) {
  await ctx.editMessageText(
    "⌛ Session expired\\. Please run /create again\\.",
    {
      ...MD,
      reply_markup: new InlineKeyboard().text("🔄 Start over", "crt:source"),
    },
  );
}

function backToSourceKb() {
  return new InlineKeyboard().text("⬅️ Back", "crt:source");
}
