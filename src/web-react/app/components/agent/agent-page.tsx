import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { PageSkeleton, useIsNavigating } from "~/components/page-skeletons";
import { WalletSwitcher } from "~/components/wallet-switcher";
import type { AgentPayload } from "~/lib/server/agent.server";
import { AgentContent } from "./agent-content";
import { AgentHeader } from "./agent-header";

export function AgentPage() {
	const data = useLoaderData<AgentPayload>();
	const { revalidate, state } = useRevalidator();
	const [, setSearchParams] = useSearchParams();
	const isNavigating = useIsNavigating();

	const onFilterChange = (value: string) =>
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				if (value === "all") next.delete("action");
				else next.set("action", value);
				next.delete("page");
				return next;
			},
			{
				preventScrollReset: true,
			},
		);
	const onPageChange = (next: number) => {
		setSearchParams(
			(prev) => {
				const nxt = new URLSearchParams(prev);
				if (next > 1) nxt.set("page", String(next));
				else nxt.delete("page");
				return nxt;
			},
			{ preventScrollReset: true },
		);
	};

	return (
		<DashboardShell title="Agent" wallet={data.wallet} rpc={data.rpc}>
			{isNavigating ? (
				<PageSkeleton />
			) : (
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
					<div className="flex flex-wrap items-center justify-between gap-2 px-4 lg:px-6">
						<WalletSwitcher
							wallets={data.wallets ?? []}
							value={data.wallet ?? ""}
						/>
					</div>
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
