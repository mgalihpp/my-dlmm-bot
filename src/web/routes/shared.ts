import {
	HttpMiddleware,
	HttpServerRequest,
	HttpServerResponse,
} from "@effect/platform";
import { Effect } from "effect";
import { SESSION_COOKIE, verifySessionCookie } from "../auth.js";
import { contentRegion, pageShell } from "../layout.js";

export interface ShellInfo {
	readonly rpc: string;
	readonly wallet: string;
}

export function withCookie(
	response: HttpServerResponse.HttpServerResponse,
	cookie: string,
): HttpServerResponse.HttpServerResponse {
	return HttpServerResponse.setHeader(response, "set-cookie", cookie);
}

export function isPublicPath(path: string): boolean {
	return (
		path === "/login" ||
		path === "/logout" ||
		path === "/health" ||
		path === "/images/logo.png"
	);
}

export function requireAuth(password: string) {
	return HttpMiddleware.make((app) =>
		Effect.gen(function* () {
			const request = yield* HttpServerRequest.HttpServerRequest;
			const path = request.url.split("?", 1)[0];
			if (isPublicPath(path)) {
				return yield* app;
			}

			const session = request.cookies[SESSION_COOKIE];
			if (session !== undefined && verifySessionCookie(session, password)) {
				return yield* app;
			}
			return HttpServerResponse.redirect("/login");
		}),
	);
}

export function pageResponse(
	title: string,
	active: "portfolio" | "pools" | "agent",
	inner: string,
	refreshPath: string | null,
	shell: ShellInfo,
): HttpServerResponse.HttpServerResponse {
	return HttpServerResponse.html(
		pageShell({
			title,
			active,
			body: contentRegion({
				id: "page-content",
				inner,
				refreshPath,
			}),
			rpc: shell.rpc,
			wallet: shell.wallet,
		}),
	);
}

export function partialResponse(
	inner: string,
	refreshPath: string | null,
): HttpServerResponse.HttpServerResponse {
	return HttpServerResponse.html(
		contentRegion({ id: "page-content", inner, refreshPath }),
	);
}
