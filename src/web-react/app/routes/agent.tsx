import { redirect } from "react-router";
import { ChartAreaInteractive } from "~/components/chart-area-interactive";
import { DashboardShell } from "~/components/dashboard-shell";
import { DataTable } from "~/components/data-table";
import { SectionCards } from "~/components/section-cards";
import data from "~/dashboard/data.json";
import { getWebPassword } from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/agent";

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length === 0 || !hasValidSession(request, password)) {
		throw redirect("/");
	}
	return null;
}

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
