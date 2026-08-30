import { fetchPoolIcons, getWebPassword } from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/api.pool-icons";

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length > 0 && !hasValidSession(request, password)) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}
	const url = new URL(request.url);
	const poolsParam = url.searchParams.get("pools") ?? "";
	const pools = poolsParam
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.slice(0, 20);
	if (pools.length === 0) {
		return Response.json({ ok: false, error: "missing pools param" }, { status: 400 });
	}
	try {
		const icons = await fetchPoolIcons(pools);
		return Response.json({ ok: true, icons });
	} catch (e) {
		return Response.json({ ok: false, error: String(e) }, { status: 500 });
	}
}
