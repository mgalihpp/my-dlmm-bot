import {
	fetchClosedPositions,
	getWebPassword,
	resolveWalletFromRequest,
} from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/api.daily-positions";

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length > 0 && !hasValidSession(request, password)) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}
	const url = new URL(request.url);
	const day = url.searchParams.get("day");
	if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
		return Response.json(
			{ ok: false, error: "invalid day format, use YYYY-MM-DD" },
			{ status: 400 },
		);
	}
	let wallet: string;
	try {
		wallet = await resolveWalletFromRequest(request);
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
	}
	try {
		const positions = await fetchClosedPositions(wallet, { day });
		const now = new Date();
		const curDayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
		const isPast = day !== curDayKey;
		const headers: Record<string, string> = isPast
			? { "Cache-Control": "public, max-age=86400, immutable" }
			: { "Cache-Control": "public, max-age=300" };
		return Response.json({ ok: true, positions, day }, { headers });
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
	}
}
