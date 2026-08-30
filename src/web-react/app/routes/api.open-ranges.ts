import { fetchOpenRanges, getWebPassword } from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/api.open-ranges";

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length > 0 && !hasValidSession(request, password)) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}
	const url = new URL(request.url);
	const poolsParam = url.searchParams.get("pools");
	const pools = poolsParam
		? poolsParam
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
				.slice(0, 20)
		: undefined;
	try {
		const ranges = await fetchOpenRanges(pools);
		return Response.json({ ok: true, ranges });
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
	}
}
