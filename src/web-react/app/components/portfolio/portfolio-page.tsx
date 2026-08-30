import { useEffect, useState } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { PageSkeleton, useIsNavigating } from "~/components/page-skeletons";
import { useAutoRefresh } from "~/hooks/use-auto-refresh";
import type { Currency } from "~/lib/currency";
import {
	PORTFOLIO_CURRENCY_STORAGE_KEY,
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "~/lib/currency";
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
	useAutoRefresh(10_000);
	const data = useLoaderData<PortfolioPayload>();
	const isNavigating = useIsNavigating();
	const [searchParams, setSearchParams] = useSearchParams();
	const [storedCurrency, setStoredCurrency] = useState<Currency | null>(null);
	const [rangeFilter, setRangeFilter] = useState<RangeFilter>("all");
	const { revalidate, state } = useRevalidator();
	const currency = resolveCurrency(
		searchParams.get("currency"),
		storedCurrency,
	);
	const dateFilter = parseDateFilterParams(searchParams);
	const dateRange = resolveDateFilter(dateFilter, new Date());

	useEffect(() => {
		setStoredCurrency(
			readStoredCurrency(window.localStorage, PORTFOLIO_CURRENCY_STORAGE_KEY),
		);
	}, []);

	const setCurrency = (value: Currency) => {
		writeStoredCurrency(
			window.localStorage,
			PORTFOLIO_CURRENCY_STORAGE_KEY,
			value,
		);
		setStoredCurrency(value);
		setSearchParams(
			(current) => {
				const next = new URLSearchParams(current);
				if (value === "usd") next.delete("currency");
				else next.set("currency", value);
				return next;
			},
			{ preventScrollReset: true },
		);
	};

	const applyDateFilter = (value: typeof dateFilter) => {
		setSearchParams((current) => writeDateFilterParams(current, value), {
			preventScrollReset: true,
		});
	};

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
