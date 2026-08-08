import { describe, expect, it } from "vitest";
import { delayToNextBoundary } from "../src/telegram/agent/schedule.js";

describe("delayToNextBoundary", () => {
	it("returns full interval just past a boundary", () => {
		expect(delayToNextBoundary(5_000, 5_001)).toBe(4_999);
	});

	it("returns 0 exactly on a boundary", () => {
		expect(delayToNextBoundary(5_000, 5_000)).toBe(0);
		expect(delayToNextBoundary(5_000, 10_000)).toBe(0);
	});

	it("5-minute interval lands on :00/:05/:10 (whole minutes)", () => {
		const now = Date.UTC(2026, 7, 9, 0, 2, 37, 123);
		const next = now + delayToNextBoundary(300_000, now);
		expect(next % 300_000).toBe(0);
		expect(next % 60_000).toBe(0);
	});

	it("15-minute interval lands on :00/:15/:30/:45", () => {
		const now = Date.UTC(2026, 7, 9, 0, 7, 41, 500);
		const next = now + delayToNextBoundary(900_000, now);
		expect(next % 900_000).toBe(0);
		expect(next % 60_000).toBe(0);
	});

	it("60s interval lands on whole minutes", () => {
		const now = Date.UTC(2026, 7, 9, 0, 0, 42, 999);
		const next = now + delayToNextBoundary(60_000, now);
		expect(next % 60_000).toBe(0);
	});
});
