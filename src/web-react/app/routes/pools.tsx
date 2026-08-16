import { redirect } from "react-router";
import { PoolsPage } from "~/components/pools/pools-page";
import { fetchPools } from "~/lib/server/pools.server";
import { getWebPassword } from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/pools";

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length === 0 || !hasValidSession(request, password)) {
		throw redirect("/");
	}
	const url = new URL(request.url);
	return fetchPools(url.searchParams.get("timeframe"));
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
	return serverLoader();
}

export default PoolsPage;
