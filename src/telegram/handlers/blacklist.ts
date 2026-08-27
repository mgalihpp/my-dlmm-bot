import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import { escapeMarkdown, tgCode } from "../format.js";
import { blacklist } from "../fx.js";
import { setInputSession } from "../input-store.js";
import { MD, replyError } from "../utils.js";

const isMint = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

function tgBlacklistList(
	tokens: { mint: string; label?: string; addedAt: string }[],
): string {
	if (tokens.length === 0) {
		return "🚫 Blacklist is empty\\.\\nNo tokens are blocked\\.";
	}
	const lines = ["🚫 *Blacklisted Tokens*", ""];
	for (const t of tokens) {
		const label = t.label ? ` \\(${escapeMarkdown(t.label)}\\)` : "";
		lines.push(`• ${tgCode(t.mint)}${label}`);
	}
	lines.push(
		"",
		`${escapeMarkdown(String(tokens.length))} token\\(s\\) blocked`,
	);
	return lines.join("\n");
}

export function registerBlacklist(bot: Bot) {
	bot.command("blacklist", async (ctx) => {
		try {
			const tokens = await blacklist.list();
			await ctx.reply(tgBlacklistList(tokens), MD);
		} catch (e) {
			await replyError(ctx, e);
		}
	});

	bot.command("blacklistadd", async (ctx) => {
		try {
			const parts = (ctx.match as string).trim().split(/\s+/).filter(Boolean);
			const [mint, ...labelParts] = parts;
			if (mint) {
				if (!isMint(mint)) {
					await ctx.reply(
						"✖ Invalid mint\\. Send a valid Solana token mint address:",
						MD,
					);
					return;
				}
				const label = labelParts.length > 0 ? labelParts.join(" ") : undefined;
				const entry = await blacklist.add(mint, label);
				const desc = entry.label ? ` \\(${escapeMarkdown(entry.label)}\\)` : "";
				await ctx.reply(`✅ Blacklisted ${tgCode(entry.mint)}${desc}`, MD);
				return;
			}
			const chatId = String(ctx.chat?.id ?? ctx.from?.id);
			setInputSession(chatId, async (text, sessionCtx) => {
				if (!isMint(text)) {
					await sessionCtx.reply(
						"✖ Invalid mint\\. Send a valid Solana token mint:",
						MD,
					);
					return;
				}
				const kb = new InlineKeyboard()
					.text("✏️ Add Label", `bladd:label:${text}`)
					.text("⏭️ Skip", `bladd:confirm:${text}:`);
				await sessionCtx.reply(`✅ Mint: ${tgCode(text)}\n\nAdd a label?`, {
					...MD,
					reply_markup: kb,
				});
			});
			await ctx.reply("✏️ Send token mint to blacklist:", MD);
		} catch (e) {
			await replyError(ctx, e);
		}
	});

	bot.callbackQuery(/^bladd:label:(.+)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const mint = ctx.match?.[1];
		const chatId = String(ctx.chat?.id ?? ctx.from?.id);
		setInputSession(chatId, async (text, sessionCtx) => {
			const entry = await blacklist.add(mint, text);
			await sessionCtx.reply(
				`✅ Blacklisted ${tgCode(entry.mint)} \\(${escapeMarkdown(entry.label!)}\\)`,
				MD,
			);
		});
		await ctx.editMessageText("✏️ Send label for this token:", MD);
	});

	bot.callbackQuery(/^bladd:confirm:([^:]+):(.*)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const mint = ctx.match?.[1];
		const label = ctx.match?.[2] || undefined;
		const entry = await blacklist.add(mint, label);
		const desc = entry.label ? ` \\(${escapeMarkdown(entry.label)}\\)` : "";
		await ctx.editMessageText(
			`✅ Blacklisted ${tgCode(entry.mint)}${desc}`,
			MD,
		);
	});

	bot.command("blacklistremove", async (ctx) => {
		try {
			const mint = (ctx.match as string).trim().split(/\s+/)[0];
			if (mint) {
				if (await blacklist.remove(mint)) {
					await ctx.reply(`✅ Removed ${tgCode(mint)} from blacklist`, MD);
				} else {
					await ctx.reply("❌ Token not found in blacklist", MD);
				}
				return;
			}
			const tokens = await blacklist.list();
			if (tokens.length === 0) {
				await ctx.reply("📭 Blacklist is empty\\.", MD);
				return;
			}
			const kb = new InlineKeyboard();
			for (const t of tokens) {
				const label = t.label ? t.label : `${t.mint.slice(0, 8)}…`;
				kb.text(label.slice(0, 30), `blremove:confirm:${t.mint}`).row();
			}
			await ctx.reply("Select token to remove from blacklist:", {
				...MD,
				reply_markup: kb,
			});
		} catch (e) {
			await replyError(ctx, e);
		}
	});

	bot.callbackQuery(/^blremove:confirm:(.+)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const mint = ctx.match?.[1];
		if (await blacklist.remove(mint)) {
			await ctx.editMessageText(
				`✅ Removed ${tgCode(mint)} from blacklist`,
				MD,
			);
		} else {
			await ctx.editMessageText("❌ Token not found", MD);
		}
	});
}
