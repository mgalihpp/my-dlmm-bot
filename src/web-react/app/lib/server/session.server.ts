import {
	expiredCookieHeader,
	SESSION_COOKIE,
	sessionCookieHeader,
	verifySessionCookie,
} from "@vexis/web/auth.js";

export function readSessionCookie(request: Request): string | null {
	const header = request.headers.get("cookie");
	if (!header) return null;
	for (const part of header.split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name === SESSION_COOKIE) return rest.join("=");
	}
	return null;
}

export function hasValidSession(request: Request, password: string): boolean {
	const cookie = readSessionCookie(request);
	return cookie !== null && verifySessionCookie(cookie, password);
}

export { expiredCookieHeader, SESSION_COOKIE, sessionCookieHeader };
