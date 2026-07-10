import { Bot, Context, InlineKeyboard } from "grammy";
import type { VexisConfig } from "../../config.js";
import { saveConfig } from "../../config.js";
import { escapeMarkdown, tgBold, tgCode } from "../format.js";
import { MD } from "../utils.js";

/** Config fields that can be edited via Telegram. */
const EDITABLE_FIELDS = [
  { key: "wallet", label: "Wallet", type: "string" as const },
  { key: "rpcUrl", label: "RPC URL", type: "string" as const },
  { key: "dev", label: "Dev Mode", type: "boolean" as const },
  { key: "stopLossPct", label: "Stop Loss %", type: "number" as const },
  { key: "takeProfitPct", label: "Take Profit %", type: "number" as const },
  { key: "pools.timeframe", label: "Timeframe", type: "string" as const },
  { key: "pools.category", label: "Category", type: "string" as const },
  { key: "pools.pageSize", label: "Page Size", type: "number" as const },
  { key: "pools.displayLimit", label: "Display Limit", type: "number" as const },
  { key: "pools.minMcap", label: "Min MC", type: "number" as const },
  { key: "pools.maxMcap", label: "Max MC", type: "number" as const },
  { key: "pools.minHolders", label: "Min Holders", type: "number" as const },
  { key: "pools.maxHolders", label: "Max Holders", type: "number" as const },
  { key: "pools.minVolume", label: "Min Volume", type: "number" as const },
  { key: "pools.maxVolume", label: "Max Volume", type: "number" as const },
  { key: "pools.minTvl", label: "Min TVL", type: "number" as const },
  { key: "pools.maxTvl", label: "Max TVL", type: "number" as const },
  { key: "pools.minActiveTvl", label: "Min Active TVL", type: "number" as const },
  { key: "pools.maxActiveTvl", label: "Max Active TVL", type: "number" as const },
  { key: "pools.minFee", label: "Min Fee ($)", type: "number" as const },
  { key: "pools.maxFee", label: "Max Fee ($)", type: "number" as const },
  { key: "pools.minFeeActiveTvlRatio", label: "Min Fee/TVL", type: "number" as const },
  { key: "pools.maxFeeActiveTvlRatio", label: "Max Fee/TVL", type: "number" as const },
  { key: "pools.minBinStep", label: "Min Bin Step", type: "number" as const },
  { key: "pools.maxBinStep", label: "Max Bin Step", type: "number" as const },
  { key: "pools.minVolatility", label: "Min Volatility", type: "number" as const },
  { key: "pools.maxVolatility", label: "Max Volatility", type: "number" as const },
  { key: "pools.minPoolPrice", label: "Min Pool Price", type: "number" as const },
  { key: "pools.maxPoolPrice", label: "Max Pool Price", type: "number" as const },
  { key: "pools.minActivePositions", label: "Min Active Pos", type: "number" as const },
  { key: "pools.maxActivePositions", label: "Max Active Pos", type: "number" as const },
  { key: "pools.minOpenPositions", label: "Min Open Pos", type: "number" as const },
  { key: "pools.maxOpenPositions", label: "Max Open Pos", type: "number" as const },
  { key: "pools.minSwapCount", label: "Min Swaps", type: "number" as const },
  { key: "pools.maxSwapCount", label: "Max Swaps", type: "number" as const },
  { key: "pools.minUniqueTraders", label: "Min Traders", type: "number" as const },
  { key: "pools.maxUniqueTraders", label: "Max Traders", type: "number" as const },
  { key: "pools.minPriceChangePct", label: "Min Price Chg %", type: "number" as const },
  { key: "pools.maxPriceChangePct", label: "Max Price Chg %", type: "number" as const },
  { key: "pools.minVolumeChangePct", label: "Min Vol Chg %", type: "number" as const },
  { key: "pools.maxVolumeChangePct", label: "Max Vol Chg %", type: "number" as const },
  { key: "pools.priceTrend", label: "Price Trend", type: "string" as const },
  { key: "pools.solPairOnly", label: "SOL Pair Only", type: "boolean" as const },
  { key: "pools.minOrganic", label: "Min Organic", type: "number" as const },
  { key: "pools.maxOrganic", label: "Max Organic", type: "number" as const },
  { key: "pools.minQuoteOrganic", label: "Min Q.Organic", type: "number" as const },
  { key: "pools.maxQuoteOrganic", label: "Max Q.Organic", type: "number" as const },
  { key: "pools.baseTokenHasHighSupplyConcentration", label: "High Supply Conc.", type: "boolean" as const },
  { key: "pools.baseTokenHasHighSingleOwnership", label: "High Single Owner", type: "boolean" as const },
  { key: "pools.minTokenAgeHours", label: "Min Token Age (h)", type: "number" as const },
  { key: "pools.maxTokenAgeHours", label: "Max Token Age (h)", type: "number" as const },
] as const;

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function formatValue(key: string, config: VexisConfig): string {
  const val = getNestedValue(config, key);
  if (val === undefined || val === null) return "(default)";
  if (typeof val === "boolean") return val ? "ON" : "OFF";
  if (key === "wallet" && typeof val === "string") {
    return val.length > 20 ? val.slice(0, 8) + "..." + val.slice(-8) : val;
  }
  if (key === "rpcUrl" && typeof val === "string") {
    return val.length > 40 ? val.slice(0, 30) + "..." : val;
  }
  return String(val);
}

