import { type Bot, InlineKeyboard } from "grammy";
import { resolveAgentConfigFrom } from "../services/Config.js";
import type { RuntimeAgent } from "./agent/engine.js";
import { formatConfigQuick, formatDashboardHeader } from "./agent/format.js";
import { loadSignalWeights } from "./agent/signalWeights.js";
import { tradeStats } from "./agent/stats.js";
import { tgBold } from "./format.js";
import { getConfigSync } from "./fx.js";
import { MD } from "./utils.js";

export interface HubRow {
	label: string;
	callback: string;
}

/** Spoke grid — callbacks reuse the existing `menu:*` handlers where possible. */
export const HUB_ROWS: readonly HubRow[] = [
	{ label: "🤖 Agent", callback: "menu:agent" },
	{ label: "📊 Portfolio", callback: "menu:portfolio" },
	{ label: "📈 Open", callback: "menu:open" },
	{ label: "📉 Closed", callback: "menu:closed" },
	{ label: "📒 Journal", callback: "menu:journal" },
	{ label: "🔥 Pools", callback: "menu:pools" },
	{ label: "👁️ Watch", callback: "menu:watchlist" },
	{ label: "🔔 Alerts", callback: "menu:alerts" },
	{ label: "⚙️ Config", callback: "menu:config" },
	{ label: "📋 Commands", callback: "menu:commands" },
] as const;

export function dashboardKeyboard(): InlineKeyboard {
	const kb = new InlineKeyboard();
	for (let i = 0; i < HUB_ROWS.length; i += 2) {
		kb.text(HUB_ROWS[i].label, HUB_ROWS[i].callback);
		if (HUB_ROWS[i + 1])
			kb.text(HUB_ROWS[i + 1].label, HUB_ROWS[i + 1].callback);
		kb.row();
	}
	kb.text("🔄 Refresh", "menu:main");
	return kb;
}

export function dashboardText(rt: RuntimeAgent | null): string {
	if (!rt) {
		return [
			tgBold("🤖 Vexis Hub"),
			"",
			"Agent idle — pick a panel below\\.",
		].join("\n");
	}
	const cfg = resolveAgentConfigFrom(getConfigSync());
	const deployed = rt.state.plans.reduce((s, p) => s + (p.amountSol ?? 0), 0);
	return formatDashboardHeader(
		rt.state,
		cfg,
		deployed,
		tradeStats(loadSignalWeights().perf),
	);
}

export function registerDashboard(bot: Bot, rt: RuntimeAgent | null) {
	bot.command("dashboard", async (ctx) => {
		await ctx.reply(dashboardText(rt), {
			...MD,
			reply_markup: dashboardKeyboard(),
		});
	});

	bot.callbackQuery("menu:main", async (ctx) => {
		await ctx.answerCallbackQuery();
		await ctx.editMessageText(dashboardText(rt), {
			...MD,
			reply_markup: dashboardKeyboard(),
		});
	});

	bot.callbackQuery("menu:config", async (ctx) => {
		await ctx.answerCallbackQuery();
		const cfg = resolveAgentConfigFrom(getConfigSync());
		await ctx.editMessageText(formatConfigQuick(cfg), {
			...MD,
			reply_markup: new InlineKeyboard().text("⬅️ Back", "menu:main"),
		});
	});
}
