import { HttpRouter, HttpServerResponse } from "@effect/platform";
import { Effect } from "effect";
import { AppLayer } from "../layers.js";
import { AppConfig } from "../services/Config.js";
import { resolveWebConfig } from "./config.js";
import { rpcHost } from "./layout.js";
import { createWebServerProgram } from "./lifecycle.js";
import { agentRoutes } from "./routes/agent.js";
import { authRoutes } from "./routes/auth.js";
import { poolsRoutes } from "./routes/pools.js";
import { portfolioRoutes } from "./routes/portfolio.js";
import { requireAuth, type ShellInfo } from "./routes/shared.js";

export function buildRouter(password: string, shell: ShellInfo) {
	const auth = authRoutes(password);
	const portfolio = portfolioRoutes(shell);
	const pools = poolsRoutes(shell);
	const agent = agentRoutes(shell);

	return HttpRouter.empty.pipe(
		HttpRouter.get(
			"/",
			Effect.succeed(HttpServerResponse.redirect("/portfolio")),
		),
		HttpRouter.get("/health", Effect.succeed(HttpServerResponse.text("ok"))),
		HttpRouter.get("/login", auth.loginPage),
		HttpRouter.post("/login", auth.loginSubmit),
		HttpRouter.get("/logout", auth.logout),
		HttpRouter.get("/portfolio", portfolio.page),
		HttpRouter.get("/partials/portfolio", portfolio.partial),
		HttpRouter.get("/partials/closed-positions", portfolio.closedDetail),
		HttpRouter.get("/pools", pools.page),
		HttpRouter.get("/partials/pools", pools.partial),
		HttpRouter.get("/agent", agent.page),
		HttpRouter.get("/partials/agent", agent.partial),
		HttpRouter.get("/partials/agent/narrative", agent.narrative),
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
