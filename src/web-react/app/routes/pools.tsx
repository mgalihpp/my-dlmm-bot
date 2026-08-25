import { PoolsPage } from "~/components/pools/pools-page";
import { fetchPools } from "~/lib/server/pools.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/pools";

export const meta: Route.MetaFunction = () => [{ title: "Pools | Vexis" }];
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const timeframe = url.searchParams.get("timeframe");
	return fetchPools(timeframe);
}

export default PoolsPage;
