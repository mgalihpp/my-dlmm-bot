import { PoolsPage } from "~/components/pools/pools-page";
import { fetchPools } from "~/lib/server/pools.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/pools";

export const meta: Route.MetaFunction = () => [{ title: "Pools | Vexis" }];
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	return fetchPools(url.searchParams.get("timeframe"));
}

export default PoolsPage;