function buildConfigText(config: VexisConfig, configPath: string | null): string {
  const lines = [
    tgBold("⚙️ Config"),
    `Path: ${tgCode(configPath ?? "(none)")}`,
    "",
    tgBold("General"),
    `  Wallet: ${tgCode(formatValue("wallet", config))}`,
    `  RPC: ${tgCode(formatValue("rpcUrl", config))}`,
    `  Dev: ${formatValue("dev", config)}`,
    "",
    tgBold("Screening"),
  ];
  const pools = config.pools ?? {};
  const screeningFields = EDITABLE_FIELDS.filter((f) => f.key.startsWith("pools."));
  for (const field of screeningFields) {
    const shortKey = field.key.replace("pools.", "");
    const val = getNestedValue(pools, shortKey);
    const display = val === undefined || val === null ? "(default)" : String(val);
    lines.push(`  ${escapeMarkdown(field.label)}: ${tgCode(display)}`);
  }
  return lines.join("\n");
}

// Page 1: General | Page 2: MC/Holders | Page 3: TVL/Vol/Fee | Page 4: Bin/Organic | Page 5: Advanced
function buildConfigKeyboard(page = 1): InlineKeyboard {
  if (page === 1) {
    return new InlineKeyboard()
      .text("✏️ Wallet", "cfg:set:wallet")
      .text("✏️ RPC", "cfg:set:rpcUrl")
      .text("🔄 Dev", "cfg:toggle:dev")
      .row()
      .text("✏️ Timeframe", "cfg:set:pools.timeframe")
      .text("✏️ Category", "cfg:set:pools.category")
      .row()
      .text("✏️ Page Size", "cfg:set:pools.pageSize")
      .text("✏️ Display Limit", "cfg:set:pools.displayLimit")
      .row()
      .text("MC/Holders »", "cfg:page:2");
  }
  if (page === 2) {
    return new InlineKeyboard()
      .text("✏️ Min MC", "cfg:set:pools.minMcap")
      .text("✏️ Max MC", "cfg:set:pools.maxMcap")
      .row()
      .text("✏️ Min Holders", "cfg:set:pools.minHolders")
      .text("✏️ Max Holders", "cfg:set:pools.maxHolders")
      .row()
      .text("« General", "cfg:page:1")
      .text("TVL/Vol »", "cfg:page:3");
  }
  if (page === 3) {
    return new InlineKeyboard()
      .text("✏️ Min TVL", "cfg:set:pools.minTvl")
      .text("✏️ Max TVL", "cfg:set:pools.maxTvl")
      .row()
      .text("✏️ Min Vol", "cfg:set:pools.minVolume")
      .text("✏️ Max Vol", "cfg:set:pools.maxVolume")
      .row()
      .text("✏️ Min Fee", "cfg:set:pools.minFee")
      .text("✏️ Max Fee", "cfg:set:pools.maxFee")
      .row()
      .text("✏️ Min Fee/TVL", "cfg:set:pools.minFeeActiveTvlRatio")
      .text("✏️ Max Fee/TVL", "cfg:set:pools.maxFeeActiveTvlRatio")
      .row()
      .text("« MC/Holders", "cfg:page:2")
      .text("Bin/Org »", "cfg:page:4");
  }
  if (page === 4) {
    return new InlineKeyboard()
      .text("✏️ Min Bin", "cfg:set:pools.minBinStep")
      .text("✏️ Max Bin", "cfg:set:pools.maxBinStep")
      .row()
      .text("✏️ Min Organic", "cfg:set:pools.minOrganic")
      .text("✏️ Max Organic", "cfg:set:pools.maxOrganic")
      .row()
      .text("✏️ Min Q.Org", "cfg:set:pools.minQuoteOrganic")
      .text("✏️ Max Q.Org", "cfg:set:pools.maxQuoteOrganic")
      .row()
      .text("🔄 SOL Pair", "cfg:toggle:pools.solPairOnly")
      .text("🔄 High Conc", "cfg:toggle:pools.baseTokenHasHighSupplyConcentration")
      .row()
      .text("« TVL/Vol", "cfg:page:3")
      .text("Advanced »", "cfg:page:5");
  }
  return new InlineKeyboard()
    .text("✏️ Min Act TVL", "cfg:set:pools.minActiveTvl")
    .text("✏️ Max Act TVL", "cfg:set:pools.maxActiveTvl")
    .row()
    .text("✏️ Min Volat", "cfg:set:pools.minVolatility")
    .text("✏️ Max Volat", "cfg:set:pools.maxVolatility")
    .row()
    .text("✏️ Min Price", "cfg:set:pools.minPoolPrice")
    .text("✏️ Max Price", "cfg:set:pools.maxPoolPrice")
    .row()
    .text("✏️ Min Swaps", "cfg:set:pools.minSwapCount")
    .text("✏️ Min Traders", "cfg:set:pools.minUniqueTraders")
    .row()
    .text("✏️ Price Trend", "cfg:set:pools.priceTrend")
    .text("🔄 Single Owner", "cfg:toggle:pools.baseTokenHasHighSingleOwnership")
    .row()
    .text("✏️ Min Age (h)", "cfg:set:pools.minTokenAgeHours")
    .text("✏️ Max Age (h)", "cfg:set:pools.maxTokenAgeHours")
    .row()
    .text("« Bin/Organic", "cfg:page:4");
}

