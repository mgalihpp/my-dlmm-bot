import { describe, expect, it } from "vitest";
import { canAutoRefresh } from "./use-auto-refresh";

describe("canAutoRefresh", () => {
	it("allows refresh only while the page is visible and idle", () => {
		expect(canAutoRefresh("idle", "visible")).toBe(true);
	});

	it("blocks refresh while navigation or revalidation is active", () => {
		expect(canAutoRefresh("loading", "visible")).toBe(false);
		expect(canAutoRefresh("revalidating", "visible")).toBe(false);
	});

	it("blocks refresh when the document is hidden", () => {
		expect(canAutoRefresh("idle", "hidden")).toBe(false);
	});
});
