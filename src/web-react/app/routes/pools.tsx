import { PoolsPage } from "~/components/pools/pools-page";
import { RouteError } from "~/components/route-error";
import { fetchPoolsCritical } from "~/lib/server/pools.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/pools";

export function ErrorBoundary() {
	return <RouteError title="Failed to load pools" shellTitle="Pool Radar" />;
}

export const meta: Route.MetaFunction = () => [{ title: "Pools | Vexis" }];
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const timeframe = url.searchParams.get("timeframe");
	return fetchPoolsCritical(timeframe);
}

export default PoolsPage;
