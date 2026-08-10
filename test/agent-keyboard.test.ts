import type { InlineKeyboard } from "grammy";
import { describe, expect, it } from "vitest";
import { agentKeyboard } from "../src/telegram/agent/commands.js";

function buttons(kb: InlineKeyboard): string[] {
	return kb.inline_keyboard.flat().map((b) => b.text ?? "");
}

describe("agentKeyboard", () => {
	it("shows Stop and hides Start when enabled", () => {
		const texts = buttons(agentKeyboard(true));
		expect(texts).toContain("⏹ Stop");
		expect(texts).not.toContain("▶️ Start");
	});

	it("shows Start and hides Stop when disabled", () => {
		const texts = buttons(agentKeyboard(false));
		expect(texts).toContain("▶️ Start");
		expect(texts).not.toContain("⏹ Stop");
	});
});
