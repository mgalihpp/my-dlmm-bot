import type { AgentPayload } from "~/lib/server/agent.server";
import { DecisionJournal } from "./decision-journal";
import { NarrativeCard } from "./narrative-card";
import { PerformanceTabs } from "./performance-tabs";
import { StatCards } from "./stat-cards";
import { StatusBanner } from "./status-banner";

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
			<NarrativeCard narrative={data.narrative!} stats={data.stats!} />
			<PerformanceTabs analytics={data.analytics!} range={data.range!} />
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
