import { lazy, Suspense } from "react";
import { ChartCardSkeleton } from "~/components/page-skeletons";
import type { AgentPayload } from "~/lib/server/agent.server";
import { DecisionJournal } from "./decision-journal";
import { NarrativeCard } from "./narrative-card";
import { StatCards } from "./stat-cards";
import { StatusBanner } from "./status-banner";

const CycleChart = lazy(() =>
	import("./cycle-chart").then((m) => ({ default: m.CycleChart })),
);

export function AgentContent({
	data,
	onFilterChange,
	onPageChange,
}: {
	data: AgentPayload;
	onFilterChange: (value: string) => void;
	onPageChange: (page: number) => void;
}) {
	return (
		<>
			<StatusBanner state={data.state!} />
			<StatCards stats={data.stats!} />
			<div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-2">
				<NarrativeCard narrative={data.narrative!} stats={data.stats!} />
				<Suspense fallback={<ChartCardSkeleton blockClassName="h-64 w-full" />}>
					<CycleChart data={data.chart!} />
				</Suspense>
			</div>
			<DecisionJournal
				filter={data.filter!}
				page={data.page!}
				pages={data.pages!}
				total={data.total!}
				groups={data.groups!}
				onFilterChange={onFilterChange}
				onPageChange={onPageChange}
			/>
		</>
	);
}
