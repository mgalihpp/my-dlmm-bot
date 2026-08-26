import { AppLayer } from "@vexis/layers.js";
import { Screening } from "@vexis/services/Screening.js";
import { Effect } from "effect";
import {
	fetchPoolsCritical,
	fetchPoolsDeferred,
} from "~/lib/server/pools.server";
import { authMiddleware } from "~/middleware/auth";

export const middleware = [authMiddleware];

export async function loader({ request }: { request: Request }) {
	const url = new URL(request.url);
	const timeframe = url.searchParams.get("timeframe");
	const wantsStream =
		request.headers.get("accept")?.includes("x-ndjson") ||
		request.headers.get("accept")?.includes("text/event-stream") ||
		url.searchParams.get("stream") !== "0";

	const critical = await fetchPoolsCritical(timeframe);
	if (!critical.ok) {
		return Response.json({ ok: false, error: critical.error }, { status: 500 });
	}

	if (!wantsStream) {
		const enriched = await fetchPoolsDeferred(critical.pools);
		return Response.json({
			ok: true,
			pools: enriched,
			timeframe: critical.timeframe,
		});
	}

	const pools = critical.pools.map((p) => ({ ...p }));
	const encoder = new TextEncoder();

	const screening = await Effect.runPromise(
		Effect.gen(function* () {
			return yield* Screening;
		}).pipe(Effect.provide(AppLayer)),
	);

	const stream = new ReadableStream({
		async start(controller) {
			try {
				for (let i = 0; i < pools.length; i++) {
					const pool = pools[i] as Record<string, unknown>;
					await Effect.runPromise(
						screening
							.enrichPools([pool as never])
							.pipe(Effect.provide(AppLayer)),
					);
					controller.enqueue(encoder.encode(`${JSON.stringify(pool)}\n`));
					if (i < pools.length - 1) {
						await new Promise<void>((r) => setTimeout(r, 650));
					}
				}
				controller.close();
			} catch (e) {
				try {
					controller.enqueue(
						encoder.encode(`${JSON.stringify({ _error: String(e) })}\n`),
					);
				} catch {}
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "application/x-ndjson; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		},
	});
}
