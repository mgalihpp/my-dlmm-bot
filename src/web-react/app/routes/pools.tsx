import { PoolsPage } from "~/components/pools/pools-page";
import {
	fetchPoolsCritical,
	fetchPoolsDeferred,
} from "~/lib/server/pools.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/pools";

export const meta: Route.MetaFunction = () => [{ title: "Pools | Vexis" }];
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const timeframe = url.searchParams.get("timeframe");
	// Stream critical so client navigation commits instantly (like SSR onShellReady)
	// instead of blocking 1-1.5s on Meteora. Component Suspense shows PoolsPageSkeleton.
	const critical = fetchPoolsCritical(timeframe);
	const deferred = critical.then((c) => {
		if (!c.ok)
			return [] as const as readonly import("@vexis/domain/index.js").ScreenedPool[];
		return fetchPoolsDeferred(c.pools);
	});
	return { critical, deferred };
}

export default PoolsPage;
