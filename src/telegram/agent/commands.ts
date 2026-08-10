import type { Api, Context } from "grammy";
import { type Bot, InlineKeyboard } from "grammy";
import { resolveAgentConfigFrom } from "../../services/Config.js";
import { registerAction, resolveAction } from "../action-store.js";
import { escapeMarkdown } from "../format.js";
import { api, getConfig, resolveWallet } from "../fx.js";
import { resolvePoolDetail } from "../pool-position-selector.js";
import { MD } from "../utils.js";
import type { RuntimeAgent } from "./engine.js";
import {
	formatJournalPage,
	formatPortfolio,
	formatPositionCard,
	formatStatus,
	type JournalFilter,
	journalPageCount,
	type PortfolioRow,
	type PositionPnl,
} from "./format.js";
import { readJournalAll } from "./journal.js";
import { loadSignalWeights } from "./signalWeights.js";
import { clearCooldowns } from "./state.js";
import { actionCounts, pnlPctValue, tradeStats } from "./stats.js";

export const PAGE_SIZE = 5;

// Telegram rejects editMessageText when content is unchanged. Ignore it.
export async function editOrIgnore(
	api: Api,
	chatId: string | number,
	messageId: number,
	text: string,
	keyboard: InlineKeyboard,
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

export async function replyOrIgnore(
	ctx: Context,
	text: string,
	keyboard?: InlineKeyboard,
): Promise<void> {
	try {
		await ctx.reply(text, {
			...MD,
			...(keyboard ? { reply_markup: keyboard } : {}),
		});
	} catch {
		// no-op — best effort
	}
}

export function planActionLabel(p: {
	poolName: string;
	amountSol: number;
	positionAddress: string | null;
}): string {
	// Keyboard-button label — buttons are plain text, Telegram doesn't parse
	// MarkdownV2 there, so escaping would show literal backslashes.
	return p.positionAddress
		? `${p.poolName} ${p.amountSol} SOL`
		: `${p.poolName} · ${p.amountSol} SOL (pending)`;
}

function statusKeyboard(rt: RuntimeAgent): InlineKeyboard {
	const kb = agentKeyboard(rt.state.enabled);
	for (const p of rt.state.plans) {
		if (p.positionAddress == null) continue;
		const id = registerAction(p.pool, p.positionAddress);
		kb.row().text(planActionLabel(p).slice(0, 32), `agent:pos:${id}`);
	}
	kb.row().text("🔄 Refresh", "agent:status");
	if (rt.state.cooldowns.some((c) => Date.parse(c.until) > Date.now())) {
		kb.text("🧹 Clear cooldowns", "agent:clear-cooldowns");
	}
	return kb;
}

function tradeStatsOf() {
	return tradeStats(loadSignalWeights().perf);
}

/** Live PnL per plan (by pool address). Skips plans with no open position or failed fetch. */
async function pnlByPool(rt: RuntimeAgent): Promise<Map<string, PositionPnl>> {
	const wallet = await resolveWallet();
	const map = new Map<string, PositionPnl>();
	for (const plan of rt.state.plans) {
		if (!plan.positionAddress) continue;
		try {
			const pdata = await api.positionPnl(plan.pool, wallet, "open");
			const pos = pdata.positions.find(
				(pp) => pp.positionAddress === plan.positionAddress,
			);
			if (!pos || pos.isClosed) continue;
			const pnlPct = pnlPctValue(pos);
			map.set(plan.pool, {
				pnlPct,
				outOfRange: pos.isOutOfRange ?? null,
			});
		} catch {
			// positionPnl failed for this pool → skip, PnL n/a
		}
	}
	return map;
}

async function portfolioRows(
	rt: RuntimeAgent,
): Promise<{ rows: PortfolioRow[]; deployedSol: number }> {
	const byPool = await pnlByPool(rt);
	const rows: PortfolioRow[] = [];
	let deployedSol = 0;
	for (const plan of rt.state.plans) {
		deployedSol += plan.amountSol ?? 0;
		const live = byPool.get(plan.pool);
		if (!live) continue;
		rows.push({
			poolName: plan.poolName,
			amountSol: plan.amountSol,
			pnlPct: live.pnlPct,
			outOfRange: live.outOfRange,
		});
	}
	return { rows, deployedSol };
}

export function journalKeyboard(
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
	kb.row().text("⬅️ Agent", "menu:agent");
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
			case "clear-cooldowns": {
				const n = rt.state.cooldowns.length;
				clearCooldowns(rt.state);
				await ctx.reply(
					n > 0
						? `🧹 Cleared ${escapeMarkdown(String(n))} cooldowns.`
						: "No cooldowns to clear.",
					MD,
				);
				break;
			}
			case "status": {
				const pnl = await pnlByPool(rt);
				await ctx.reply(formatStatus(rt.state, cfg, stats, pnl), {
					...MD,
					reply_markup: statusKeyboard(rt),
				});
				break;
			}
			case "portfolio": {
				const { rows, deployedSol } = await portfolioRows(rt);
				await ctx.reply(formatPortfolio(rows, deployedSol, stats), {
					...MD,
					reply_markup: portfolioKeyboard(rt.state.enabled),
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
				const pnl = await pnlByPool(rt);
				await ctx.reply(formatStatus(rt.state, cfg, stats, pnl), {
					...MD,
					reply_markup: statusKeyboard(rt),
				});
			}
		}
	});

	bot.command("briefing", async (ctx) => {
		await rt.runBriefing();
		await ctx.reply("📋 Briefing sent.", MD);
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
		const pnl = await pnlByPool(rt);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatStatus(rt.state, cfg, tradeStatsOf(), pnl),
			statusKeyboard(rt),
		);
	});

	bot.callbackQuery(/^agent:clear-cooldowns$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const n = rt.state.cooldowns.length;
		clearCooldowns(rt.state);
		const cfg = resolveAgentConfigFrom(await getConfig());
		const pnl = await pnlByPool(rt);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			`🧹 Cleared ${escapeMarkdown(String(n))} cooldowns.\n\n${formatStatus(rt.state, cfg, tradeStatsOf(), pnl)}`,
			statusKeyboard(rt),
		);
	});

	bot.callbackQuery(/^agent:(status|main)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const cfg = resolveAgentConfigFrom(await getConfig());
		const pnl = await pnlByPool(rt);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatStatus(rt.state, cfg, tradeStatsOf(), pnl),
			statusKeyboard(rt),
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
			portfolioKeyboard(rt.state.enabled),
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

	// ─── Position drill-down ─────────────────────────────────────────────────
	bot.callbackQuery(/^agent:pos:(.+)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const action = resolveAction(ctx.match[1]);
		if (!action) {
			await ctx.reply("⌛ Expired — refresh /agent.", MD);
			return;
		}
		await ctx.editMessageText("⏳ Loading position…", MD);
		try {
			const wallet = await resolveWallet();
			const detail = await resolvePoolDetail(action.poolAddress);
			const plan = rt.state.plans.find(
				(p) => p.positionAddress === action.positionPubkey,
			);
			const pdata = await api.positionPnl(action.poolAddress, wallet, "open");
			const pos = pdata.positions.find(
				(p) => p.positionAddress === action.positionPubkey,
			);
			if (!pos) throw new Error("position not found");
			const text = formatPositionCard({
				tokenX: detail?.tokenX ?? "?",
				tokenY: detail?.tokenY ?? "?",
				poolAddress: action.poolAddress,
				positionAddress: action.positionPubkey,
				amountSol: plan?.amountSol ?? null,
				pnlPct: pnlPctValue(pos),
				isOutOfRange: pos.isOutOfRange ?? null,
				price: pos.poolActivePrice != null ? Number(pos.poolActivePrice) : null,
				minPrice: pos.minPrice != null ? Number(pos.minPrice) : null,
				maxPrice: pos.maxPrice != null ? Number(pos.maxPrice) : null,
				feeSol: null,
			});
			const kb = new InlineKeyboard()
				.text("🔄", `agent:pos:${ctx.match[1]}`)
				.url(
					"🙂 View on Meteora",
					`https://app.meteora.ag/dlmm/${action.poolAddress}`,
				)
				.row()
				.text("⬅️ Agent", "menu:agent");
			await ctx.editMessageText(text, { ...MD, reply_markup: kb });
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, {
				...MD,
				reply_markup: new InlineKeyboard().text("⬅️ Agent", "menu:agent"),
			});
		}
	});

	// ─── Notification quick actions ──────────────────────────────────────────
	bot.callbackQuery(/^notif:pnl:(.+)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const action = resolveAction(ctx.match[1]);
		if (!action) {
			await ctx.reply("⌛ Expired.", MD);
			return;
		}
		await ctx.editMessageText("⏳ Loading…", MD);
		try {
			const wallet = await resolveWallet();
			const detail = await resolvePoolDetail(action.poolAddress);
			const plan = rt.state.plans.find(
				(p) => p.positionAddress === action.positionPubkey,
			);
			const pdata = await api.positionPnl(action.poolAddress, wallet, "open");
			const pos = pdata.positions.find(
				(p) => p.positionAddress === action.positionPubkey,
			);
			if (!pos) throw new Error("position not found");
			const text = formatPositionCard({
				tokenX: detail?.tokenX ?? "?",
				tokenY: detail?.tokenY ?? "?",
				poolAddress: action.poolAddress,
				positionAddress: action.positionPubkey,
				amountSol: plan?.amountSol ?? null,
				pnlPct: pnlPctValue(pos),
				isOutOfRange: pos.isOutOfRange ?? null,
				price: pos.poolActivePrice != null ? Number(pos.poolActivePrice) : null,
				minPrice: pos.minPrice != null ? Number(pos.minPrice) : null,
				maxPrice: pos.maxPrice != null ? Number(pos.maxPrice) : null,
				feeSol: null,
			});
			const kb = new InlineKeyboard()
				.text("🔄", `notif:pnl:${ctx.match[1]}`)
				.url(
					"🙂 View on Meteora",
					`https://app.meteora.ag/dlmm/${action.poolAddress}`,
				)
				.row()
				.text("⬅️ Dashboard", "menu:main");
			await ctx.editMessageText(text, { ...MD, reply_markup: kb });
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			await ctx.editMessageText(`✖ ${escapeMarkdown(msg)}`, {
				...MD,
				reply_markup: new InlineKeyboard().text("⬅️ Dashboard", "menu:main"),
			});
		}
	});

	bot.callbackQuery("notif:journal", async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const entries = readJournalAll();
		const totalPages = journalPageCount(entries.length, PAGE_SIZE);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatJournalPage(
				entries,
				{ page: 0, pageSize: PAGE_SIZE, filter: "all" },
				actionCounts(entries),
			),
			journalKeyboard(0, totalPages),
		);
	});

	bot.callbackQuery(/^notif:retry:(.+)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const pool = ctx.match[1];
		await rt.runFast();
		await ctx.reply(
			`⚠️ Retry triggered for ${escapeMarkdown(pool)} — TP/SL check re-run.`,
			MD,
		);
	});

	bot.callbackQuery("notif:clear", async (ctx) => {
		await ctx.answerCallbackQuery();
		rt.state.running = false;
		await ctx.editMessageText("🧼 Agent state cleared.", MD);
	});

	bot.callbackQuery("notif:ack", async (ctx) => {
		await ctx.answerCallbackQuery();
	});
}

export function agentKeyboard(enabled: boolean): InlineKeyboard {
	return new InlineKeyboard()
		.text(
			enabled ? "⏹ Stop" : "▶️ Start",
			enabled ? "agent:stop" : "agent:start",
		)
		.row()
		.text("📊 Portfolio", "agent:portfolio")
		.text("📒 Journal", "agent:journal");
}

function portfolioKeyboard(enabled: boolean): InlineKeyboard {
	return new InlineKeyboard()
		.text(
			enabled ? "⏹ Stop" : "▶️ Start",
			enabled ? "agent:stop" : "agent:start",
		)
		.row()
		.text("📒 Journal", "agent:journal")
		.text("🔄 Refresh", "agent:portfolio")
		.row()
		.text("⬅️ Agent", "menu:agent");
}

export function registerMenuSpokes(bot: Bot, rt: RuntimeAgent) {
	bot.callbackQuery("menu:agent", async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		const cfg = resolveAgentConfigFrom(await getConfig());
		const pnl = await pnlByPool(rt);
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatStatus(rt.state, cfg, tradeStatsOf(), pnl),
			statusKeyboard(rt),
		);
	});

	bot.callbackQuery("menu:journal", async (ctx) => {
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
