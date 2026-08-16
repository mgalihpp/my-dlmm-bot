import { redirect } from "react-router";
import { PortfolioPage } from "~/components/portfolio/portfolio-page";
import { fetchPortfolio, getWebPassword } from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/portfolio";

export const meta: Route.MetaFunction = () => [{ title: "Portfolio | Vexis" }];

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length === 0 || !hasValidSession(request, password)) {
		throw redirect("/");
	}
	const url = new URL(request.url);
	const rawPage = url.searchParams.get("closedPage");
	const parsedPage = rawPage === null ? 1 : Number(rawPage);
	const closedPage =
		Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
	return fetchPortfolio(closedPage);
}

export default PortfolioPage;
