import { describe, expect, it } from "vitest";
import {
	getDefaultViewMode,
	readViewPreference,
	writeViewPreference,
} from "../src/web-react/app/lib/view-preference.js";

describe("view preference", () => {
	it("reads and writes valid values", () => {
		const storage = new Map<string, string>();
		const adapter = {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
		} as Storage;

		expect(readViewPreference(adapter, "view", "table")).toBe("table");
		writeViewPreference(adapter, "view", "card");
		expect(readViewPreference(adapter, "view", "table")).toBe("card");
	});

	it("falls back for invalid values", () => {
		const adapter = {
			getItem: () => "other",
		} as Storage;

		expect(readViewPreference(adapter, "view", "table")).toBe("table");
	});

	it("defaults to cards below the desktop breakpoint", () => {
		expect(getDefaultViewMode(767)).toBe("card");
		expect(getDefaultViewMode(768)).toBe("table");
	});
});
