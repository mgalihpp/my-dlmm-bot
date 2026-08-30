import {
	fetchClosedPositions,
	getWebPassword,
	resolveWalletFromRequest,
} from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/api.weekly-positions";

function toMonday(date: Date): string {
	const day = date.getUTCDay();
	const diff = day === 0 ? -6 : 1 - day;
	const mon = new Date(
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			date.getUTCDate() + diff,
		),
	);
	return `${mon.getUTCFullYear()}-${String(mon.getUTCMonth() + 1).padStart(2, "0")}-${String(mon.getUTCDate()).padStart(2, "0")}`;
}

function normalizeWeek(week: string): string | null {
	if (/^\d{4}-\d{2}-\d{2}$/.test(week)) return week;
	const m = week.match(/^(\d{4})-W(\d{2})$/);
	if (!m) return null;
	const year = Number(m[1]);
	const w = Number(m[2]);
	const jan4 = new Date(Date.UTC(year, 0, 4));
	const day = jan4.getUTCDay();
	const diff = day === 0 ? -6 : 1 - day;
	const mon1 = new Date(Date.UTC(year, 0, 4 + diff));
	const target = new Date(
		Date.UTC(
			mon1.getUTCFullYear(),
			mon1.getUTCMonth(),
			mon1.getUTCDate() + (w - 1) * 7,
		),
	);
	return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
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
	let wallet: string;
	try {
		wallet = await resolveWalletFromRequest(request);
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
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
