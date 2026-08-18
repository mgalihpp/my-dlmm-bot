import { realtimeHub } from "~/lib/server/event-hub";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/live";

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export function loader(_args: Route.LoaderArgs): Response {
	realtimeHub.start(10_000);
	let cleanup: (() => void) | null = null;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			cleanup = realtimeHub.add(controller);
			controller.enqueue(new TextEncoder().encode("data: connected\n\n"));
		},
		cancel() {
			cleanup?.();
		},
	});
	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			"X-Accel-Buffering": "no",
			Connection: "keep-alive",
		},
	});
}
