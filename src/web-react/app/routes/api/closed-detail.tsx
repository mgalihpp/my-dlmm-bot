import { redirect } from "react-router";
import {
	fetchClosedPositionDetail,
	getWebPassword,
} from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/closed-detail";

export async function loader({ request, params }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length === 0 || !hasValidSession(request, password)) {
		throw redirect("/");
	}
	return fetchClosedPositionDetail(params.pool ?? "");
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
	return serverLoader();
}
