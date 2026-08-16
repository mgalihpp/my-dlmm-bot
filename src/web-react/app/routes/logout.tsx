import { redirect } from "react-router";
import { expiredCookieHeader } from "~/lib/server/session.server";

export async function loader() {
	throw redirect("/", {
		headers: { "set-cookie": expiredCookieHeader() },
	});
}
