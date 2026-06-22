import { Bot, Context, InlineKeyboard } from "grammy";
import type { MeteoraClient } from "../../api.js";
import type { VexisConfig } from "../../config.js";
import { resolveWallet } from "../../config.js";
import { escapeMarkdown, tgBold, tgCode } from "../format.js";
import { MD } from "../utils.js";
import {
  createWizard,
  getWizard,
  updateWizard,
  deleteWizard,
} from "../wizard-store.js";

const RANGE_PRESETS = [
  { label: "±1%", pct: 0.01 },
  { label: "±2%", pct: 0.02 },
  { label: "±5%", pct: 0.05 },
  { label: "±10%", pct: 0.1 },
] as const;

// Wide single-sided price ranges (relative to current price). minPct/maxPct
// are signed fractions, e.g. -0.90 → 0 means "from -90% up to current price".
const WIDE_PRESETS = [
  { label: "-90% → 0% (SOL bid)", minPct: -0.9, maxPct: 0 },
  { label: "-80% → 0% (SOL bid)", minPct: -0.8, maxPct: 0 },
  { label: "-70% → 0% (SOL bid)", minPct: -0.7, maxPct: 0 },
  { label: "-60% → 0% (SOL bid)", minPct: -0.6, maxPct: 0 },
  { label: "-50% → 0% (SOL bid)", minPct: -0.5, maxPct: 0 },
] as const;

