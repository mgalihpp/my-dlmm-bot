import { useRouteError } from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";

export function RouteError({
	title,
	shellTitle,
}: {
	title: string;
	shellTitle: string;
}) {
	const error = useRouteError();
	const message =
		error instanceof Error
			? error.message
			: typeof error === "object" && error !== null
				? JSON.stringify(error)
				: String(error);
	return (
		<DashboardShell title={shellTitle}>
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<LoadErrorCard title={title} error={message} />
			</div>
		</DashboardShell>
	);
}
