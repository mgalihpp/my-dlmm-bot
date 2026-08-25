import type { Bot, Context } from "grammy";
import { getWalletConfigs, loadConfigSync } from "../../services/Config.js";
import { tgClosedPools, tgOpenPools, tgPortfolioSummary } from "../format.js";
import { api, dlmm, resolveWallet } from "../fx.js";
import { MD, replyError } from "../utils.js";

function resolveWalletArg(input?: string): string | null {
	if (!input) return null;
	try {
		const { config } = loadConfigSync();
		const wallets = getWalletConfigs(config);
		const lower = input.toLowerCase();
		const found = wallets.find(
			(w) =>
				w.wallet === input ||
				w.label === input ||
				w.wallet.toLowerCase() === lower ||
				w.label?.toLowerCase() === lower,
		);
		return found ? found.wallet : null;
	} catch {
		return null;
	}
}

export function registerPortfolio(bot: Bot) {
	bot.command("portfolio", async (ctx: Context) => {
		try {
			const raw = (ctx.match as string)?.trim();
			const walletOverride = resolveWalletArg(raw?.split(/\s+/)[0]);
			const wallet = walletOverride ?? (await resolveWallet());
			const total = await api.totalPnl(wallet);
			await ctx.reply(tgPortfolioSummary(total), MD);
		} catch (e) {
			await replyError(ctx, e);
		}
	});

	bot.command("open", async (ctx: Context) => {
		try {
			const raw = (ctx.match as string)?.trim();
			const walletOverride = resolveWalletArg(raw?.split(/\s+/)[0]);
			const wallet = walletOverride ?? (await resolveWallet());
			const res = await api.openPortfolio(wallet, 1, 10);
			const enriched = await api.enrichOpenPortfolioPnl(res.pools, wallet, {
				withRanges: true,
			});
			await dlmm.attachLivePositions(enriched, wallet);
			await ctx.reply(tgOpenPools(enriched), MD);
		} catch (e) {
			await replyError(ctx, e);
		}
	});

	bot.command("closed", async (ctx: Context) => {
		try {
			const raw = (ctx.match as string)?.trim();
			const walletOverride = resolveWalletArg(raw?.split(/\s+/)[0]);
			const wallet = walletOverride ?? (await resolveWallet());
			const res = await api.closedPortfolio(wallet, 1, 10);
			await ctx.reply(tgClosedPools(res.pools), MD);
		} catch (e) {
			await replyError(ctx, e);
		}
	});
}
