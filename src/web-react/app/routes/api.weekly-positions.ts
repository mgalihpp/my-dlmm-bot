import {
	fetchClosedPositions,
	fetchPortfolioCritical,
	getWebPassword,
} from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/api.weekly-positions";

function toMonday(date: Date): string {
	const day = date.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	const mon = new Date(date);
	mon.setDate(date.getDate() + diff);
	return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
}

function normalizeWeek(week: string): string | null {
	if (/^\d{4}-\d{2}-\d{2}$/.test(week)) return week;
	const m = week.match(/^(\d{4})-W(\d{2})$/);
	if (!m) return null;
	const year = Number(m[1]);
	const w = Number(m[2]);
	const jan4 = new Date(year, 0, 4);
	const day = jan4.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	const mon1 = new Date(jan4);
	mon1.setDate(jan4.getDate() + diff);
	const target = new Date(mon1);
	target.setDate(mon1.getDate() + (w - 1) * 7);
	return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length > 0 && !hasValidSession(request, password)) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}
	const url = new URL(request.url);
	const week = url.searchParams.get("week");
	if (
		!week ||
		(!/^\d{4}-\d{2}-\d{2}$/.test(week) && !/^\d{4}-W\d{2}$/.test(week))
	) {
		return Response.json(
			{ ok: false, error: "invalid week format, use YYYY-MM-DD or YYYY-Www" },
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
		const positions = await fetchClosedPositions(wallet, { week });
		const now = new Date();
		const curWeekStart = toMonday(now);
		const norm = normalizeWeek(week) ?? week;
		const isPast = norm !== curWeekStart;
		const headers: Record<string, string> = isPast
			? { "Cache-Control": "public, max-age=86400, immutable" }
			: { "Cache-Control": "public, max-age=300" };
		return Response.json({ ok: true, positions, week }, { headers });
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
	}
}
