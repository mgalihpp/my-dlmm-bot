import { AgentPage } from "~/components/agent/agent-page";
import { fetchAgent } from "~/lib/server/agent.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/agent";

export const meta: Route.MetaFunction = () => [{ title: "Agent | Vexis" }];
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const rawPage = url.searchParams.get("page");
	const parsedPage = rawPage === null ? 1 : Number(rawPage);
	const page =
		Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
	return fetchAgent(
		page,
		url.searchParams.get("action"),
		url.searchParams.get("range"),
	);
}

export default AgentPage;
