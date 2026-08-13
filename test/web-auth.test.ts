import { describe, expect, it } from "vitest";
import {
	expiredCookieHeader,
	passwordMatches,
	sessionCookieHeader,
	signSessionCookie,
	verifySessionCookie,
} from "../src/web/auth.js";

describe("passwordMatches", () => {
	it("matches exact password", () => {
		expect(passwordMatches("secret", "secret")).toBe(true);
	});

	it("rejects wrong case and empty", () => {
		expect(passwordMatches("secret", "Secret")).toBe(false);
		expect(passwordMatches("", "secret")).toBe(false);
	});
});

describe("session cookie", () => {
	const NOW = 1_752_000_000_000;

	it("sign/verify roundtrip", () => {
		const cookie = signSessionCookie("pw", NOW);
		expect(verifySessionCookie(cookie, "pw", NOW)).toBe(true);
	});

	it("rejects cookie signed with a different password", () => {
		const cookie = signSessionCookie("pw", NOW);
		expect(verifySessionCookie(cookie, "other", NOW)).toBe(false);
	});

	it("rejects tampered signature", () => {
		const cookie = signSessionCookie("pw", NOW);
		const flip = cookie.endsWith("0") ? "1" : "0";
		const tampered = `${cookie.slice(0, -1)}${flip}`;
		expect(verifySessionCookie(tampered, "pw", NOW)).toBe(false);
	});

	it("rejects expired cookie", () => {
		const cookie = signSessionCookie("pw", NOW - 25 * 3_600_000);
		expect(verifySessionCookie(cookie, "pw", NOW)).toBe(false);
	});

	it("rejects garbage", () => {
		expect(verifySessionCookie("not-a-cookie", "pw", NOW)).toBe(false);
		expect(verifySessionCookie("a.b", "pw", NOW)).toBe(false);
	});
});

describe("cookie headers", () => {
	it("session header includes attributes", () => {
		const header = sessionCookieHeader("pw");
		expect(header.startsWith("vexis_session=")).toBe(true);
		expect(header).toContain("HttpOnly");
		expect(header).toContain("SameSite=Lax");
		expect(header).toContain("Max-Age=86400");
		expect(header).toContain("Path=/");
	});

	it("expired header has Max-Age=0", () => {
		expect(expiredCookieHeader()).toContain("Max-Age=0");
	});
});
