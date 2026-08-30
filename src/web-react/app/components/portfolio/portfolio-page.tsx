import { useState } from "react";
import {
	useLoaderData,
	useLocation,
	useNavigation,
	useRevalidator,
	useSearchParams,
} from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { PageSkeleton } from "~/components/page-skeletons";
import { useAutoRefresh } from "~/hooks/use-auto-refresh";
import { useStoredCurrency } from "~/hooks/use-stored-currency";
import {
	parseDateFilterParams,
	resolveDateFilter,
	writeDateFilterParams,
} from "~/lib/date-range";
import type { PortfolioPayload } from "~/lib/server/portfolio.server";
import { PortfolioHeader } from "./portfolio-header";
import { PortfolioOverviewContent } from "./portfolio-overview-content";

export type { Currency } from "~/lib/currency";
export type RangeFilter = "all" | "in-range" | "oor";

export function PortfolioPage() {
	useAutoRefresh(30_000);
	const data = useLoaderData<PortfolioPayload>();
	const navigation = useNavigation();
	const location = useLocation();
	const isPageNavigating =
		navigation.state === "loading" &&
		navigation.location !== undefined &&
		navigation.location.pathname !== location.pathname;
	const [searchParams, setSearchParams] = useSearchParams();
	const [rangeFilter, setRangeFilter] = useState<RangeFilter>("all");
	const { revalidate, state } = useRevalidator();
	const [currency, setCurrency] = useStoredCurrency("portfolio");
	const dateFilter = parseDateFilterParams(searchParams);
	const dateRange = resolveDateFilter(dateFilter, new Date());

	const applyDateFilter = (value: typeof dateFilter) => {
		setSearchParams((current) => writeDateFilterParams(current, value), {
			preventScrollReset: true,
		});
	};

	if (isPageNavigating) {
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
						currency={currency}
						onCurrencyChange={() => {}}
						dateFilter={dateFilter}
						onDateFilterApply={applyDateFilter}
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
					currency={currency}
					onCurrencyChange={setCurrency}
					dateFilter={dateFilter}
					onDateFilterApply={applyDateFilter}
					onRefresh={revalidate}
					refreshing={state === "loading"}
				/>
				<PortfolioOverviewContent
					data={data}
					currency={currency}
					dateRange={dateRange}
					rangeFilter={rangeFilter}
					onRangeFilterChange={setRangeFilter}
				/>
			</div>
		</DashboardShell>
	);
}
