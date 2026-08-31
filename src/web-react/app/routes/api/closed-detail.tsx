import { fetchClosedPositionDetail } from "~/lib/server/portfolio.server";
import { isValidSolanaAddress } from "~/lib/server/validate.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/closed-detail";

export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader({ params }: Route.LoaderArgs) {
	const pool = params.pool ?? "";
	if (!isValidSolanaAddress(pool)) {
		return Response.json(
			{ ok: false, error: "invalid pool address" },
			{ status: 400 },
		);
	}
	return fetchClosedPositionDetail(pool);
}
