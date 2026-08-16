import { AlertCircleIcon, CheckIcon } from "lucide-react";
import { useActionData, useLoaderData } from "react-router";
import { DashboardShell } from "~/components/dashboard-shell";
import { AgentStatusCard } from "~/components/settings/agent-status-card";
import { SettingsSection } from "~/components/settings/settings-section";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { Section, SettingsPayload } from "~/lib/settings";

const SECTIONS: readonly { id: Section; title: string }[] = [
	{ id: "general", title: "General" },
	{ id: "agent", title: "Agent" },
	{ id: "create", title: "Create" },
	{ id: "pools", title: "Pools" },
];

export function SettingsPage() {
	const data = useLoaderData<SettingsPayload>();
	const actionData = useActionData<SettingsPayload>();

	if (!data.ok) {
		return (
			<DashboardShell title="Settings">
				<Card className="m-4 lg:m-6">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-destructive">
							<AlertCircleIcon className="size-5" />
							Failed to load settings
						</CardTitle>
					</CardHeader>
					<CardContent className="text-sm text-muted-foreground">
						{data.error ?? "Unknown error"}
					</CardContent>
				</Card>
			</DashboardShell>
		);
	}

	const latest: SettingsPayload = actionData?.ok ? actionData : data;
	const { agent, values, configPath } = latest;

	return (
		<DashboardShell title="Settings">
			<div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
				<div className="flex flex-wrap items-center justify-between gap-3 px-1">
					<div>
						<h1 className="text-2xl font-bold tracking-tight">Settings</h1>
						<p className="text-sm text-muted-foreground">
							{configPath ?? "No config file"} · secret fields are read-only via
							file
						</p>
					</div>
					{actionData && !actionData.ok && (
						<span className="flex items-center gap-2 text-sm text-destructive">
							<AlertCircleIcon className="size-4" /> {actionData.error}
						</span>
					)}
					{actionData?.ok && (
						<span className="flex items-center gap-2 text-sm text-emerald-600">
							<CheckIcon className="size-4" /> Saved
						</span>
					)}
				</div>
				<AgentStatusCard
					enabled={agent.enabled}
					running={agent.running}
					lastCycleAt={agent.lastCycleAt}
				/>
				<Tabs defaultValue="general" orientation="vertical">
					<TabsList variant="line" className="h-fit shrink-0 gap-1">
						{SECTIONS.map((s) => (
							<TabsTrigger key={s.id} value={s.id}>
								{s.title}
							</TabsTrigger>
						))}
					</TabsList>
					{SECTIONS.map((s) => (
						<TabsContent key={s.id} value={s.id}>
							<SettingsSection section={s.id} title={s.title} values={values} />
						</TabsContent>
					))}
				</Tabs>
			</div>
		</DashboardShell>
	);
}
