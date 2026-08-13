import {
	HttpMiddleware,
	HttpRouter,
	HttpServerRequest,
	HttpServerResponse,
} from "@effect/platform";
import { Effect, Schema } from "effect";
import { errorMessage } from "../errors.js";
import { AppLayer } from "../layers.js";
import { AppConfig } from "../services/Config.js";
import {
	expiredCookieHeader,
	passwordMatches,
	SESSION_COOKIE,
	sessionCookieHeader,
	verifySessionCookie,
} from "./auth.js";
import { resolveWebConfig } from "./config.js";
import {
	contentRegion,
	errorBanner,
	loginPage,
	pageShell,
	rpcHost,
} from "./layout.js";
import { createWebServerProgram } from "./lifecycle.js";
import { agentContent } from "./pages/agent.js";
import { poolsContent } from "./pages/pools.js";
import { closedPositionsContent, portfolioContent } from "./pages/portfolio.js";

function withCookie(
	response: HttpServerResponse.HttpServerResponse,
	cookie: string,
): HttpServerResponse.HttpServerResponse {
	return HttpServerResponse.setHeader(response, "set-cookie", cookie);
}

function requireAuth(password: string) {
	return HttpMiddleware.make((app) =>
		Effect.gen(function* () {
			const request = yield* HttpServerRequest.HttpServerRequest;
			const path = request.url.split("?", 1)[0];
			if (path === "/login" || path === "/logout" || path === "/health") {
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

interface ShellInfo {
	readonly rpc: string;
	readonly wallet: string;
}

function pageResponse(
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

function partialResponse(
	inner: string,
	refreshPath: string | null,
): HttpServerResponse.HttpServerResponse {
	return HttpServerResponse.html(
		contentRegion({ id: "page-content", inner, refreshPath }),
	);
}

export function buildRouter(password: string, shell: ShellInfo) {
	const loginHandler = Effect.gen(function* () {
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

	const poolsRoute = Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const url = new URL(request.url, "http://localhost");
		const rawLimit = url.searchParams.get("limit");
		const parsedLimit = rawLimit === null ? null : Number(rawLimit);
		const displayLimit =
			parsedLimit !== null &&
			Number.isSafeInteger(parsedLimit) &&
			parsedLimit > 0
				? parsedLimit
				: null;
		return yield* poolsContent({
			timeframe: url.searchParams.get("timeframe"),
			displayLimit,
		});
	});

	const portfolioPage = portfolioContent.pipe(
		Effect.map((inner) =>
			pageResponse(
				"Portfolio",
				"portfolio",
				inner,
				"/partials/portfolio",
				shell,
			),
		),
	);
	const portfolioPartial = portfolioContent.pipe(
		Effect.map((inner) => partialResponse(inner, "/partials/portfolio")),
	);
	const closedDetailRoute = Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const url = new URL(request.url, "http://localhost");
		const pool = url.searchParams.get("pool") ?? "";
		const pair = url.searchParams.get("pair") ?? "";
		const html = yield* closedPositionsContent(pool, pair).pipe(
			Effect.catchAll((error) =>
				Effect.succeed(errorBanner(errorMessage(error))),
			),
		);
		return HttpServerResponse.html(html);
	});
	const poolsPage = poolsRoute.pipe(
		Effect.map((inner) =>
			pageResponse("Pool Radar", "pools", inner, null, shell),
		),
	);
	const poolsPartial = poolsRoute.pipe(
		Effect.map((inner) => partialResponse(inner, null)),
	);
	const agentRoute = Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;
		const url = new URL(request.url, "http://localhost");
		const rawPage = url.searchParams.get("page");
		const parsedPage = rawPage === null ? 1 : Number(rawPage);
		const page =
			Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
		return yield* agentContent({
			action: url.searchParams.get("action"),
			page,
		});
	});
	const agentPage = agentRoute.pipe(
		Effect.map((inner) =>
			pageResponse("Agent Log", "agent", inner, "/partials/agent", shell),
		),
	);
	const agentPartial = agentRoute.pipe(
		Effect.map((inner) => partialResponse(inner, "/partials/agent")),
	);

	return HttpRouter.empty.pipe(
		HttpRouter.get(
			"/",
			Effect.succeed(HttpServerResponse.redirect("/portfolio")),
		),
		HttpRouter.get("/health", Effect.succeed(HttpServerResponse.text("ok"))),
		HttpRouter.get(
			"/login",
			Effect.succeed(HttpServerResponse.html(loginPage())),
		),
		HttpRouter.post("/login", loginHandler),
		HttpRouter.get(
			"/logout",
			Effect.succeed(
				withCookie(
					HttpServerResponse.redirect("/login"),
					expiredCookieHeader(),
				),
			),
		),
		HttpRouter.get("/portfolio", portfolioPage),
		HttpRouter.get("/partials/portfolio", portfolioPartial),
		HttpRouter.get("/partials/closed-positions", closedDetailRoute),
		HttpRouter.get("/pools", poolsPage),
		HttpRouter.get("/partials/pools", poolsPartial),
		HttpRouter.get("/agent", agentPage),
		HttpRouter.get("/partials/agent", agentPartial),
	);
}

export async function startWebServer(): Promise<void> {
	const program = Effect.gen(function* () {
		const config = yield* AppConfig;
		const current = yield* config.get;
		const web = resolveWebConfig(current);
		const shell: ShellInfo = {
			rpc: rpcHost(current.rpcUrl ?? "rpc not configured"),
			wallet: current.wallet ?? "no wallet configured",
		};

		if (!web.enabled) {
			console.log(
				"[web] disabled: set web.enabled=true in vexis.config.json to start the dashboard.",
			);
			return;
		}
		if (web.password.length === 0) {
			console.error(
				"[web] enabled but no password is configured. Set web.password or VEXIS_WEB_PASSWORD.",
			);
			process.exitCode = 1;
			return;
		}

		console.log(`[web] dashboard listening on http://127.0.0.1:${web.port}`);
		const router = buildRouter(web.password, shell);
		yield* createWebServerProgram(router, web.port, requireAuth(web.password));
	});

	await Effect.runPromise(program.pipe(Effect.provide(AppLayer)));
}
