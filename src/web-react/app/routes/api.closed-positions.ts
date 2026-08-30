import {
	fetchClosedPositions,
	fetchPortfolioCritical,
	getWebPassword,
} from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/api.closed-positions";

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length > 0 && !hasValidSession(request, password)) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}
	const url = new URL(request.url);
	const month = url.searchParams.get("month");
	if (month && !/^\d{4}-\d{2}$/.test(month)) {
		return Response.json(
			{ ok: false, error: "invalid month format, use YYYY-MM" },
			{ status: 400 },
		);
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
		const positions = await fetchClosedPositions(
			wallet,
			month ? { month } : undefined,
		);
		return Response.json({ ok: true, positions, month: month ?? null });
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
	}
}
