import { describe, expect, it } from "vitest";
import { journalKeyboard } from "../src/telegram/agent/commands.js";

function callbacksOf(kb: ReturnType<typeof journalKeyboard>): string[] {
	return kb.inline_keyboard
		.flat()
		.map((b) => ("callback_data" in b ? b.callback_data : undefined))
		.filter((c): c is string => c != null);
}

describe("journalKeyboard", () => {
	it("encodes the active filter into page buttons", () => {
		const kb = journalKeyboard(1, 3, "closes");
		const callbacks = callbacksOf(kb);
		expect(callbacks).toContain("agent:journal:page:0:closes");
		expect(callbacks).toContain("agent:journal:page:2:closes");
	});

	it("defaults to all filter", () => {
		const kb = journalKeyboard(0, 2);
		const callbacks = callbacksOf(kb);
		expect(callbacks).toContain("agent:journal:page:1:all");
	});
});
