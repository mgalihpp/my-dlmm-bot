import { describe, expect, it } from "vitest";
import { dashboardKeyboard, HUB_ROWS } from "../src/telegram/dashboard.js";

describe("dashboard hub", () => {
	it("exposes the full spoke grid with menu:* callbacks", () => {
		const cbs = HUB_ROWS.map((r) => r.callback);
		expect(cbs).toContain("menu:portfolio");
		expect(cbs).toContain("menu:agent");
		expect(cbs).toContain("menu:journal");
		expect(cbs).toContain("menu:config");
		expect(HUB_ROWS.length).toBeGreaterThanOrEqual(8);
	});
	it("builds a 2-column keyboard with a refresh row", () => {
		const kb = dashboardKeyboard();
		const flat = kb.inline_keyboard
			.flat()
			.filter((b) => "callback_data" in b)
			.map((b) => b.callback_data);
		expect(flat).toContain("menu:main");
		expect(kb.inline_keyboard.length).toBeGreaterThanOrEqual(6);
	});
});
