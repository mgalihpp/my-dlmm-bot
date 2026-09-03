import type { AgentPayload } from "~/lib/server/agent.server";
import { AnalyticsTabs } from "./analytics-tabs";
import { DecisionJournal } from "./decision-journal";
import { NarrativeCard } from "./narrative-card";
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
			<AnalyticsTabs
				chart={data.chart!}
				blocked={data.blocked!}
				scores={data.scores!}
			/>
			<div className="grid grid-cols-1 items-start gap-3 px-4 lg:px-6 @4xl/main:grid-cols-[minmax(0,1fr)_340px]">
				<DecisionJournal
					filter={data.filter!}
					page={data.page!}
					pages={data.pages!}
					total={data.total!}
					groups={data.groups!}
					onFilterChange={onFilterChange}
					onPageChange={onPageChange}
				/>
				<aside className="min-w-0">
					<NarrativeCard narrative={data.narrative!} stats={data.stats!} />
				</aside>
			</div>
		</>
	);
}
