import { SettingsPage } from "~/components/settings/settings-page";
import {
	EDITABLE_FIELDS,
	fetchSettings,
	parseFieldValue,
	resetField,
	type SettingsPayload,
	saveField,
	setAgentEnabled,
} from "~/lib/server/settings.server";
import { authMiddleware } from "~/middleware/auth";
import type { Route } from "./+types/settings";

export const meta: Route.MetaFunction = () => [{ title: "Settings | Vexis" }];
export const middleware: Route.MiddlewareFunction[] = [authMiddleware];

export async function loader() {
	return fetchSettings();
}

export async function action({ request }: Route.ActionArgs) {
	const form = await request.formData();
	const op = String(form.get("op") ?? "");
	const configPath = fetchSettings().configPath;
	if (!configPath) {
		return errorResult("No config file found.", null);
	}
	try {
		if (op === "setField") {
			const path = String(form.get("path") ?? "");
			const field = EDITABLE_FIELDS.find((f) => f.path === path);
			if (!field) return errorResult(`Unknown field: ${path}`, configPath);
			const value = parseFieldValue(field, form.get("value"));
			return saveField(configPath, field, value);
		}
		if (op === "resetField") {
			const path = String(form.get("path") ?? "");
			const field = EDITABLE_FIELDS.find((f) => f.path === path);
			if (!field) return errorResult(`Unknown field: ${path}`, configPath);
			return resetField(configPath, field);
		}
		if (op === "setAgentEnabled") {
			const enabled = form.get("enabled") === "true";
			return setAgentEnabled(configPath, enabled);
		}
		return errorResult(`Unknown op: ${op}`, configPath);
	} catch (e) {
		return errorResult(e instanceof Error ? e.message : String(e), configPath);
	}
}

function errorResult(
	error: string,
	configPath: string | null,
): SettingsPayload {
	return {
		ok: false,
		error,
		configPath,
		agent: { enabled: false, running: false, lastCycleAt: null },
		values: {},
	};
}

export default SettingsPage;
