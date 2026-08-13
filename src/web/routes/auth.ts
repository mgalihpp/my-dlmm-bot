import { HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { Effect, Schema } from "effect";
import {
	expiredCookieHeader,
	passwordMatches,
	sessionCookieHeader,
} from "../auth.js";
import { loginPage } from "../layout.js";
import { withCookie } from "./shared.js";

export function authRoutes(password: string) {
	const loginSubmit = Effect.gen(function* () {
		const form = yield* HttpServerRequest.schemaBodyUrlParams(
			Schema.Record({
				key: Schema.String,
				value: Schema.Union(Schema.String, Schema.Array(Schema.String)),
			}),
		).pipe(
			Effect.catchAll(() =>
				Effect.succeed({} as Record<string, string | string[]>),
			),
		);
		const submitted = form.password;
		if (
			typeof submitted !== "string" ||
			!passwordMatches(submitted, password)
		) {
			return HttpServerResponse.html(loginPage({ error: "Wrong password" }));
		}
		return withCookie(
			HttpServerResponse.redirect("/"),
			sessionCookieHeader(password),
		);
	});

	return {
		loginPage: Effect.succeed(HttpServerResponse.html(loginPage())),
		loginSubmit,
		logout: Effect.succeed(
			withCookie(HttpServerResponse.redirect("/login"), expiredCookieHeader()),
		),
	};
}
