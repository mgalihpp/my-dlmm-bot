import { ChevronLeftIcon } from "lucide-react";
import { Link, useOutletContext, useParams } from "react-router";
import { AgentStatusCard } from "~/components/settings/agent-status-card";
import { PreferencesCard } from "~/components/settings/preferences-card";
import { SECTIONS } from "~/components/settings/settings-meta";
import { SettingsSection } from "~/components/settings/settings-section";
import type { SettingsPayload } from "~/lib/settings";

export default function SettingsCategory() {
	const { data, actionData } = useOutletContext<{
		data: SettingsPayload;
		actionData?: SettingsPayload;
	}>();
	const { category } = useParams();
	const section = SECTIONS.find((item) => item.key === category);
	if (!section) throw new Response("Not Found", { status: 404 });
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