export function registerCreate(
  bot: Bot,
  client: MeteoraClient,
  config: VexisConfig,
) {
  // ─── Entry: /create without args ────────────────────────────────────────
  // Falls through to onchain.ts handler when args are present
  bot.command("create", async (ctx, next) => {
    const args = (ctx.match as string).trim();
    if (args) return next(); // has args — let onchain.ts handle it
    await showSourceMenu(ctx, "reply");
  });

  // ─── crt:source — pick pool source ──────────────────────────────────────
  bot.callbackQuery("crt:source", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSourceMenu(ctx, "edit");
  });

  bot.callbackQuery("crt:from:trending", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("⏳ Loading trending pools\\.\\.\\.", MD);
    try {
      const poolCfg = config.pools ?? {};
      const filterBy = poolCfg.filterBy ?? "tvl>100";
      const minMc = poolCfg.minMarketCap ?? 100000;
      const maxMc = poolCfg.maxMarketCap ?? 2000000;
      const res = await client.pools({
        pageSize: 15,
        filterBy,
        sortBy: "fee_tvl_ratio_30m:desc",
      });
      const pools = res.data.filter(
        (p) => p.token_x.market_cap >= minMc && p.token_x.market_cap <= maxMc,
      );
      if (pools.length === 0) {
        await ctx.editMessageText("No pools found\\.", {
          ...MD,
          reply_markup: backToSourceKb(),
        });
        return;
      }
      const lines = [tgBold("🔥 Trending Pools — Select"), ""];
      const kb = new InlineKeyboard();
      for (const p of pools.slice(0, 10)) {
        lines.push(
          `• ${tgBold(escapeMarkdown(p.name))} — TVL: ${escapeMarkdown(`$${Math.round(p.tvl).toLocaleString()}`)} \\| APR: ${escapeMarkdown(`${p.apr.toFixed(1)}%`)}`,
        );
        const wid = createWizard({
          poolAddress: p.address,
          poolName: p.name,
          binStep: p.pool_config.bin_step,
          currentPrice: p.current_price,
        });
        kb.text(p.name.slice(0, 20), `crt:strategy:${wid}`).row();
      }
      lines.push("");
      await ctx.editMessageText(lines.join("\n"), {
        ...MD,
        reply_markup: kb.text("⬅️ Back", "crt:source"),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, {
        ...MD,
        reply_markup: backToSourceKb(),
      });
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
        lines.push(
          `• ${tgBold(escapeMarkdown(label))} — fees: ${escapeMarkdown(`$${Number(p.unclaimedFees).toFixed(2)}`)}`,
        );
        // Fetch pool detail for binStep + currentPrice
        try {
          const detail = await client.pool(p.poolAddress);
          const wid = createWizard({
            poolAddress: p.poolAddress,
            poolName: label,
            binStep: detail.pool_config.bin_step,
            currentPrice: detail.current_price,
          });
          kb.text(label.slice(0, 20), `crt:strategy:${wid}`).row();
        } catch {
          // skip pools where detail fetch fails
        }
      }
      lines.push("");
      await ctx.editMessageText(lines.join("\n"), {
        ...MD,
        reply_markup: kb.text("⬅️ Back", "crt:source"),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, {
        ...MD,
        reply_markup: backToSourceKb(),
      });
    }
  });

  // ─── crt:from:address — prompt user to paste a pool address ─────────────
  bot.callbackQuery("crt:from:address", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from?.id;
    if (userId != null) awaitingPoolAddress.set(userId, Date.now() + 5 * 60 * 1000);
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

  // ─── capture the pasted pool address ────────────────────────────────────
  bot.on("message:text", async (ctx, next) => {
    const userId = ctx.from?.id;
    const text = ctx.message.text.trim();
    const expiresAt = userId != null ? awaitingPoolAddress.get(userId) : undefined;
    // Only handle when we asked for an address; otherwise pass through.
    if (userId == null || expiresAt == null || text.startsWith("/")) return next();
    awaitingPoolAddress.delete(userId);
    if (Date.now() > expiresAt) {
      await ctx.reply("⌛ Session expired\\. Tap /create again\\.", MD);
      return;
    }
    if (!isLikelyPubkey(text)) {
      await ctx.reply("✖ That doesn't look like a valid address\\. Tap /create to retry\\.", MD);
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
      await ctx.api.editMessageText(
        loading.chat.id,
        loading.message_id,
        await renderStrategyStep(wid),
        { ...MD, reply_markup: strategyKb(wid) },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.api.editMessageText(
        loading.chat.id,
        loading.message_id,
        `✖ ${escapeMarkdown(msg)}`,
        { ...MD, reply_markup: backToSourceKb() },
      );
    }
  });

  // ─── crt:strategy:<wid> — pick strategy ─────────────────────────────────
  bot.callbackQuery(/^crt:strategy:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    if (!getWizard(wid)) {
      await expired(ctx);
      return;
    }
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
    if (!state) {
      await expired(ctx);
      return;
    }
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
    if (!state) {
      await expired(ctx);
      return;
    }
    updateWizard(wid, { mode });

    const { currentPrice, binStep } = state;
    const strategy = state.strategy!;

    const presetLines = RANGE_PRESETS.map(({ label, pct }) => {
      const { minBin, maxBin } = calcBins(binStep, pct);
      return `• ${label} → bins ${minBin} to ${maxBin}`;
    });

    const text = [
      tgBold(`📋 ${escapeMarkdown(state.poolName)}`),
      `Strategy: ${escapeMarkdown(strategy)} \\| Mode: ${escapeMarkdown(mode)}`,
      `Current price: ${escapeMarkdown(String(currentPrice))} \\| Bin step: ${escapeMarkdown(String(binStep))}`,
      "",
      tgBold("Step 3/3 — Pick range:"),
      "",
      ...presetLines.map(escapeMarkdown),
    ].join("\n");

    const kb = new InlineKeyboard();
    for (const { label, pct } of RANGE_PRESETS) {
      kb.text(label, `crt:amt:${wid}:${pct}`);
    }
    kb.row();
    // Wide single-sided price presets (mirror UI -90%/0% style ranges)
    WIDE_PRESETS.forEach(({ label }, i) => {
      kb.text(label, `crt:wide:${wid}:${i}`).row();
    });
    kb.text("✏️ Custom range", `crt:custom:${wid}`)
      .row()
      .text("⬅️ Back", `crt:mode:${wid}:${strategy}`);

    await ctx.editMessageText(text, { ...MD, reply_markup: kb });
  });

  // ─── crt:wide:<wid>:<idx> — wide price-range preset → price command ──────
  bot.callbackQuery(/^crt:wide:([^:]+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const preset = WIDE_PRESETS[parseInt(ctx.match![2], 10)];
    const state = getWizard(wid);
    if (!state || !preset) {
      await expired(ctx);
      return;
    }

    const strategy = state.strategy!;
    const mode = state.mode!;
    const minPrice = +(state.currentPrice * (1 + preset.minPct)).toPrecision(8);
    const maxPrice = +(state.currentPrice * (1 + preset.maxPct)).toPrecision(8);
    const sideArg =
      mode === "single-x" ? " single" : mode === "single-y" ? " single-y" : "";
    const xPlaceholder = mode === "single-y" ? "0" : "<xAmt>";
    const yPlaceholder = mode === "single-x" ? "0" : "<yAmt>";

    const cmd = `/create ${state.poolAddress} ${strategy} ${xPlaceholder} ${yPlaceholder} price ${minPrice} ${maxPrice}${sideArg}`;

    const text = [
      tgBold("✅ Wide range ready\\!"),
      "",
      `Pool: ${tgCode(state.poolAddress)}`,
      `Strategy: ${escapeMarkdown(strategy)} \\| Mode: ${escapeMarkdown(mode)}`,
      `Range: ${escapeMarkdown(preset.label)} → price ${escapeMarkdown(`${minPrice} to ${maxPrice}`)}`,
      "",
      escapeMarkdown(
        "Wide ranges auto-split into multiple positions (≤69 bins each).",
      ),
      "Copy the command and fill the amount:",
      `\`${cmd}\``,
    ].join("\n");

    const kb = new InlineKeyboard()
      .text("⬅️ Back", `crt:range:${wid}:${mode}`)
      .text("🔄 Start over", "crt:source");

    await ctx.editMessageText(text, { ...MD, reply_markup: kb });
  });

  // ─── crt:amt:<wid>:<pct> — show pre-filled command ──────────────────────
  bot.callbackQuery(/^crt:amt:([^:]+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const pct = parseFloat(ctx.match![2]);
    const state = getWizard(wid);
    if (!state) {
      await expired(ctx);
      return;
    }

    const { minBin, maxBin } = calcBins(state.binStep, pct);
    const strategy = state.strategy!;
    const mode = state.mode!;

    const sideArg =
      mode === "single-x" ? " single" : mode === "single-y" ? " single-y" : "";
    const xPlaceholder = mode === "single-y" ? "0" : "<xAmt>";
    const yPlaceholder = mode === "single-x" ? "0" : "<yAmt>";

    const cmd = `/create ${state.poolAddress} ${strategy} ${xPlaceholder} ${yPlaceholder} ${minBin} ${maxBin}${sideArg}`;

    const text = [
      tgBold("✅ Ready to create\\!"),
      "",
      `Pool: ${tgCode(state.poolAddress)}`,
      `Strategy: ${escapeMarkdown(strategy)} \\| Mode: ${escapeMarkdown(mode)}`,
      `Range: ${escapeMarkdown(`±${(pct * 100).toFixed(0)}%`)} → bins ${escapeMarkdown(`${minBin}`)} to ${escapeMarkdown(`${maxBin}`)}`,
      "",
      "Copy the command below and fill in the amounts:",
      `\`${cmd}\``,
      "",
      mode === "two-sided"
        ? escapeMarkdown(
            "Replace <xAmt> with meme token amount, <yAmt> with SOL/stable amount.",
          )
        : mode === "single-x"
          ? escapeMarkdown(
              "Replace <xAmt> with meme token amount. Y is already set to 0.",
            )
          : escapeMarkdown(
              "Replace <yAmt> with SOL/stable amount. X is already set to 0.",
            ),
    ].join("\n");

    const kb = new InlineKeyboard()
      .text("⬅️ Back", `crt:range:${wid}:${mode}`)
      .text("🔄 Start over", "crt:source");

    deleteWizard(wid);
    await ctx.editMessageText(text, { ...MD, reply_markup: kb });
  });

  // ─── crt:custom:<wid> — show pre-filled command with bin placeholders ────
  bot.callbackQuery(/^crt:custom:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const wid = ctx.match![1];
    const state = getWizard(wid);
    if (!state) {
      await expired(ctx);
      return;
    }

    const strategy = state.strategy!;
    const mode = state.mode!;
    const sideArg =
      mode === "single-x" ? " single" : mode === "single-y" ? " single-y" : "";
    const xPlaceholder = mode === "single-y" ? "0" : "<xAmt>";
    const yPlaceholder = mode === "single-x" ? "0" : "<yAmt>";

    const cmd = `/create ${state.poolAddress} ${strategy} ${xPlaceholder} ${yPlaceholder} <minBin> <maxBin>${sideArg}`;

    const cmdPct = `/create ${state.poolAddress} ${strategy} ${xPlaceholder} ${yPlaceholder} pct <minPct> <maxPct>${sideArg}`;
    const cmdPrice = `/create ${state.poolAddress} ${strategy} ${xPlaceholder} ${yPlaceholder} price <minPrice> <maxPrice>${sideArg}`;

    const text = [
      tgBold("✏️ Custom Range"),
      "",
      `Current price: ${escapeMarkdown(String(state.currentPrice))}`,
      `Bin step: ${escapeMarkdown(String(state.binStep))} \\(1 bin ≈ ${escapeMarkdown(`${state.binStep / 100}%`)}\\)`,
      "",
      tgBold("Bin mode") + " \\(relative to active bin\\):",
      `\`${cmd}\``,
      "",
      tgBold("Pct mode") + " \\(% vs current price\\):",
      `\`${cmdPct}\``,
      "",
      tgBold("Price mode") + " \\(absolute price range\\):",
      `\`${cmdPrice}\``,
    ].join("\n");

    const kb = new InlineKeyboard().text("⬅️ Back", `crt:range:${wid}:${mode}`);

    await ctx.editMessageText(text, { ...MD, reply_markup: kb });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// userId → expiry timestamp; set while we wait for a pasted pool address.
const awaitingPoolAddress = new Map<number, number>();

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

function calcBins(
  binStep: number,
  pct: number,
): { minBin: number; maxBin: number } {
  // Each bin represents binStep basis points of price movement.
  // bins_needed = pct / (binStep / 10000)
  const binsPerSide = Math.round(pct / (binStep / 10000));
  return { minBin: -binsPerSide, maxBin: binsPerSide };
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
