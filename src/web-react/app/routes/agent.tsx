import { ChartAreaInteractive } from "~/components/chart-area-interactive";
import { DashboardShell } from "~/components/dashboard-shell";
import { DataTable } from "~/components/data-table";
import { SectionCards } from "~/components/section-cards";

import data from "~/dashboard/data.json";

export default function AgentPage() {
	return (
		<DashboardShell title="Agent">
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<SectionCards />
				<div className="px-4 lg:px-6">
					<ChartAreaInteractive />
				</div>
				<DataTable data={data} />
			</div>
		</DashboardShell>
	);
}
