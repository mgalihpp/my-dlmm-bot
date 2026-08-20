import { useCallback } from "react";
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

	// rerender-defer-reads + rerender-functional-setstate: use functional
	// updater so callbacks are stable and don't close over data.filter.
	const onFilterChange = useCallback(
		(value: string) => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					if (value === "all") next.delete("action");
					else next.set("action", value);
					next.delete("page");
					return next;
				},
				{ preventScrollReset: true },
			);
		},
		[setSearchParams],
	);

	const onPageChange = useCallback(
		(next: number) => {
			setSearchParams(
				(prev) => {
					const p = new URLSearchParams(prev);
					if (next > 1) p.set("page", String(next));
					else p.delete("page");
					return p;
				},
				{ preventScrollReset: true },
			);
		},
		[setSearchParams],
	);

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
