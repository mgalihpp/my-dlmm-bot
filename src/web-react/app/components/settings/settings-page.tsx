import { Outlet, useLoaderData } from "react-router";
import { DashboardShell } from "~/components/dashboard-shell";
import { PageSkeleton, useIsNavigating } from "~/components/page-skeletons";
import type { SettingsPayload } from "~/lib/settings";

export function SettingsPage() {
	const data = useLoaderData<SettingsPayload>();
	const isNavigating = useIsNavigating();

	return (
		<DashboardShell title="Settings" wallet={data.wallet} rpc={data.rpc}>
			{isNavigating ? <PageSkeleton /> : <Outlet context={{ data }} />}
		</DashboardShell>
	);
}
