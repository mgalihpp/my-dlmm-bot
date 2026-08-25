import {
	fetchPoolsCritical,
	fetchPoolsDeferred,
} from "~/lib/server/pools.server";
import { authMiddleware } from "~/middleware/auth";

export const middleware = [authMiddleware];

export async function loader({ request }: { request: Request }) {
	const url = new URL(request.url);
	const timeframe = url.searchParams.get("timeframe");
	const critical = await fetchPoolsCritical(timeframe);
	if (!critical.ok) {
		return Response.json({ ok: false, error: critical.error }, { status: 500 });
	}
	const enriched = await fetchPoolsDeferred(critical.pools);
	return Response.json({
		ok: true,
		pools: enriched,
		timeframe: critical.timeframe,
	});
}
