import { redirect } from "react-router";
import { expiredCookieHeader } from "~/lib/server/session.server";
import type { Route } from "./+types/logout";

export async function loader({}: Route.LoaderArgs) {
	throw redirect("/", {
		headers: { "set-cookie": expiredCookieHeader() },
	});
}
