import { redirect } from "react-router";
import { DashboardShell } from "~/components/dashboard-shell";
import { getWebPassword } from "~/lib/server/portfolio.server";
import { hasValidSession } from "~/lib/server/session.server";
import type { Route } from "./+types/pools";

export async function loader({ request }: Route.LoaderArgs) {
	const password = await getWebPassword();
	if (password.length === 0 || !hasValidSession(request, password)) {
		throw redirect("/");
	}
	return null;
}

export default function PoolsPage() {
	return (
		<DashboardShell title="Pool Radar">
			<div className="flex flex-1 flex-col items-center justify-center gap-4 py-4 md:py-6">
				<h2 className="text-2xl font-bold">Pool Radar</h2>
				<p className="text-muted-foreground">Placeholder — coming soon.</p>
			</div>
		</DashboardShell>
	);
}
