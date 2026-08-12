import { createServer } from "node:http";
import {
	type HttpMiddleware,
	type HttpRouter,
	HttpServer,
} from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { Effect } from "effect";

export function createWebServerProgram<E, R>(
	router: HttpRouter.HttpRouter<E, R>,
	port: number,
	middleware?: HttpMiddleware.HttpMiddleware,
): Effect.Effect<never, unknown, R> {
	const served =
		middleware === undefined
			? HttpServer.serveEffect(router)
			: HttpServer.serveEffect(router, middleware);
	return Effect.scoped(
		Effect.provide(
			served.pipe(Effect.flatMap(() => Effect.never)),
			NodeHttpServer.layer(() => createServer(), { port, host: "127.0.0.1" }),
		),
	) as Effect.Effect<never, unknown, R>;
}
