import { PoolsPage } from "~/components/pools/pools-page";
import { fetchPoolsCritical, fetchPoolsDeferred } from "~/lib/server/pools.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/pools";

export const meta: Route.MetaFunction = () => [{ title: "Pools | Vexis" }];
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const critical = await fetchPoolsCritical(url.searchParams.get("timeframe"));
	if (!critical.ok) return critical;
	const deferred = fetchPoolsDeferred(critical.pools);
	return { critical, deferred };
}

export default PoolsPage;
