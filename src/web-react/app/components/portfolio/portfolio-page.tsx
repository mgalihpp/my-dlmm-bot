import { useCallback, useEffect, useState } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { PageSkeleton, useIsNavigating } from "~/components/page-skeletons";
import {
	type Currency,
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "~/lib/currency";
import type { PortfolioPayload } from "~/lib/server/portfolio.server";
import { PortfolioContent } from "./portfolio-content";
import { PortfolioHeader } from "./portfolio-header";

export type { Currency } from "~/lib/currency";

export type RangeFilter = "all" | "in-range" | "oor";

export function PortfolioPage() {
	const data = useLoaderData<PortfolioPayload>();
	const { revalidate, state } = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();
	const [storedCurrency, setStoredCurrency] = useState<Currency | null>(null);
	const currency = resolveCurrency(
		searchParams.get("currency"),
		storedCurrency,
	);
	const setCurrency = useCallback(
		(v: Currency) => {
			writeStoredCurrency(window.localStorage, v);
			setStoredCurrency(v);
			setSearchParams(
				(current) => {
					const next = new URLSearchParams(current);
					if (v === "usd") next.delete("currency");
					else next.set("currency", v);
					return next;
				},
				{ preventScrollReset: true },
			);
		},
		[setSearchParams],
	);
	const onClosedPageChange = useCallback(
		(next: number) =>
			setSearchParams(
				(current) => {
					const sp = new URLSearchParams(current);
					if (next > 1) sp.set("closedPage", String(next));
					else sp.delete("closedPage");
					return sp;
				},
				{ preventScrollReset: true },
			),
		[setSearchParams],
	);
	const [rangeFilter, setRangeFilter] = useState<RangeFilter>("all");
	const isNavigating = useIsNavigating();

	useEffect(() => {
		setStoredCurrency(readStoredCurrency(window.localStorage));
	}, []);

	return (
		<DashboardShell title="Portfolio" wallet={data.wallet} rpc={data.rpc}>
			{isNavigating ? (
				<PageSkeleton />
			) : (
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
					<PortfolioHeader
						currency={currency}
						onCurrencyChange={setCurrency}
						onRefresh={revalidate}
						refreshing={state === "loading"}
					/>

					{!data.ok ? (
						<LoadErrorCard
							title="Failed to load portfolio"
							error={data.error}
						/>
					) : (
						<PortfolioContent
							data={data}
							currency={currency}
							rangeFilter={rangeFilter}
							onRangeFilterChange={setRangeFilter}
							onClosedPageChange={onClosedPageChange}
						/>
					)}
				</div>
			)}
		</DashboardShell>
	);
}
