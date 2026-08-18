import { RefreshButton } from "~/components/dashboard-page-parts";

export function AgentHeader({
	onRefresh,
	refreshing,
}: {
	onRefresh: () => void;
	refreshing: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
			<h1 className="text-2xl font-bold tracking-tight">Agent Console</h1>
			<RefreshButton loading={refreshing} onClick={onRefresh} />
		</div>
	);
}
