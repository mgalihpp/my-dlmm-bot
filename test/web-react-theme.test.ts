import { describe, expect, it } from "vitest";
import { resolveTheme } from "../src/web-react/app/hooks/use-theme.js";

describe("resolveTheme", () => {
	it("prefers the saved theme over the system preference", () => {
		expect(resolveTheme("dark", false)).toBe("dark");
		expect(resolveTheme("light", true)).toBe("light");
	});

	it("uses the system preference when no theme is saved", () => {
		expect(resolveTheme(null, true)).toBe("dark");
		expect(resolveTheme(null, false)).toBe("light");
	});
});
