import { PortfolioClosedPage } from "~/components/portfolio/portfolio-closed-page";
import { RouteError } from "~/components/route-error";
import { fetchClosedPortfolio } from "~/lib/server/portfolio.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/portfolio-closed";

export function ErrorBoundary() {
	return <RouteError title="Failed to load portfolio" shellTitle="Portfolio" />;
}

export const meta: Route.MetaFunction = () => [
	{ title: "Closed Positions | Vexis" },
];
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const rawPage = url.searchParams.get("closedPage");
	const parsedPage = rawPage === null ? 1 : Number(rawPage);
	const closedPage =
		Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
	return fetchClosedPortfolio(closedPage);
}

export default PortfolioClosedPage;
