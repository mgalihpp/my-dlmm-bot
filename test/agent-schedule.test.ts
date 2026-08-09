import { describe, expect, it } from "vitest";
import {
	delayToDaily,
	delayToNextBoundary,
} from "../src/telegram/agent/schedule.js";

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

describe("delayToDaily", () => {
	it("returns ms until 09:00 today when now is before 09:00", () => {
		const now = new Date(2026, 7, 9, 7, 0, 0).getTime();
		const target = now + delayToDaily(9, now);
		const d = new Date(target);
		expect(d.getDate()).toBe(9);
		expect(d.getHours()).toBe(9);
		expect(d.getMinutes()).toBe(0);
		expect(d.getSeconds()).toBe(0);
	});

	it("returns 24h when now is exactly 09:00", () => {
		const now = new Date(2026, 7, 9, 9, 0, 0).getTime();
		expect(delayToDaily(9, now)).toBe(24 * 3_600_000);
	});

	it("returns ms until 09:00 tomorrow when now is after 09:00", () => {
		const now = new Date(2026, 7, 9, 23, 30, 0).getTime();
		const target = now + delayToDaily(9, now);
		const d = new Date(target);
		expect(d.getDate()).toBe(10);
		expect(d.getHours()).toBe(9);
		expect(d.getMinutes()).toBe(0);
	});

	it("wraps across month boundary", () => {
		const now = new Date(2026, 7, 31, 23, 30, 0).getTime();
		const target = now + delayToDaily(9, now);
		expect(new Date(target).getDate()).toBe(1);
		expect(new Date(target).getMonth()).toBe(8); // September
		expect(new Date(target).getHours()).toBe(9);
	});
});
