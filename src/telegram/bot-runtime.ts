import { Effect } from "effect";
import { Bot } from "grammy";
import { errorMessage } from "../errors.js";
import {
	AppConfig,
	agentEnabledTransition,
	resolveAgentConfigFrom,
} from "../services/Config.js";
import { registerAgentCommands, registerMenuSpokes } from "./agent/commands.js";
import { createAgent, type RuntimeAgent } from "./agent/engine.js";
import { createAlerts, registerAlertCommands } from "./alerts.js";
import { registerDashboard } from "./dashboard.js";
import { escapeMarkdown, tgBold } from "./format.js";
import { registerBalance } from "./handlers/balance.js";
import { registerBlacklist } from "./handlers/blacklist.js";
import { registerConfigEditor } from "./handlers/config-editor.js";
import { registerCreate } from "./handlers/create.js";
import { registerManage } from "./handlers/manage.js";
import { registerOnchain } from "./handlers/onchain.js";
import { registerPool } from "./handlers/pool.js";
import { registerPortfolio } from "./handlers/portfolio.js";
import { registerWatchlist } from "./handlers/watchlist.js";
import { takeInputSession } from "./input-store.js";
import { registerMenu } from "./menu.js";
import { runtime } from "./runtime.js";
import { agentTracks, createTpSl, registerTpSlCommands } from "./tpsl.js";
import { MD } from "./utils.js";

export interface BotRuntime {
	readonly bot: Bot;
	readonly agent: RuntimeAgent | null;
	stop(): Promise<void>;
}

export function createBotRuntime(
	bot: Bot,
	agent: RuntimeAgent | null,
): BotRuntime {
	let stopped = false;
	return {
		bot,
		agent,
		async stop() {
			if (stopped) return;
			stopped = true;
			agent?.stop();
			await bot.stop();
		},
	};
}

const HELP = [
	tgBold("🤖 Vexis DLMM Bot"),
	"",
	tgBold("Read-only"),
	escapeMarkdown("/dashboard - open the hub"),
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
	escapeMarkdown("/tpsl - global TP/SL thresholds"),
	"",
	tgBold("Agent"),
	escapeMarkdown("/agent - DLMM agent (start/stop/status/portfolio/journal)"),
	escapeMarkdown("/briefing - send the daily briefing"),
].join("\n");

export async function startBot(): Promise<BotRuntime | null> {
	const token = await runtime.runPromise(
		Effect.flatMap(AppConfig, (c) => c.botToken),
	);
	const chatId = await runtime.runPromise(
		Effect.flatMap(AppConfig, (c) => c.chatId),
	);

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

	let rtAgent: RuntimeAgent | null = null;
	registerPortfolio(bot);
	registerPool(bot);
	registerCreate(bot);
	registerOnchain(bot, () => rtAgent);
	registerManage(bot, () => rtAgent);
	registerWatchlist(bot);
	registerBlacklist(bot);
	registerBalance(bot);
	registerMenu(bot);

	// Alerts need a destination chat. Only enable if one is configured.
	if (chatId) {
		const rt = createAlerts(bot, chatId);
		registerAlertCommands(bot, chatId, rt);
		registerTpSlCommands(bot);

		rtAgent = createAgent(bot, chatId);
		// The global TP/SL watcher must skip positions the agent manages, or
		// both fire on the same thresholds → double notifications and a stale
		// manual close button.
		createTpSl(bot, chatId, (poolAddress, positionAddress) =>
			agentTracks(rtAgent!.state.plans, poolAddress, positionAddress),
		);
		registerDashboard(bot, rtAgent); // live header
		registerMenuSpokes(bot, rtAgent);
		registerAgentCommands(bot, rtAgent);
		const agentCfg = resolveAgentConfigFrom(
			await runtime.runPromise(Effect.flatMap(AppConfig, (c) => c.get)),
		);
		if (agentCfg.enabled) rtAgent.start();
	} else {
		registerDashboard(bot, null); // idle header fallback
	}

	registerConfigEditor(bot);

	runtime.runPromise(
		Effect.flatMap(AppConfig, (c) =>
			c.onChange((prev, next) => {
				const action = agentEnabledTransition(prev, next);
				if (action === "start") rtAgent?.start();
				else if (action === "stop") rtAgent?.stop();
			}),
		),
	);

	bot.catch((err) => {
		console.error("Bot error:", err.error);
	});

	await bot.api.setMyCommands([
		{ command: "start", description: "Show the dashboard" },
		{ command: "dashboard", description: "Open the hub menu" },
		{ command: "help", description: "Show all commands" },
		// Read-only
		{ command: "balance", description: "SOL & token balances" },
		{ command: "portfolio", description: "Total PnL summary" },
		{ command: "open", description: "Open positions" },
		{ command: "closed", description: "Closed positions" },
		{ command: "pools", description: "Top pools by fee/TVL" },
		{ command: "pool", description: "Pool detail (<address> optional)" },
		{ command: "config", description: "View & edit config" },
		// Watchlist
		{ command: "watchadd", description: "Add wallet to watchlist" },
		{ command: "watchremove", description: "Remove wallet from watchlist" },
		{ command: "watchlist", description: "List watched wallets" },
		{ command: "watchpositions", description: "Positions of watched wallets" },
		{ command: "wallets", description: "Query any wallets" },
		{ command: "blacklist", description: "List blacklisted tokens" },
		{ command: "blacklistadd", description: "Blacklist a token mint" },
		{ command: "blacklistremove", description: "Remove token from blacklist" },
		// On-chain
		{ command: "manage", description: "Position manager" },
		{
			command: "create",
			description: "Create a DLMM position (guided wizard)",
		},
		{ command: "close", description: "Close position & zap out" },
		{ command: "addliq", description: "Add liquidity" },
		{ command: "removeliq", description: "Remove liquidity" },
		{ command: "claimfee", description: "Claim fees" },
		{ command: "claimreward", description: "Claim rewards" },
		// Alerts
		{ command: "setalert", description: "Enable alerts" },
		{ command: "stopalert", description: "Disable alerts" },
		{ command: "alerts", description: "Show active alerts" },
		{ command: "tpsl", description: "Global TP/SL thresholds" },
		// Agent
		{
			command: "agent",
			description: "DLMM Agent (start/stop/status/portfolio/journal)",
		},
		{ command: "briefing", description: "Send the daily briefing" },
	]);

	console.log(
		"Bot started" +
			(chatId ? ` (locked to chat ${chatId})` : " (open to all chats)"),
	);
	void bot.start().catch((e) => {
		console.error("Bot polling error:", errorMessage(e));
	});
	return createBotRuntime(bot, rtAgent);
}

// The CLI wrapper is kept in bot.ts so importing this module never starts
// Telegram polling as a side effect.