function pageForKey(key: string): number {
  const page1 = new Set(["wallet", "rpcUrl", "dev", "pools.timeframe", "pools.category", "pools.pageSize", "pools.displayLimit"]);
  const page2 = new Set(["pools.minMcap", "pools.maxMcap", "pools.minHolders", "pools.maxHolders"]);
  const page3 = new Set(["pools.minTvl", "pools.maxTvl", "pools.minVolume", "pools.maxVolume", "pools.minFee", "pools.maxFee", "pools.minFeeActiveTvlRatio", "pools.maxFeeActiveTvlRatio"]);
  const page4 = new Set(["pools.minBinStep", "pools.maxBinStep", "pools.minOrganic", "pools.maxOrganic", "pools.minQuoteOrganic", "pools.maxQuoteOrganic", "pools.solPairOnly", "pools.baseTokenHasHighSupplyConcentration"]);
  if (page1.has(key)) return 1;
  if (page2.has(key)) return 2;
  if (page3.has(key)) return 3;
  if (page4.has(key)) return 4;
  return 5;
}

/** Pending edits: chatId → { field, key, type, page } */
const pendingEdits = new Map<string, { field: string; key: string; type: string; page: number }>();

export function registerConfigEditor(
  bot: Bot,
  config: VexisConfig,
  configPath: string | null,
) {
  // /config — show config with edit buttons
  bot.command("config", async (ctx) => {
    const text = buildConfigText(config, configPath);
    await ctx.reply(text, { ...MD, reply_markup: buildConfigKeyboard() });
  });

  // cfg:set:<field> — prompt for new value
  bot.callbackQuery(/^cfg:set:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const field = ctx.match![1];
    const editable = EDITABLE_FIELDS.find((f) => f.key === field);
    if (!editable) {
      await ctx.answerCallbackQuery({ text: "Unknown field", show_alert: true });
      return;
    }
    const current = formatValue(field, config);
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);
    pendingEdits.set(chatId, { field: editable.label, key: editable.key, type: editable.type, page: pageForKey(editable.key) });

    const typeHint = editable.type === "number" ? " \\(number\\)" : editable.type === "boolean" ? " \\(on/off\\)" : "";
    await ctx.editMessageText(
      `${tgBold(`✏️ Edit ${editable.label}`)}\n\nCurrent: ${tgCode(current)}\n\nSend new value${typeHint}:`,
      MD,
    );
  });

  // cfg:page:<n> — switch keyboard page
  bot.callbackQuery(/^cfg:page:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const page = parseInt(ctx.match![1], 10);
    const text = buildConfigText(config, configPath);
    await ctx.editMessageText(text, { ...MD, reply_markup: buildConfigKeyboard(page) });
  });

  // cfg:toggle:<field> — toggle boolean
  bot.callbackQuery(/^cfg:toggle:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const field = ctx.match![1];
    const current = getNestedValue(config, field) ?? false;
    setNestedValue(config, field, !current);
    if (configPath) saveConfig(configPath, config);
    const text = buildConfigText(config, configPath);
    await ctx.editMessageText(text, { ...MD, reply_markup: buildConfigKeyboard(pageForKey(field)) });
  });

  // cfg:back — back to config view
  bot.callbackQuery("cfg:back", async (ctx) => {
    await ctx.answerCallbackQuery();
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);
    pendingEdits.delete(chatId);
    const text = buildConfigText(config, configPath);
    await ctx.editMessageText(text, { ...MD, reply_markup: buildConfigKeyboard(1) });
  });

  // Handle text replies for pending edits
  bot.on("message:text", async (ctx, next) => {
    const chatId = String(ctx.chat?.id);
    const pending = pendingEdits.get(chatId);
    if (!pending) return next();

    const raw = ctx.message.text.trim();
    pendingEdits.delete(chatId);

    if (raw === "/cancel" || raw === "/config") {
      const text = buildConfigText(config, configPath);
      await ctx.reply(text, { ...MD, reply_markup: buildConfigKeyboard(1) });
      return;
    }

    let value: any;
    if (pending.type === "boolean") {
      const lower = raw.toLowerCase();
      if (!["on", "off", "true", "false", "1", "0"].includes(lower)) {
        await ctx.reply("Send on/off\\.", MD);
        return;
      }
      value = ["on", "true", "1"].includes(lower);
    } else if (pending.type === "number") {
      value = Number(raw);
      if (!Number.isFinite(value)) {
        await ctx.reply("Send a valid number\\.", MD);
        return;
      }
    } else {
      value = raw;
    }

    // Handle "null" / "default" to reset
    if (raw.toLowerCase() === "null" || raw.toLowerCase() === "default" || raw === "") {
      value = null;
    }

    setNestedValue(config, pending.key, value);
    if (configPath) saveConfig(configPath, config);

    const text = buildConfigText(config, configPath);
    await ctx.reply(
      `${tgBold(`✅ ${pending.field} updated`)}\n\n${text}`,
      { ...MD, reply_markup: buildConfigKeyboard(pending.page) },
    );
  });
}
