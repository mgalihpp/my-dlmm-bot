import { lazy, Suspense, useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { useAutoRefresh } from "~/hooks/use-auto-refresh";
import { useStoredCurrency } from "~/hooks/use-stored-currency";
import type { PortfolioPayload } from "~/lib/server/portfolio.server";
import { PortfolioHeader } from "./portfolio-header";
import type { RangeFilter } from "./portfolio-page";
import { PositionsTableSkeleton } from "./portfolio-table-skeletons";

const PositionsTable = lazy(() =>
	import("./positions-table-grid").then((m) => ({ default: m.PositionsTable })),
);

export function PortfolioActivePage() {
	useAutoRefresh(10_000);
	const data = useLoaderData<PortfolioPayload>();
	const [rangeFilter, setRangeFilter] = useState<RangeFilter>("all");
	const { revalidate, state } = useRevalidator();
	const [currency, setCurrency] = useStoredCurrency("portfolio");

	if (!data.ok) {
		return (
			<DashboardShell title="Portfolio">
				<div className="px-4 py-6 lg:px-6">
					<LoadErrorCard title="Failed to load" error={data.error} />
				</div>
			</DashboardShell>
		);
	}

	return (
		<DashboardShell title="Portfolio" wallet={data.wallet} rpc={data.rpc}>
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<PortfolioHeader
					title="Active Positions"
					currency={currency}
					onCurrencyChange={setCurrency}
					onRefresh={revalidate}
					refreshing={state === "loading"}
				/>
				<Suspense fallback={<PositionsTableSkeleton />}>
					<PositionsTable
						pools={data.pools ?? []}
						rangeFilter={rangeFilter}
						onRangeFilterChange={setRangeFilter}
						currency={currency}
						solPrice={data.solPrice}
					/>
				</Suspense>
			</div>
		</DashboardShell>
	);
}
