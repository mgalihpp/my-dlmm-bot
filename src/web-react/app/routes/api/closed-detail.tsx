import { fetchClosedPositionDetail } from "~/lib/server/portfolio.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/closed-detail";

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ params }: Route.LoaderArgs) {
	return fetchClosedPositionDetail(params.pool ?? "");
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
	return serverLoader();
}
