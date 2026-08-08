import type { Api } from "grammy";
import { type Bot, InlineKeyboard } from "grammy";
import { resolveAgentConfigFrom } from "../../services/Config.js";
import { api, getConfig, resolveWallet } from "../fx.js";
import { MD } from "../utils.js";
import type { RuntimeAgent } from "./engine.js";
import {
	formatJournalPage,
	formatPortfolio,
	formatStatus,
	type JournalFilter,
	journalPageCount,
	type PortfolioRow,
} from "./format.js";
import { readJournalAll } from "./journal.js";
import { loadSignalWeights } from "./signalWeights.js";
import { actionCounts, tradeStats } from "./stats.js";

const PAGE_SIZE = 5;

// Telegram rejects editMessageText when content is unchanged. Ignore it.
async function editOrIgnore(
	api: Api,
	chatId: string | number,
	messageId: number,
	text: string,
	keyboard: InlineKeyboard = agentKeyboard(),
): Promise<void> {
	try {
		await api.editMessageText(chatId, messageId, text, {
			...MD,
			reply_markup: keyboard,
		});
	} catch (e) {
		const desc = e instanceof Error ? e.message : String(e);
		if (!desc.includes("not modified")) throw e;
	}
}

function tradeStatsOf() {
	return tradeStats(loadSignalWeights().perf);
}

async function portfolioRows(
	rt: RuntimeAgent,
): Promise<{ rows: PortfolioRow[]; deployedSol: number }> {
	const wallet = await resolveWallet();
	const rows: PortfolioRow[] = [];
	let deployedSol = 0;
	for (const plan of rt.state.plans) {
		deployedSol += plan.amountSol ?? 0;
		if (!plan.positionAddress) continue;
		try {
			const pdata = await api.positionPnl(plan.pool, wallet, "open");
			const pos = pdata.positions.find(
				(pp) => pp.positionAddress === plan.positionAddress,
			);
			if (!pos || pos.isClosed) continue;
			const solRaw =
				pos.pnlSolPctChange != null ? Number(pos.pnlSolPctChange) : Number.NaN;
			const pnlPct = Number.isFinite(solRaw)
				? solRaw
				: parseFloat(pos.pnlPctChange);
			rows.push({
				poolName: plan.poolName,
				amountSol: plan.amountSol,
				pnlPct: Number.isFinite(pnlPct) ? pnlPct : null,
				outOfRange: pos.isOutOfRange ?? null,
			});
		} catch {
			// positionPnl failed for this pool → skip, PnL n/a
		}
	}
	return { rows, deployedSol };
}

function journalKeyboard(
	page: number,
	totalPages: number,
	filter: JournalFilter = "all",
): InlineKeyboard {
	const kb = new InlineKeyboard();
	if (page > 0) kb.text("⬅️", `agent:journal:page:${page - 1}`);
	if (page < totalPages - 1) kb.text("➡️", `agent:journal:page:${page + 1}`);
	kb.row();
	for (const f of ["all", "opens", "closes", "blocked"] as const) {
		kb.text(f === filter ? `• ${f}` : f, `agent:journal:filter:${f}`);
	}
	return kb;
}

export function registerAgentCommands(bot: Bot, rt: RuntimeAgent) {
	bot.command("agent", async (ctx) => {
		const [cmd, arg] = (ctx.match as string).trim().split(/\s+/);
		const cfg = resolveAgentConfigFrom(await getConfig());
		const stats = tradeStatsOf();
		switch (cmd) {
			case "start": {
				rt.start();
				await ctx.reply("🤖 DLMM Agent started.", MD);
				break;
			}
			case "stop": {
				rt.stop();
				await ctx.reply("🛑 DLMM Agent stopped.", MD);
				break;
			}
			case "status": {
				await ctx.reply(formatStatus(rt.state, cfg, stats), {
					...MD,
					reply_markup: agentKeyboard(),
				});
				break;
			}
			case "portfolio": {
				const { rows, deployedSol } = await portfolioRows(rt);
				await ctx.reply(formatPortfolio(rows, deployedSol, stats), {
					...MD,
					reply_markup: agentKeyboard(),
				});
				break;
			}
			case "journal": {
				const entries = readJournalAll();
				const counts = actionCounts(entries);
				const n = Math.min(parseInt(arg || "5", 10) || 5, 20);
				const text = formatJournalPage(
					entries,
					{ page: 0, pageSize: n, filter: "all" },
					counts,
				);
				const totalPages = journalPageCount(entries.length, n);
				await ctx.reply(text, {
					...MD,
					reply_markup: journalKeyboard(0, totalPages),
				});
				break;
			}
			default: {
				await ctx.reply(formatStatus(rt.state, cfg, stats), {
					...MD,
					reply_markup: agentKeyboard(),
				});
			}
		}
	});

	// ─── Interactive menu ────────────────────────────────────────────────────
	bot.callbackQuery(/^agent:(start|stop)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		if (ctx.match[1] === "start") rt.start();
		else rt.stop();
		const cfg = resolveAgentConfigFrom(await getConfig());
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatStatus(rt.state, cfg, tradeStatsOf()),
		);
	});

	bot.callbackQuery(/^agent:(status|main)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const cfg = resolveAgentConfigFrom(await getConfig());
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatStatus(rt.state, cfg, tradeStatsOf()),
		);
	});

	bot.callbackQuery(/^agent:portfolio$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const { rows, deployedSol } = await portfolioRows(rt);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatPortfolio(rows, deployedSol, tradeStatsOf()),
		);
	});

	bot.callbackQuery(/^agent:journal:page:(-?\d+)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const entries = readJournalAll();
		const totalPages = journalPageCount(entries.length, PAGE_SIZE);
		const page = Math.min(
			Math.max(0, parseInt(ctx.match[1], 10) || 0),
			totalPages - 1,
		);
		const text = formatJournalPage(
			entries,
			{ page, pageSize: PAGE_SIZE, filter: "all" },
			actionCounts(entries),
		);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			text,
			journalKeyboard(page, totalPages),
		);
	});

	bot.callbackQuery(
		/^agent:journal:filter:(all|opens|closes|blocked)$/,
		async (ctx) => {
			await ctx.answerCallbackQuery();
			const chatId = ctx.chat?.id;
			const messageId = ctx.msgId;
			if (chatId == null || messageId == null) return;
			const entries = readJournalAll();
			const filter = ctx.match[1] as JournalFilter;
			const text = formatJournalPage(
				entries,
				{ page: 0, pageSize: PAGE_SIZE, filter },
				actionCounts(entries),
			);
			await editOrIgnore(
				ctx.api,
				chatId,
				messageId,
				text,
				journalKeyboard(0, journalPageCount(entries.length, PAGE_SIZE), filter),
			);
		},
	);

	bot.callbackQuery(/^agent:journal$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const entries = readJournalAll();
		const totalPages = journalPageCount(entries.length, PAGE_SIZE);
		const text = formatJournalPage(
			entries,
			{ page: 0, pageSize: PAGE_SIZE, filter: "all" },
			actionCounts(entries),
		);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			text,
			journalKeyboard(0, totalPages),
		);
	});
}

function agentKeyboard(): InlineKeyboard {
	return new InlineKeyboard()
		.text("▶️ Start", "agent:start")
		.text("⏹ Stop", "agent:stop")
		.text("📊 Status", "agent:status")
		.row()
		.text("📊 Portfolio", "agent:portfolio")
		.text("📒 Journal", "agent:journal");
}
