import { PortfolioPage } from "~/components/portfolio/portfolio-page";
import { closePosition } from "~/lib/server/close.server";
import { fetchPortfolio } from "~/lib/server/portfolio.server";
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
	const wallet = url.searchParams.get("wallet");
	return fetchPortfolio(closedPage, wallet);
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
	const wallet = form.get("wallet") ? String(form.get("wallet")) : null;
	return closePosition(pool, position, poolName, wallet);
}

export default PortfolioPage;
