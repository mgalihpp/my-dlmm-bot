// Telegram bot entry point. Run with: npm run bot
import { Bot } from "grammy";
import { Effect } from "effect";
import { AppConfig } from "../services/Config.js";
import { registerPortfolio } from "./handlers/portfolio.js";
import { registerPool } from "./handlers/pool.js";
import { registerOnchain } from "./handlers/onchain.js";
import { registerManage } from "./handlers/manage.js";
import { registerCreate } from "./handlers/create.js";
import { registerWatchlist } from "./handlers/watchlist.js";
import { registerConfigEditor } from "./handlers/config-editor.js";
import { registerBalance } from "./handlers/balance.js";
import { createAlerts, registerAlertCommands } from "./alerts.js";
import { createTpSl, registerTpSlCommands } from "./tpsl.js";
import { registerMenu } from "./menu.js";
import { takeInputSession } from "./input-store.js";
import { escapeMarkdown, tgBold } from "./format.js";
import { MD } from "./utils.js";
import { runtime } from "./runtime.js";
import { errorMessage } from "../errors.js";

const HELP = [
  tgBold("🤖 Vexis DLMM Bot"),
  "",
  tgBold("Read-only"),
  escapeMarkdown("/balance - SOL & token balances"),
  escapeMarkdown("/portfolio - total PnL summary"),
  escapeMarkdown("/open - open positions"),
  escapeMarkdown("/closed - closed positions"),
  escapeMarkdown("/pools - top pools by fee/TVL"),
  escapeMarkdown("/pool <address> or /pool - pool detail"),
  escapeMarkdown("/config - view & edit config"),
  "",
  tgBold("Watchlist"),
  escapeMarkdown("/watchadd - add wallet"),
  escapeMarkdown("/watchremove - remove wallet"),
  escapeMarkdown("/watchlist - list watched wallets"),
  escapeMarkdown("/watchpositions - positions of all watched wallets"),
  escapeMarkdown("/wallets - query any wallets"),
  "",
  tgBold("On-chain"),
  escapeMarkdown("/manage - interactive position manager"),
  escapeMarkdown("/create - guided position creation wizard"),
  escapeMarkdown("/close - close & zap out"),
  escapeMarkdown("/addliq - add liquidity"),
  escapeMarkdown("/removeliq - remove liquidity"),
  escapeMarkdown("/claimfee - claim fees"),
  escapeMarkdown("/claimreward - claim rewards"),
  "",
  tgBold("Alerts"),
  escapeMarkdown("/setalert - enable alerts"),
  escapeMarkdown("/stopalert - disable alerts"),
  escapeMarkdown("/alerts - show active alerts"),
].join("\n");

async function main() {
  const token = await runtime.runPromise(Effect.flatMap(AppConfig, (c) => c.botToken));
  const chatId = await runtime.runPromise(Effect.flatMap(AppConfig, (c) => c.chatId));

  const bot = new Bot(token);

  // Security: if a chat ID is configured, ignore everyone else.
  if (chatId) {
    bot.use(async (ctx, next) => {
      const incoming = ctx.chat?.id ?? ctx.from?.id;
      if (String(incoming) !== String(chatId)) return;
      await next();
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Input store handler — MUST be first to catch text input for interactive
  // flows before other text handlers.
  // ══════════════════════════════════════════════════════════════════════════
  bot.on("message:text", async (ctx, next) => {
    const chatIdStr = String(ctx.chat?.id ?? ctx.from?.id);
    const session = takeInputSession(chatIdStr);
    if (session) {
      await session.handler(ctx.message.text.trim(), ctx);
      return; // consumed
    }
    await next(); // pass through
  });

  bot.command("start", (ctx) => ctx.reply(HELP, MD));
  bot.command("help", (ctx) => ctx.reply(HELP, MD));

  registerConfigEditor(bot);
  registerPortfolio(bot);
  registerPool(bot);
  registerCreate(bot);
  registerOnchain(bot);
  registerManage(bot);
  registerWatchlist(bot);
  registerBalance(bot);
  registerMenu(bot);

  // Alerts need a destination chat. Only enable if one is configured.
  if (chatId) {
    const rt = createAlerts(bot, chatId);
    registerAlertCommands(bot, chatId, rt);
    createTpSl(bot, chatId);
    registerTpSlCommands(bot);
  }

  bot.catch((err) => {
    console.error("Bot error:", err.error);
  });

  await bot.api.setMyCommands([
    { command: "start", description: "Start the bot / show all commands" },
    { command: "menu", description: "Open menu" },
    { command: "manage", description: "Position manager" },
    { command: "tpsl", description: "Show global stop-loss / take-profit thresholds" },
    { command: "create", description: "Create a DLMM position (guided wizard)" },
    { command: "balance", description: "SOL & token balances" },
    { command: "portfolio", description: "Total PnL summary" },
    { command: "open", description: "Open positions" },
    { command: "pools", description: "Top pools by fee/TVL" },
    { command: "help", description: "Show all commands" },
  ]);

  console.log("Bot started" + (chatId ? ` (locked to chat ${chatId})` : " (open to all chats)"));
  await bot.start();
}

main().catch((e) => {
  console.error("Fatal:", errorMessage(e));
  process.exit(1);
});
