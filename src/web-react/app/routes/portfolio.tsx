import { DashboardShell } from "~/components/dashboard-shell";

export default function PortfolioPage() {
	return (
		<DashboardShell title="Portfolio">
			<div className="flex flex-1 flex-col items-center justify-center gap-4 py-4 md:py-6">
				<h2 className="text-2xl font-bold">Portfolio</h2>
				<p className="text-muted-foreground">Placeholder — coming soon.</p>
			</div>
		</DashboardShell>
	);
}
