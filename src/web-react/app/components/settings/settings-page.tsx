import { useEffect } from "react";
import { Outlet, useActionData, useLoaderData } from "react-router";
import { toast } from "sonner";
import { DashboardShell } from "~/components/dashboard-shell";
import { PageSkeleton, useIsNavigating } from "~/components/page-skeletons";
import type { SettingsPayload } from "~/lib/settings";

export function SettingsPage() {
	const data = useLoaderData<SettingsPayload>();
	const actionData = useActionData<SettingsPayload>();
	const isNavigating = useIsNavigating();

	useEffect(() => {
		if (!actionData) return;
		if (actionData.ok) toast.success("Settings saved");
		else toast.error(actionData.error ?? "Failed to save settings");
	}, [actionData]);

	return (
		<DashboardShell title="Settings" wallet={data.wallet} rpc={data.rpc}>
			{isNavigating ? (
				<PageSkeleton />
			) : (
				<Outlet context={{ data, actionData }} />
			)}
		</DashboardShell>
	);
}
