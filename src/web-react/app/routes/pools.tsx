import { PoolsPage } from "~/components/pools/pools-page";
import {
	fetchPoolsCritical,
	fetchPoolsDeferred,
} from "~/lib/server/pools.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/pools";

export const meta: Route.MetaFunction = () => [{ title: "Pools | Vexis" }];
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const timeframe = url.searchParams.get("timeframe");
	// Await only data needed for the first render; enrichment remains deferred.
	const critical = await fetchPoolsCritical(timeframe);
	const deferred = critical.ok
		? fetchPoolsDeferred(critical.pools)
		: Promise.resolve(
				[] as const as readonly import("@vexis/domain/index.js").ScreenedPool[],
			);
	return { critical, deferred };
}

export default PoolsPage;
