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
	const day = url.searchParams.get("day");
	const week = url.searchParams.get("week");
	const provided = [month, day, week].filter((v) => v != null).length;
	if (provided > 1) {
		return Response.json(
			{ ok: false, error: "provide only one of month, day, week" },
			{ status: 400 },
		);
	}
	if (month && !/^\d{4}-\d{2}$/.test(month)) {
		return Response.json(
			{ ok: false, error: "invalid month format, use YYYY-MM" },
			{ status: 400 },
		);
	}
	if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
		return Response.json(
			{ ok: false, error: "invalid day format, use YYYY-MM-DD" },
			{ status: 400 },
		);
	}
	if (
		week &&
		!/^\d{4}-\d{2}-\d{2}$/.test(week) &&
		!/^\d{4}-W\d{2}$/.test(week)
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
		const opts = day
			? { day }
			: week
				? { week }
				: month
					? { month }
					: undefined;
		const positions = await fetchClosedPositions(wallet, opts);
		const now = new Date();
		const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
		const curDayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
		const toMonday = (d: Date) => {
			const dayNum = d.getDay();
			const diff = dayNum === 0 ? -6 : 1 - dayNum;
			const mon = new Date(d);
			mon.setDate(d.getDate() + diff);
			return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
		};
		const weekStart = toMonday(now);
		const normalizeWeekParam = (w: string): string | null => {
			if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
			const m = w.match(/^(\d{4})-W(\d{2})$/);
			if (!m) return null;
			const year = Number(m[1]);
			const ww = Number(m[2]);
			const jan4 = new Date(year, 0, 4);
			const day = jan4.getDay();
			const diff = day === 0 ? -6 : 1 - day;
			const mon1 = new Date(jan4);
			mon1.setDate(jan4.getDate() + diff);
			const target = new Date(mon1);
			target.setDate(mon1.getDate() + (ww - 1) * 7);
			return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
		};
		const weekNorm = week ? (normalizeWeekParam(week) ?? week) : null;
		const isPast =
			(month != null && month !== curMonthKey) ||
			(day != null && day !== curDayKey) ||
			(week != null && weekNorm !== weekStart);
		const headers: Record<string, string> = isPast
			? { "Cache-Control": "public, max-age=86400, immutable" }
			: opts
				? { "Cache-Control": "public, max-age=300" }
				: { "Cache-Control": "public, max-age=60" };
		return Response.json(
			{
				ok: true,
				positions,
				month: month ?? null,
				day: day ?? null,
				week: week ?? null,
			},
			{ headers },
		);
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
	}
}
