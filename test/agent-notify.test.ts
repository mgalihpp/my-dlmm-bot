import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import {
	allowed,
	notify,
	notifyKeyboard,
} from "../src/telegram/agent/notify.js";

const stubBot = (
	sendMessage: (
		chatId: string,
		msg: string,
		opts?: Record<string, unknown>,
	) => Promise<unknown>,
) => ({ api: { sendMessage } }) as unknown as Bot;

describe("allowed", () => {
	it.each([
		["verbose", "live", true],
		["verbose", "action", true],
		["verbose", "summary", true],
		["verbose", "error", true],
		["normal", "live", false],
		["normal", "action", true],
		["normal", "summary", true],
		["normal", "error", true],
		["errors-only", "live", false],
		["errors-only", "action", true],
		["errors-only", "summary", false],
		["errors-only", "error", true],
	] as const)("allowed(%s, %s) = %s", (level, tag, expected) => {
		expect(allowed(level, tag)).toBe(expected);
	});
});

describe("notify", () => {
	it("sends when allowed, passes MD parse mode", async () => {
		const send = vi.fn().mockResolvedValue({});
		const bot = stubBot(send);
		await notify(bot, "c1", "normal", "action", "msg");
		expect(send).toHaveBeenCalledWith("c1", "msg", {
			parse_mode: "MarkdownV2",
			link_preview_options: { is_disabled: true },
		});
	});

	it("skips silently when gated out", async () => {
		const send = vi.fn().mockResolvedValue({});
		const bot = stubBot(send);
		await notify(bot, "c1", "normal", "live", "msg");
		expect(send).not.toHaveBeenCalled();
	});

	it("swallows Telegram errors", async () => {
		const send = vi.fn().mockRejectedValue(new Error("telegram down"));
		const bot = stubBot(send);
		await expect(
			notify(bot, "c1", "normal", "action", "msg"),
		).resolves.toBeUndefined();
	});
});

describe("notifyKeyboard", () => {
	it("open → PnL + Journal", () => {
		const kb = notifyKeyboard("open", "a1");
		const labels = kb.inline_keyboard.flat().map((b) => b.text);
		expect(labels).toContain("📊 PnL");
		expect(labels).toContain("📒 Journal");
	});
	it("failed → Retry", () => {
		const kb = notifyKeyboard("failed", "pooladdr");
		const labels = kb.inline_keyboard.flat().map((b) => b.text);
		expect(labels).toContain("⚠️ Retry");
	});
	it("sl → Journal only", () => {
		const kb = notifyKeyboard("sl");
		const labels = kb.inline_keyboard.flat().map((b) => b.text);
		expect(labels).toContain("📒 Journal");
		expect(labels).not.toContain("📊 PnL");
	});
	it("error → Clear", () => {
		const kb = notifyKeyboard("error");
		const labels = kb.inline_keyboard.flat().map((b) => b.text);
		expect(labels).toContain("🧼 Clear");
	});
});
