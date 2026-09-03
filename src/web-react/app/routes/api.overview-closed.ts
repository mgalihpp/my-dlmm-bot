import {
	fetchOverviewClosed,
	resolveWalletFromRequest,
} from "~/lib/server/portfolio.server";
import { apiAuthMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/api.overview-closed";

export const middleware = [apiAuthMiddleware];

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const month = url.searchParams.get("month");
	const day = url.searchParams.get("day");
	const week = url.searchParams.get("week");
	const poolsOnly = url.searchParams.get("poolsOnly") === "1";
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
	let wallet: string;
	try {
		wallet = await resolveWalletFromRequest(request);
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
	}
	try {
		const opts = day
			? { day }
			: week
				? { week }
				: month
					? { month }
					: poolsOnly
						? { poolsOnly: true as const }
						: undefined;
		const data = await fetchOverviewClosed(wallet, opts);
		const now = new Date();
		const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
		const maxAge =
			month != null && month < currentMonth && !poolsOnly ? 3600 : 60;
		return Response.json(
			{
				ok: true,
				pools: data.pools,
				positions: data.positions,
				byMonth: data.byMonth,
				totalCount: data.totalCount,
				totalPositions: data.totalPositions,
				apiTotalPositions: data.apiTotalPositions,
			},
			{ headers: { "Cache-Control": `public, max-age=${maxAge}` } },
		);
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
	}
}
