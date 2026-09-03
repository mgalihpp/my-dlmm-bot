import { describe, expect, it } from "vitest";
import {
	passwordMatches,
	sessionCookieHeader,
	verifySessionCookie,
} from "./auth.js";

describe("passwordMatches", () => {
	it("accepts the right password", () => {
		expect(passwordMatches("s3cret!", "s3cret!")).toBe(true);
	});
	it("rejects wrong passwords of any length", () => {
		expect(passwordMatches("wrong", "s3cret!")).toBe(false);
		expect(passwordMatches("", "s3cret!")).toBe(false);
		expect(passwordMatches("a-very-long-wrong-password", "short")).toBe(false);
	});
});

describe("session cookie", () => {
	it("signs and verifies a round trip", () => {
		const header = sessionCookieHeader("pw");
		const value = header.split(";")[0].split("=")[1];
		expect(verifySessionCookie(value, "pw")).toBe(true);
		expect(verifySessionCookie(value, "other")).toBe(false);
	});
	it("rejects expired and tampered cookies", () => {
		const header = sessionCookieHeader("pw");
		const value = header.split(";")[0].split("=")[1];
		expect(verifySessionCookie(value, "pw", Date.now() + 25 * 3_600_000)).toBe(
			false,
		);
		const dot = value.lastIndexOf(".");
		const flipped =
			value.slice(0, dot + 1) +
			(value[dot + 1] === "a" ? "b" : "a") +
			value.slice(dot + 2);
		expect(verifySessionCookie(flipped, "pw")).toBe(false);
	});
	it("sets Secure on the cookie", () => {
		expect(sessionCookieHeader("pw")).toContain("; Secure;");
	});
});
