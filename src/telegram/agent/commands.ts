import type { Api } from "grammy";
import { type Bot, InlineKeyboard } from "grammy";
import { resolveAgentConfigFrom } from "../../services/Config.js";
import { getConfig } from "../fx.js";
import { MD } from "../utils.js";
import type { RuntimeAgent } from "./engine.js";
import { formatJournal, formatStatus } from "./format.js";
import { readJournal } from "./journal.js";

// Telegram rejects editMessageText when content is unchanged. Ignore it.
async function editOrIgnore(
	api: Api,
	chatId: string | number,
	messageId: number,
	text: string,
): Promise<void> {
	try {
		await api.editMessageText(chatId, messageId, text, {
			...MD,
			reply_markup: agentKeyboard(),
		});
	} catch (e) {
		const desc = e instanceof Error ? e.message : String(e);
		if (!desc.includes("not modified")) throw e;
	}
}

export function registerAgentCommands(bot: Bot, rt: RuntimeAgent) {
	bot.command("agent", async (ctx) => {
		const [cmd, arg] = (ctx.match as string).trim().split(/\s+/);
		switch (cmd) {
			case "start": {
				rt.start();
				await ctx.reply("🤖 Agent started.", MD);
				break;
			}
			case "stop": {
				rt.stop();
				await ctx.reply("🛑 Agent stopped.", MD);
				break;
			}
			case "status": {
				await ctx.reply(
					formatStatus(rt.state, resolveAgentConfigFrom(await getConfig())),
					{ ...MD, reply_markup: agentKeyboard() },
				);
				break;
			}
			case "journal": {
				const n = Math.min(parseInt(arg || "5", 10) || 5, 20);
				await ctx.reply(formatJournal(readJournal(n), n), {
					...MD,
					reply_markup: agentKeyboard(),
				});
				break;
			}
			default: {
				await ctx.reply(
					formatStatus(rt.state, resolveAgentConfigFrom(await getConfig())),
					{ ...MD, reply_markup: agentKeyboard() },
				);
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
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatStatus(rt.state, resolveAgentConfigFrom(await getConfig())),
		);
	});

	bot.callbackQuery(/^agent:(status|main)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatStatus(rt.state, resolveAgentConfigFrom(await getConfig())),
		);
	});

	bot.callbackQuery(/^agent:journal$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const chatId = ctx.chat?.id;
		const messageId = ctx.msgId;
		if (chatId == null || messageId == null) return;
		await editOrIgnore(
			ctx.api,
			chatId,
			messageId,
			formatJournal(readJournal(5), 5),
		);
	});
}

function agentKeyboard(): InlineKeyboard {
	return new InlineKeyboard()
		.text("▶️ Start", "agent:start")
		.text("⏹ Stop", "agent:stop")
		.text("📊 Status", "agent:status")
		.row()
		.text("📒 Journal", "agent:journal");
}
