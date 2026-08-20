import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { PageSkeleton, useIsNavigating } from "~/components/page-skeletons";
import type { AgentPayload } from "~/lib/server/agent.server";
import { AgentContent } from "./agent-content";
import { AgentHeader } from "./agent-header";

export function AgentPage() {
	const data = useLoaderData<AgentPayload>();
	const { revalidate, state } = useRevalidator();
	const [, setSearchParams] = useSearchParams();
	const isNavigating = useIsNavigating();

	const onFilterChange = (value: string) =>
		setSearchParams(value === "all" ? {} : { action: value }, {
			preventScrollReset: true,
		});
	const onPageChange = (next: number) => {
		const params: Record<string, string> = {};
		if (data.filter && data.filter !== "all") params.action = data.filter;
		if (next > 1) params.page = String(next);
		setSearchParams(params, { preventScrollReset: true });
	};

	return (
		<DashboardShell title="Agent" wallet={data.wallet} rpc={data.rpc}>
			{isNavigating ? (
				<PageSkeleton />
			) : (
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
					<AgentHeader
						onRefresh={revalidate}
						refreshing={state === "loading"}
					/>

					{!data.ok ? (
						<LoadErrorCard title="Failed to load agent" error={data.error} />
					) : (
						<AgentContent
							data={data}
							onFilterChange={onFilterChange}
							onPageChange={onPageChange}
						/>
					)}
				</div>
			)}
		</DashboardShell>
	);
}
