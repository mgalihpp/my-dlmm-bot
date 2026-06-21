// Telegram bot entry point. Run with: npm run bot
import { Bot } from "grammy";
import { MeteoraClient } from "../api.js";
import {
  loadConfig,
  resolveBotToken,
  resolveChatId,
} from "../config.js";
import { registerPortfolio } from "./handlers/portfolio.js";
import { registerPool } from "./handlers/pool.js";
import { registerOnchain } from "./handlers/onchain.js";
import { registerWatchlist } from "./handlers/watchlist.js";
import {
  createAlerts,
  registerAlertCommands,
} from "./alerts.js";
import { registerMenu } from "./menu.js";
import { escapeMarkdown, tgBold } from "./format.js";
import { MD } from "./utils.js";

const HELP = [
  tgBold("🤖 Vexis DLMM Bot"),
  "",
  tgBold("Read-only"),
  escapeMarkdown("/portfolio - total PnL summary"),
  escapeMarkdown("/open - open positions"),
  escapeMarkdown("/closed - closed positions"),
  escapeMarkdown("/pools - top pools by fee/TVL"),
  escapeMarkdown("/pool <address> - pool detail"),
  escapeMarkdown("/config - show active config"),
  "",
  tgBold("Watchlist"),
  escapeMarkdown("/watchadd <wallet> [label] - add wallet"),
  escapeMarkdown("/watchremove <wallet> - remove wallet"),
  escapeMarkdown("/watchlist - list watched wallets"),
  escapeMarkdown("/watchpositions - positions of all watched wallets"),
  escapeMarkdown("/wallets <w1> [w2]... - query any wallets"),
  "",
  tgBold("On-chain"),
  escapeMarkdown("/create <pool> <strategy> <xAmt> <yAmt> <minBin> <maxBin> [single|single-y]"),
  escapeMarkdown("/close <pool> <position> — close \\+ zap out to SOL"),
  escapeMarkdown("/addliq <pool> <position> <strategy> <xAmt> <yAmt>"),
  escapeMarkdown("/removeliq <pool> <position> <bps>"),
  escapeMarkdown("/claimfee <pool> <position>"),
  escapeMarkdown("/claimreward <pool> <position>"),
  "",
  tgBold("Alerts"),
  escapeMarkdown("/alerts - show active alerts"),
  escapeMarkdown("/setalert portfolio <hours>"),
  escapeMarkdown("/setalert position - track open positions every 15m"),
  escapeMarkdown("/stopalert portfolio | /stopalert position"),
].join("\n");

async function main() {
  const { config, path: configPath } = loadConfig();
  const token = resolveBotToken(config);
  const chatId = resolveChatId(config);

  const bot = new Bot(token);
  const client = new MeteoraClient({ dev: config.dev });

  // Security: if a chat ID is configured, ignore everyone else.
  if (chatId) {
    bot.use(async (ctx, next) => {
      const incoming = ctx.chat?.id ?? ctx.from?.id;
      if (String(incoming) !== String(chatId)) return; // silently drop
      await next();
    });
  }

  bot.command("start", (ctx) => ctx.reply(HELP, MD));
  bot.command("help", (ctx) => ctx.reply(HELP, MD));

  bot.command("config", (ctx) => {
    const masked = {
      wallet: config.wallet ?? "(none)",
      rpcUrl: config.rpcUrl ?? "(default mainnet)",
      dev: !!config.dev,
      privateKey: config.privateKey ? "****" : "(none)",
      telegramBotToken: "****",
      configPath: configPath ?? "(none)",
    };
    const lines = [tgBold("⚙️ Config"), ""];
    for (const [k, v] of Object.entries(masked)) {
      lines.push(`${escapeMarkdown(k)}: ${escapeMarkdown(String(v))}`);
    }
    return ctx.reply(lines.join("\n"), MD);
  });

  registerPortfolio(bot, client, config);
  registerPool(bot, client, config);
  registerOnchain(bot, config);
  registerWatchlist(bot, client);
  registerMenu(bot, client, config);

  // Alerts need a destination chat. Only enable if one is configured.
  if (chatId) {
    const rt = createAlerts(bot, client, config, chatId);
    registerAlertCommands(bot, client, config, chatId, rt);
  }

  bot.catch((err) => {
    console.error("Bot error:", err.error);
  });

  await bot.api.setMyCommands([
    { command: "start", description: "Start the bot" },
    { command: "menu", description: "Open interactive menu" },
    { command: "help", description: "Show all commands" },
    { command: "config", description: "Show current config" },
    { command: "portfolio", description: "Total PnL summary" },
    { command: "open", description: "Open positions" },
    { command: "closed", description: "Closed positions" },
    { command: "pools", description: "Top pools by fee/TVL" },
    { command: "pool", description: "Pool detail <address>" },
    { command: "create", description: "Create a DLMM position" },
    { command: "close", description: "Close a position" },
    { command: "addliq", description: "Add liquidity to position" },
    { command: "removeliq", description: "Remove liquidity from position" },
    { command: "claimfee", description: "Claim fees from position" },
    { command: "claimreward", description: "Claim rewards from position" },
    { command: "watchadd", description: "Add wallet to watchlist" },
    { command: "watchremove", description: "Remove wallet from watchlist" },
    { command: "watchlist", description: "List watched wallets" },
    { command: "watchpositions", description: "Positions of watched wallets" },
    { command: "wallets", description: "Query any wallets" },
    { command: "alerts", description: "Show active alerts" },
    { command: "setalert", description: "Set price/pool alert" },
    { command: "stopalert", description: "Stop an alert" },
  ]);

  console.log("Bot started" + (chatId ? ` (locked to chat ${chatId})` : " (open to all chats)"));
  await bot.start();
}

main().catch((e) => {
  console.error("Fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
