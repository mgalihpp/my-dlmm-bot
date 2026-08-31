import { redirect } from "react-router";
import { getWebPassword } from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";

export async function authMiddleware({ request }: { request: Request }) {
	const password = await getWebPassword();
	if (password.length > 0 && !hasValidSession(request, password)) {
		throw redirect("/");
	}
}

export async function apiAuthMiddleware({ request }: { request: Request }) {
	const password = await getWebPassword();
	if (password.length > 0 && !hasValidSession(request, password)) {
		return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
	}
}
