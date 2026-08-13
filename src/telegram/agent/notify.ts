import { type Bot, InlineKeyboard } from "grammy";
import { MD } from "../utils.js";

export type NotifKeyboardTag =
	| "open"
	| "tp"
	| "sl"
	| "close"
	| "failed"
	| "error";

export function notifyKeyboard(
	tag: NotifKeyboardTag,
	pool?: string,
): InlineKeyboard {
	const kb = new InlineKeyboard();
	if (pool != null) {
		if (tag === "open" || tag === "close") {
			kb.text("📊 PnL", `notif:pnl:${pool}`);
		}
		if (tag === "failed") {
			kb.text("⚠️ Retry", `notif:retry:${pool}`);
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
	msg: string,
	opts?: { keyboard?: InlineKeyboard },
): Promise<void> {
	try {
		await bot.api.sendMessage(chatId, msg, {
			...MD,
			...(opts?.keyboard ? { reply_markup: opts.keyboard } : {}),
		});
	} catch {
		// fire-and-forget — agent logic never depends on notification success
	}
}
