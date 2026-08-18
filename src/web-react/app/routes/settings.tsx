import { SettingsPage } from "~/components/settings/settings-page";
import { fetchSettings } from "~/lib/server/settings.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/settings";

export const meta: Route.MetaFunction = () => [{ title: "Settings | Vexis" }];
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader() {
	return fetchSettings();
}

export default SettingsPage;
