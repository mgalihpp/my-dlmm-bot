import { ChevronLeftIcon } from "lucide-react";
import { useEffect } from "react";
import { Link, useActionData, useOutletContext, useParams } from "react-router";
import { toast } from "sonner";
import { AgentStatusCard } from "~/components/settings/agent-status-card";
import { PreferencesCard } from "~/components/settings/preferences-card";
import { SECTIONS } from "~/components/settings/settings-meta";
import { SettingsSection } from "~/components/settings/settings-section";
import {
	EDITABLE_FIELDS,
	fetchSettings,
	parseFieldValue,
	resetField,
	saveField,
	setAgentEnabled,
} from "~/lib/server/settings.server";
import type { SettingsPayload } from "~/lib/settings";
import type { Route } from "./+types/settings-category";

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

export default function SettingsCategory() {
	const { data } = useOutletContext<{
		data: SettingsPayload;
	}>();
	const actionData = useActionData<SettingsPayload>();
	const { category } = useParams();
	const section = SECTIONS.find((item) => item.key === category);
	if (!section) throw new Response("Not Found", { status: 404 });

	useEffect(() => {
		if (!actionData) return;
		if (actionData.ok) toast.success("Settings saved");
		else toast.error(actionData.error ?? "Failed to save settings");
	}, [actionData]);

	const latest = actionData?.ok ? actionData : data;
	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:py-8">
			<div>
				<Link
					to="/settings"
					className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
				>
					<ChevronLeftIcon className="size-4" /> Settings
				</Link>
				<h1 className="text-3xl font-semibold tracking-tight">
					{section.title}
				</h1>
			</div>
			{section.key === "agent" && (
				<AgentStatusCard
					enabled={latest.agent.enabled}
					running={latest.agent.running}
					lastCycleAt={latest.agent.lastCycleAt}
				/>
			)}
			{section.key === "preferences" ? (
				<PreferencesCard />
			) : (
				<SettingsSection
					section={section.key}
					title={section.title}
					values={latest.values}
				/>
			)}
		</div>
	);
}
