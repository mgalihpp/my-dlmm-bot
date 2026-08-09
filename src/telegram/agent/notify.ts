import { type Bot, InlineKeyboard } from "grammy";
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

export type NotifKeyboardTag =
	| "open"
	| "tp"
	| "sl"
	| "close"
	| "failed"
	| "error";

export function notifyKeyboard(
	tag: NotifKeyboardTag,
	actionId?: string,
): InlineKeyboard {
	const kb = new InlineKeyboard();
	if (actionId != null) {
		if (tag === "open" || tag === "close") {
			kb.text("📊 PnL", `notif:pnl:${actionId}`);
		}
		if (tag === "failed") {
			kb.text("⚠️ Retry", `notif:retry:${actionId}`);
		}
	}
	if (tag === "open" || tag === "tp" || tag === "sl" || tag === "close") {
		kb.text("📒 Journal", "notif:journal");
	}
	if (tag === "error") {
		kb.text("🧼 Clear", "notif:clear");
	}
	if (kb.inline_keyboard.length === 0) {
		kb.text("✓ Ok", "notif:ack");
	}
	return kb;
}

export async function notify(
	bot: Bot,
	chatId: string,
	cfgLevel: NotifLevel,
	tag: NotifTag,
	msg: string,
	opts?: { keyboard?: InlineKeyboard },
): Promise<void> {
	if (!allowed(cfgLevel, tag)) return;
	try {
		await bot.api.sendMessage(chatId, msg, {
			...MD,
			...(opts?.keyboard ? { reply_markup: opts.keyboard } : {}),
		});
	} catch {
		// fire-and-forget — agent logic never depends on notification success
	}
}
