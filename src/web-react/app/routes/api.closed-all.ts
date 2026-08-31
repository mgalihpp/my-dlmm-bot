import {
	fetchAllClosedPools,
	resolveWalletFromRequest,
} from "~/lib/server/portfolio.server";
import { apiAuthMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/api.closed-all";

export const middleware = [apiAuthMiddleware];

export async function loader({ request }: Route.LoaderArgs) {
	let wallet: string;
	try {
		wallet = await resolveWalletFromRequest(request);
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
	}
	try {
		const pools = await fetchAllClosedPools(wallet);
		return Response.json(
			{ ok: true, pools },
			{ headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
		);
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
	}
}
