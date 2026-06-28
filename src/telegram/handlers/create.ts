import { Bot, Context, InlineKeyboard } from "grammy";
import type { MeteoraClient } from "../../api.js";
import type { VexisConfig } from "../../config.js";
import { resolveKeypair, resolveRpc, resolveWallet } from "../../config.js";
import { escapeMarkdown, tgBold, tgCode, tgTxLink } from "../format.js";
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

const DEFAULT_BINS: Record<string, { minBin: number; maxBin: number; label: string }> = {
  "two-sided": { minBin: -34, maxBin: 35, label: "-34+35 bins" },
  "single-x": { minBin: 0, maxBin: 70, label: "0+70 bins (above price)" },
  "single-y": { minBin: -70, maxBin: 0, label: "-70+0 bins (below price)" },
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

export function registerCreate(bot: Bot, client: MeteoraClient, config: VexisConfig) {
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
    await ctx.editMessageText("⏳ Screening trending pools\\.\\.\\.", MD);
    try {
      const result = await screenPools(client, config);
      if (result.pools.length === 0) {
        await ctx.editMessageText("No pools found\\.", { ...MD, reply_markup: backToSourceKb() });
        return;
      }
      const lines = [tgBold("🔥 Trending Pools — Select"), ""];
      const kb = new InlineKeyboard();
      for (const p of result.pools.slice(0, 10)) {
        lines.push(
          `• ${tgBold(escapeMarkdown(`${p.baseSymbol}/${p.quoteSymbol}`))} — TVL: ${escapeMarkdown(`$${p.tvl.toLocaleString()}`)} \\| Fee/TVL: ${escapeMarkdown(`${p.feeActiveTvlRatio.toFixed(2)}%`)}`,
        );
        const wid = createWizard({
          poolAddress: p.pool,
          poolName: `${p.baseSymbol}/${p.quoteSymbol}`,
          binStep: p.binStep,
          currentPrice: p.price,
        });
        kb.text(`${p.baseSymbol}/${p.quoteSymbol}`.slice(0, 20), `crt:strategy:${wid}`).row();
      }
      lines.push("");
      await ctx.editMessageText(lines.join("\n"), { ...MD, reply_markup: kb.text("⬅️ Back", "crt:source") });
    } catch (e) {
      await ctx.editMessageText(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, { ...MD, reply_markup: backToSourceKb() });
    }
  });

  bot.callbackQuery("crt:from:my", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Loading your pools\\.\\.\\.", MD);
    try {
      const wallet = resolveWallet(undefined, config);
      const res = await client.openPortfolio(wallet, 1, 50);
      if (res.pools.length === 0) {
        await ctx.editMessageText("No open positions\\. Choose Trending instead\\.", { ...MD, reply_markup: backToSourceKb() });
        return;
      }
      const lines = [tgBold("📈 Your Pools — Select"), ""];
      const kb = new InlineKeyboard();
      for (const p of res.pools) {
        const label = `${p.tokenX}/${p.tokenY}`;
        lines.push(`• ${tgBold(escapeMarkdown(label))} — fees: ${escapeMarkdown(`$${Number(p.unclaimedFees).toFixed(2)}`)}`);
        try {
          const detail = await client.pool(p.poolAddress);
          const wid = createWizard({
            poolAddress: p.poolAddress,
            poolName: label,
            binStep: detail.pool_config.bin_step,
            currentPrice: detail.current_price,
          });
          kb.text(label.slice(0, 20), `crt:strategy:${wid}`).row();
        } catch {}
      }
      lines.push("");
      await ctx.editMessageText(lines.join("\n"), { ...MD, reply_markup: kb.text("⬅️ Back", "crt:source") });
    } catch (e) {
      await ctx.editMessageText(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, { ...MD, reply_markup: backToSourceKb() });
    }
  });

  // ─── crt:from:address — prompt user to paste a pool address ─────────────
  bot.callbackQuery("crt:from:address", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = ctx.chat?.id ?? ctx.from?.id;
    if (chatId != null) {
      let retry = 0;
      const addrHandler = async (text: string) => {
        if (!isLikelyPubkey(text)) {
          retry++;
          if (retry >= 2) {
            await ctx.reply("✖ Invalid address\\. Use /create to retry\\.", MD);
            return;
          }
          await ctx.reply("✖ That doesn't look like a valid address\\. Send a valid Solana address:", MD);
          setInputSession(chatId, addrHandler);
          return;
        }
        const loading = await ctx.reply("⏳ Loading pool\\.\\.\\.", MD);
        try {
          const detail = await client.pool(text);
          const wid = createWizard({
            poolAddress: detail.address,
            poolName: detail.name,
            binStep: detail.pool_config.bin_step,
            currentPrice: detail.current_price,
          });
          await ctx.api.editMessageText(loading.chat.id, loading.message_id, await renderStrategyStep(wid), { ...MD, reply_markup: strategyKb(wid) });
        } catch (e) {
          await ctx.api.editMessageText(loading.chat.id, loading.message_id, `✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, { ...MD, reply_markup: backToSourceKb() });
        }
      };
      setInputSession(chatId, addrHandler);
    }
    await ctx.editMessageText(
      [
        tgBold("📍 Paste Pool Address"),
        "",
        "Send the DLMM pool address as your next message\\.",
        escapeMarkdown("Example: 5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6"),
      ].join("\n"),
      { ...MD, reply_markup: backToSourceKb() },
    );
  });

  // ─── crt:strategy:<wid> — pick strategy ─────────────────────────────────
  bot.callbackQuery(/^crt:strategy:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    if (!getWizard(wid)) return await expired(ctx);
    await ctx.editMessageText(await renderStrategyStep(wid), { ...MD, reply_markup: strategyKb(wid) });
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
      .text("↔️ Two-sided", `crt:range:${wid}:two-sided`).row()
      .text("➡️ Single X (meme)", `crt:range:${wid}:single-x`).row()
      .text("⬅️ Single Y (SOL)", `crt:range:${wid}:single-y`).row()
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
      .text(`🎯 Default (${escapeMarkdown(def.label)})`, `crt:default:${wid}`).row();
    WIDE_PRESETS.forEach(({ label }, i) => {
      kb.text(label, `crt:wide:${wid}:${i}`).row();
    });
    kb.text("✏️ Custom", `crt:custom:${wid}`).row()
      .text("⬅️ Back", `crt:mode:${wid}:${state.strategy}`);

    await ctx.editMessageText(text, { ...MD, reply_markup: kb });
  });

  // ─── crt:default:<wid> — default bins by mode → prompt amounts → execute ──
  bot.callbackQuery(/^crt:default:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const state = getWizard(wid);
    if (!state) return await expired(ctx);
    const def = DEFAULT_BINS[state.mode ?? "two-sided"] ?? DEFAULT_BINS["two-sided"];
    updateWizard(wid, { minBin: def.minBin, maxBin: def.maxBin, isPctMode: false });
    await promptAmounts(ctx, wid);
  });

  // ─── crt:wide:<wid>:<idx> — wide pct preset → prompt amounts → execute ──
  bot.callbackQuery(/^crt:wide:([^:]+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const preset = WIDE_PRESETS[parseInt(ctx.match![2], 10)];
    const state = getWizard(wid);
    if (!state || !preset) return await expired(ctx);
    updateWizard(wid, { minPct: preset.minPct, maxPct: preset.maxPct, isPctMode: true });
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
          .text("📊 Bin mode (relative)", `crt:custom:bin:${wid}`).row()
          .text("📈 Pct mode (% vs price)", `crt:custom:pct:${wid}`).row()
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

    setInputSession(chatId, async (minBinText) => {
      const minBin = parseInt(minBinText, 10);
      if (Number.isNaN(minBin)) {
        await ctx.reply("✖ Invalid number\\. Send min bin \\(e\\.g\\. \\-70\\):", MD);
        return;
      }
      setInputSession(chatId, async (maxBinText) => {
        const maxBin = parseInt(maxBinText, 10);
        if (Number.isNaN(maxBin) || maxBin <= minBin) {
          await ctx.reply("✖ Max bin must be a number greater than min bin\\. Send max bin:", MD);
          return;
        }
        updateWizard(wid, { minBin, maxBin, isPctMode: false });
        await promptAmounts(ctx, wid);
      });
      await ctx.reply(`✏️ Min bin: ${escapeMarkdown(minBinText)}\n\nNow send *max bin* \\(e\\.g\\. 70\\):`, MD);
    });
    await ctx.editMessageText("✏️ Send *min bin* \\(relative to active bin, e\\.g\\. \\-70\\):", MD);
  });

  // ─── crt:custom:pct:<wid> — ask for min/max pct ─────────────────────────
  bot.callbackQuery(/^crt:custom:pct:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const state = getWizard(wid);
    if (!state) return await expired(ctx);
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);

    setInputSession(chatId, async (minPctText) => {
      const minPct = parseFloat(minPctText) / 100;
      if (Number.isNaN(minPct)) {
        await ctx.reply("✖ Invalid number\\. Send min %% \\(e\\.g\\. \\-50\\):", MD);
        return;
      }
      setInputSession(chatId, async (maxPctText) => {
        const maxPct = parseFloat(maxPctText) / 100;
        if (Number.isNaN(maxPct) || maxPct <= minPct) {
          await ctx.reply("✖ Max %% must be a number greater than min %%\\. Send max %% \\(e\\.g\\. 0\\):", MD);
          return;
        }
        updateWizard(wid, { minPct, maxPct, isPctMode: true });
        await promptAmounts(ctx, wid);
      });
      await ctx.reply(`✏️ Min: ${escapeMarkdown(minPctText)}%\n\nNow send *max %%* \\(e\\.g\\. 0\\):`, MD);
    });
    await ctx.editMessageText("✏️ Send *min %%* \\(negative, e\\.g\\. \\-50 means 50% below price\\):", MD);
  });

  // ─── crt:execute — execute create position ───────────────────────────────
  bot.callbackQuery(/^crt:execute:([^:]+):(.+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const xAmt = ctx.match![2];
    const yAmt = ctx.match![3];
    const state = getWizard(wid);
    if (!state) {
      await ctx.editMessageText("⌛ Session expired\\. Run /create again\\.", MD);
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
          : { minBinId: state.minBin!, maxBinId: state.maxBin!, relativeBins: true }),
      });
      const sigs = (res.signatures ?? [res]).join("\n");
      const body = sigs.split("\n").map((s: string) => s.trim()).filter(Boolean).map((s: string) => tgTxLink(s)).join("\n");
      await ctx.editMessageText(`✅ Done\\!\n${body}`, MD);
    } catch (e) {
      await ctx.editMessageText(`✖ Failed: ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, MD);
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
    setInputSession(chatId, async (yAmtText) => {
      const yAmt = parseFloat(yAmtText);
      if (Number.isNaN(yAmt) || yAmt <= 0) {
        await ctx.reply("✖ Invalid amount\\. Send Y amount \\(SOL/stable\\):", MD);
        return;
      }
      await confirmAndExecute(ctx, wid, "0", yAmtText);
    });
    await ctx.editMessageText(
      [tgBold(`📋 ${escapeMarkdown(poolName)}`), `Mode: single\\-sided Y \\(SOL/stable\\)`, "", "✏️ Send *Y amount* \\(SOL/stable, e\\.g\\. 0\\.5\\):"].join("\n"),
      MD,
    );
  } else if (mode === "single-x") {
    setInputSession(chatId, async (xAmtText) => {
      const xAmt = parseFloat(xAmtText);
      if (Number.isNaN(xAmt) || xAmt <= 0) {
        await ctx.reply("✖ Invalid amount\\. Send X amount \\(meme token\\):", MD);
        return;
      }
      await confirmAndExecute(ctx, wid, xAmtText, "0");
    });
    await ctx.editMessageText(
      [tgBold(`📋 ${escapeMarkdown(poolName)}`), `Mode: single\\-sided X \\(meme\\)`, "", "✏️ Send *X amount* \\(meme token, e\\.g\\. 1000\\):"].join("\n"),
      MD,
    );
  } else {
    setInputSession(chatId, async (xAmtText) => {
      const xAmt = parseFloat(xAmtText);
      if (Number.isNaN(xAmt) || xAmt <= 0) {
        await ctx.reply("✖ Invalid amount\\. Send X amount \\(meme token\\):", MD);
        return;
      }
      setInputSession(chatId, async (yAmtText) => {
        const yAmt = parseFloat(yAmtText);
        if (Number.isNaN(yAmt) || yAmt <= 0) {
          await ctx.reply("✖ Invalid amount\\. Send Y amount \\(SOL/stable\\):", MD);
          return;
        }
        await confirmAndExecute(ctx, wid, xAmtText, yAmtText);
      });
      await ctx.reply(`✅ X: ${escapeMarkdown(xAmtText)}\n\nNow send *Y amount* \\(SOL/stable, e\\.g\\. 0\\.5\\):`, MD);
    });
    await ctx.editMessageText(
      [tgBold(`📋 ${escapeMarkdown(poolName)}`), `Mode: two\\-sided`, "", "✏️ Send *X amount* \\(meme token, e\\.g\\. 1000\\):"].join("\n"),
      MD,
    );
  }
}

async function confirmAndExecute(ctx: Context, wid: string, xAmt: string, yAmt: string) {
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

  deleteWizard(wid);

  try {
    await ctx.reply(summary, { ...MD, reply_markup: kb });
  } catch (e) {
    await ctx.reply(`✖ ${escapeMarkdown(e instanceof Error ? e.message : String(e))}`, MD);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLikelyPubkey(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

async function renderStrategyStep(wid: string): Promise<string> {
  const state = getWizard(wid)!;
  return [
    tgBold(`📋 ${escapeMarkdown(state.poolName)}`),
    `Pool: ${tgCode(state.poolAddress)}`,
    `Bin step: ${escapeMarkdown(String(state.binStep))} \\| Price: ${escapeMarkdown(String(state.currentPrice))}`,
    "",
    tgBold("Step 1/3 — Pick strategy:"),
    "",
    "• *Spot* — uniform liquidity across range",
    "• *Bid\\-Ask* — concentrated at edges \\(volatility\\)",
    "• *Curve* — bell curve centered on price",
  ].join("\n");
}

function strategyKb(wid: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("📊 Spot", `crt:mode:${wid}:spot`)
    .text("📈 Bid-Ask", `crt:mode:${wid}:bidask`)
    .text("🔔 Curve", `crt:mode:${wid}:curve`)
    .row()
    .text("⬅️ Back", "crt:source");
}

async function showSourceMenu(ctx: Context, mode: "reply" | "edit") {
  const text = [tgBold("➕ Create Position"), "", "Which pool do you want to use?"].join("\n");
  const kb = new InlineKeyboard()
    .text("🔥 Trending Pools", "crt:from:trending").row()
    .text("📈 My Active Pools", "crt:from:my").row()
    .text("📍 Paste Pool Address", "crt:from:address");

  if (mode === "reply") {
    await (ctx as any).reply(text, { ...MD, reply_markup: kb });
  } else {
    await (ctx as any).editMessageText(text, { ...MD, reply_markup: kb });
  }
}

async function expired(ctx: Context) {
  await ctx.editMessageText("⌛ Session expired\\. Please run /create again\\.", {
    ...MD,
    reply_markup: new InlineKeyboard().text("🔄 Start over", "crt:source"),
  });
}

function backToSourceKb() {
  return new InlineKeyboard().text("⬅️ Back", "crt:source");
}
