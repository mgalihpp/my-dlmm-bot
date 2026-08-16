import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "vexis_session";
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function hmac(password: string, payload: string): Buffer {
	return createHmac("sha256", password).update(payload).digest();
}

export function passwordMatches(input: string, expected: string): boolean {
	const inputBytes = Buffer.from(input, "utf8");
	const expectedBytes = Buffer.from(expected, "utf8");
	if (inputBytes.length !== expectedBytes.length) return false;
	return timingSafeEqual(inputBytes, expectedBytes);
}

export function signSessionCookie(password: string, now = Date.now()): string {
	const payload = Buffer.from(
		JSON.stringify({ exp: now + SESSION_TTL_MS }),
		"utf8",
	).toString("base64url");
	return `${payload}.${hmac(password, payload).toString("hex")}`;
}

export function verifySessionCookie(
	cookieValue: string,
	password: string,
	now = Date.now(),
): boolean {
	const dot = cookieValue.lastIndexOf(".");
	if (dot <= 0) return false;

	const payload = cookieValue.slice(0, dot);
	const given = Buffer.from(cookieValue.slice(dot + 1), "hex");
	const expected = hmac(password, payload);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
		return false;
	}

	try {
		const parsed = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf8"),
		) as { exp?: unknown };
		return typeof parsed.exp === "number" && parsed.exp > now;
	} catch {
		return false;
	}
}

export function sessionCookieHeader(password: string): string {
	return `${SESSION_COOKIE}=${signSessionCookie(password)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

export function expiredCookieHeader(): string {
	return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
