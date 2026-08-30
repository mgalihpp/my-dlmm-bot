import {
	fetchAllClosedPools,
	fetchPortfolioCritical,
	getWebPassword,
} from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/api.closed-all";

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length > 0 && !hasValidSession(request, password)) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}
	const walletHeader = request.headers.get("x-wallet");
	let wallet = walletHeader ?? "";
	if (!wallet) {
		const critical = await fetchPortfolioCritical();
		if (!critical.ok)
			return Response.json(
				{ ok: false, error: critical.error },
				{ status: 500 },
			);
		wallet = critical.wallet;
	}
	try {
		const pools = await fetchAllClosedPools(wallet);
		return Response.json(
			{ ok: true, pools },
			{ headers: { "Cache-Control": "public, max-age=300" } },
		);
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
	}
}
