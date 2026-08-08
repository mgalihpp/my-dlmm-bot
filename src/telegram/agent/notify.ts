import type { Bot } from "grammy";
import type { NotifLevel } from "../../domain/config.js";
import { MD } from "../utils.js";

export type NotifTag = "live" | "action" | "summary" | "error";

const TAG_LEVELS: Record<NotifTag, readonly NotifLevel[]> = {
	live: ["verbose"],
	action: ["verbose", "normal", "errors-only"],
	summary: ["verbose", "normal"],
	error: ["verbose", "normal", "errors-only"],
};

export function allowed(cfgLevel: NotifLevel, tag: NotifTag): boolean {
	return TAG_LEVELS[tag].includes(cfgLevel);
}

export async function notify(
	bot: Bot,
	chatId: string,
	cfgLevel: NotifLevel,
	tag: NotifTag,
	msg: string,
): Promise<void> {
	if (!allowed(cfgLevel, tag)) return;
	try {
		await bot.api.sendMessage(chatId, msg, MD);
	} catch {
		// fire-and-forget — agent logic never depends on notification success
	}
}
