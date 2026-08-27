import { describe, expect, it } from "vitest";
import { resolveAgentConfigFrom } from "../src/services/Config.js";
import {
	checkSession,
	findBlockingSession,
	isInSessionWindow,
	parseTimeToMinutes,
} from "../src/telegram/agent/session.js";

function utcMs(h: number, m: number): number {
	return Date.UTC(2026, 0, 1, h, m, 0, 0);
}

describe("parseTimeToMinutes", () => {
	it("parses valid", () => {
		expect(parseTimeToMinutes("00:00")).toBe(0);
		expect(parseTimeToMinutes("12:00")).toBe(720);
		expect(parseTimeToMinutes("23:59")).toBe(1439);
	});
	it("rejects invalid", () => {
		expect(parseTimeToMinutes("24:00")).toBeNull();
		expect(parseTimeToMinutes("12:60")).toBeNull();
		expect(parseTimeToMinutes("1:00")).toBeNull();
		expect(parseTimeToMinutes("12-00")).toBeNull();
		expect(parseTimeToMinutes("")).toBeNull();
	});
});

describe("isInSessionWindow", () => {
	it("simple window includes start, excludes end", () => {
		const w = { name: "x", start: "12:00", end: "13:00" };
		expect(isInSessionWindow(720, w)).toBe(true);
		expect(isInSessionWindow(779, w)).toBe(true);
		expect(isInSessionWindow(780, w)).toBe(false);
		expect(isInSessionWindow(719, w)).toBe(false);
	});
	it("wrap midnight", () => {
		const w = { name: "Asia", start: "22:00", end: "02:00" };
		expect(isInSessionWindow(23 * 60, w)).toBe(true);
		expect(isInSessionWindow(60, w)).toBe(true);
		expect(isInSessionWindow(119, w)).toBe(true);
		expect(isInSessionWindow(120, w)).toBe(false);
		expect(isInSessionWindow(21 * 60, w)).toBe(false);
		expect(isInSessionWindow(3 * 60, w)).toBe(false);
	});
	it("invalid window never blocks", () => {
		const w = { name: "bad", start: "xx", end: "13:00" };
		expect(isInSessionWindow(720, w)).toBe(false);
	});
	it("zero-length window never blocks", () => {
		const w = { name: "zero", start: "12:00", end: "12:00" };
		expect(isInSessionWindow(720, w)).toBe(false);
	});
});

describe("findBlockingSession / checkSession", () => {
	it("UTC: 12:30 inside 12:00-13:00", () => {
		const cfg = {
			timezone: "UTC" as const,
			windows: [{ name: "NY lunch", start: "12:00", end: "13:00" }],
		};
		expect(findBlockingSession(utcMs(12, 30), cfg)?.name).toBe("NY lunch");
		expect(checkSession(utcMs(12, 30), cfg).ok).toBe(false);
		expect(checkSession(utcMs(13, 1), cfg).ok).toBe(true);
	});
	it("WIB: window 12:00-13:00 WIB blocks at 05:30 UTC (12:30 WIB)", () => {
		const cfg = {
			timezone: "WIB" as const,
			windows: [{ name: "NY lunch", start: "12:00", end: "13:00" }],
		};
		expect(checkSession(utcMs(5, 30), cfg).ok).toBe(false);
		expect(checkSession(utcMs(6, 1), cfg).ok).toBe(true);
		expect(checkSession(utcMs(12, 30), cfg).ok).toBe(true);
	});
	it("wrap midnight UTC", () => {
		const cfg = {
			timezone: "UTC" as const,
			windows: [{ name: "Asia", start: "22:00", end: "02:00" }],
		};
		expect(checkSession(utcMs(23, 0), cfg).ok).toBe(false);
		expect(checkSession(utcMs(1, 0), cfg).ok).toBe(false);
		expect(checkSession(utcMs(3, 0), cfg).ok).toBe(true);
	});
	it("reason format", () => {
		const cfg = {
			timezone: "WIB" as const,
			windows: [{ name: "NY lunch", start: "12:00", end: "13:00" }],
		};
		const r = checkSession(utcMs(5, 30), cfg);
		expect(r.reason).toBe(
			'blocked: inside session "NY lunch" (12:00-13:00 WIB)',
		);
	});
	it("empty windows never blocks", () => {
		expect(
			checkSession(utcMs(12, 30), { timezone: "UTC", windows: [] }).ok,
		).toBe(true);
	});
});

describe("resolveAgentConfigFrom blockedSessions defaults", () => {
	it("defaults to UTC empty", () => {
		const c = resolveAgentConfigFrom({}, {});
		expect(c.blockedSessions.timezone).toBe("UTC");
		expect(c.blockedSessions.windows).toEqual([]);
	});
	it("normalizes WIB and keeps windows", () => {
		const c = resolveAgentConfigFrom(
			{
				agent: {
					blockedSessions: {
						timezone: "WIB",
						windows: [{ name: "a", start: "12:00", end: "13:00" }],
					},
				},
			},
			{},
		);
		expect(c.blockedSessions.timezone).toBe("WIB");
		expect(c.blockedSessions.windows.length).toBe(1);
	});
	it("invalid timezone falls back to UTC", () => {
		const c = resolveAgentConfigFrom(
			{ agent: { blockedSessions: { timezone: "JST" as never } } },
			{},
		);
		expect(c.blockedSessions.timezone).toBe("UTC");
	});
});
