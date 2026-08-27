import type { Bot, Context } from "grammy";
import { InlineKeyboard, InputFile } from "grammy";
import { tgClosedPools, tgOpenPools, tgPortfolioSummary } from "../format.js";
import { api, dlmm, resolveWallet } from "../fx.js";
import { buildTotalPnlCardData, renderPnlCardPng } from "../pnl-card.js";
import { MD, replyError } from "../utils.js";

function pnlCardKeyboard(): InlineKeyboard {
	return new InlineKeyboard().text("PnL Card", "pnl_card_total");
}

async function sendPnlCard(ctx: Context): Promise<void> {
	const wallet = await resolveWallet();
	const total = await api.totalPnl(wallet);
	let closedPools: readonly import("../../domain/portfolio.js").ClosedPool[] =
		[];
	try {
		const closed = await api.closedPortfolio(wallet, 1, 20);
		closedPools = closed.pools;
	} catch {}
	const data = buildTotalPnlCardData(wallet, total, closedPools);
	try {
		const png = await renderPnlCardPng(data);
		await ctx.replyWithPhoto(new InputFile(png, "pnl-card.png"), {
			caption: `${data.title}: ${data.pnlUsd} (${data.pnlPct ?? "n/a"})`,
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await ctx.reply(
			`PnL Card render unavailable: ${msg}\n\n${data.title}: ${data.pnlUsd} (${data.pnlPct ?? "n/a"})`,
		);
	}
}

export function registerPortfolio(bot: Bot) {
	bot.command("portfolio", async (ctx: Context) => {
		try {
			const wallet = await resolveWallet();
			const total = await api.totalPnl(wallet);
			await ctx.reply(tgPortfolioSummary(total), {
				...MD,
				reply_markup: pnlCardKeyboard(),
			});
		} catch (e) {
			await replyError(ctx, e);
		}
	});

	bot.command("open", async (ctx: Context) => {
		try {
			const wallet = await resolveWallet();
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
			const wallet = await resolveWallet();
			const res = await api.closedPortfolio(wallet, 1, 10);
			await ctx.reply(tgClosedPools(res.pools), {
				...MD,
				reply_markup: pnlCardKeyboard(),
			});
		} catch (e) {
			await replyError(ctx, e);
		}
	});

	bot.command("pnlcard", async (ctx: Context) => {
		try {
			await sendPnlCard(ctx);
		} catch (e) {
			await replyError(ctx, e);
		}
	});

	bot.callbackQuery("pnl_card_total", async (ctx: Context) => {
		try {
			await ctx.answerCallbackQuery();
			await sendPnlCard(ctx);
		} catch (e) {
			await replyError(ctx, e);
		}
	});
}
