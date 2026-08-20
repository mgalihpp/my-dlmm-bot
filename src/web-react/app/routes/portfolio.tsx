import { PortfolioPage } from "~/components/portfolio/portfolio-page";
import { closePosition } from "~/lib/server/close.server";
import {
	fetchPortfolioCritical,
	fetchPortfolioDeferred,
} from "~/lib/server/portfolio.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/portfolio";

export const meta: Route.MetaFunction = () => [{ title: "Portfolio | Vexis" }];
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const rawPage = url.searchParams.get("closedPage");
	const parsedPage = rawPage === null ? 1 : Number(rawPage);
	const closedPage =
		Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
	const critical = await fetchPortfolioCritical();
	if (!critical.ok) return critical;
	const deferred = fetchPortfolioDeferred(critical.wallet, critical.pools, closedPage);
	return { critical, deferred };
}

export async function action({ request }: Route.ActionArgs) {
	const form = await request.formData();
	const op = String(form.get("op") ?? "");
	if (op !== "close") {
		return { ok: false, error: "Unknown op" } as const;
	}
	const pool = String(form.get("pool") ?? "");
	const position = String(form.get("position") ?? "");
	const poolName = String(form.get("poolName") ?? "");
	return closePosition(pool, position, poolName);
}

export default PortfolioPage;
