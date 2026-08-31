import { lazy, Suspense } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { PageSkeleton, useIsNavigating } from "~/components/page-skeletons";
import { useAutoRefresh } from "~/hooks/use-auto-refresh";
import { useStoredCurrency } from "~/hooks/use-stored-currency";
import type { PortfolioPayload } from "~/lib/server/portfolio.server";
import { PortfolioHeader } from "./portfolio-header";
import { ClosedTableSkeleton } from "./portfolio-table-skeletons";

const ClosedTable = lazy(() =>
	import("./closed-table-grid").then((m) => ({ default: m.ClosedTable })),
);

export function PortfolioClosedPage() {
	useAutoRefresh(10_000);
	const data = useLoaderData<PortfolioPayload>();
	const isNavigating = useIsNavigating();
	const [, setSearchParams] = useSearchParams();
	const { revalidate, state } = useRevalidator();
	const [currency, setCurrency] = useStoredCurrency("portfolio");

	const onClosedPageChange = (page: number) =>
		setSearchParams(
			(current) => {
				const next = new URLSearchParams(current);
				if (page > 1) next.set("closedPage", String(page));
				else next.delete("closedPage");
				return next;
			},
			{ preventScrollReset: true },
		);

	if (isNavigating) {
		return (
			<DashboardShell title="Portfolio">
				<PageSkeleton />
			</DashboardShell>
		);
	}
	if (!data.ok) {
		return (
			<DashboardShell title="Portfolio">
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
					<PortfolioHeader
						title="Closed Positions"
						currency={currency}
						onCurrencyChange={() => {}}
						onRefresh={revalidate}
						refreshing={state === "loading"}
					/>
					<LoadErrorCard title="Failed to load portfolio" error={data.error} />
				</div>
			</DashboardShell>
		);
	}

	return (
		<DashboardShell title="Portfolio" wallet={data.wallet} rpc={data.rpc}>
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<PortfolioHeader
					title="Closed Positions"
					currency={currency}
					onCurrencyChange={setCurrency}
					onRefresh={revalidate}
					refreshing={state === "loading"}
				/>
				<Suspense fallback={<ClosedTableSkeleton />}>
					<ClosedTable
						closed={data.closed!}
						currency={currency}
						onPageChange={onClosedPageChange}
					/>
				</Suspense>
			</div>
		</DashboardShell>
	);
}
