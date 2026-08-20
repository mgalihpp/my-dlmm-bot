import { Suspense, useCallback, useEffect, useState } from "react";
import {
	Await,
	useLoaderData,
	useRevalidator,
	useSearchParams,
} from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import {
	PageSkeleton,
	PageSkeleton as TableFallback,
	useIsNavigating,
} from "~/components/page-skeletons";
import {
	type Currency,
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "~/lib/currency";
import type {
	PortfolioCritical,
	PortfolioDeferred,
} from "~/lib/server/portfolio.server";
import { PortfolioContent } from "./portfolio-content";
import { PortfolioHeader } from "./portfolio-header";

export type { Currency } from "~/lib/currency";

export type RangeFilter = "all" | "in-range" | "oor";

type LoaderData =
	| { ok: false; error: string; solPrice: null }
	| { critical: PortfolioCritical; deferred: Promise<PortfolioDeferred> };

export function PortfolioPage() {
	const data = useLoaderData<LoaderData>();
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

	if (isNavigating) {
		return (
			<DashboardShell title="Portfolio" wallet={undefined} rpc={undefined}>
				<PageSkeleton />
			</DashboardShell>
		);
	}

	if ("ok" in data && data.ok === false) {
		return (
			<DashboardShell title="Portfolio" wallet={undefined} rpc={undefined}>
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
					<PortfolioHeader
						currency={currency}
						onCurrencyChange={setCurrency}
						onRefresh={revalidate}
						refreshing={state === "loading"}
					/>
					<LoadErrorCard title="Failed to load portfolio" error={data.error} />
				</div>
			</DashboardShell>
		);
	}

	const { critical, deferred } = data as {
		critical: PortfolioCritical;
		deferred: Promise<PortfolioDeferred>;
	};

	return (
		<DashboardShell
			title="Portfolio"
			wallet={critical.wallet}
			rpc={critical.rpc}
		>
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<PortfolioHeader
					currency={currency}
					onCurrencyChange={setCurrency}
					onRefresh={revalidate}
					refreshing={state === "loading"}
				/>

				<Suspense fallback={<TableFallback />}>
					<Await
						resolve={deferred}
						errorElement={
							<LoadErrorCard
								title="Failed to load positions"
								error="Deferred load failed"
							/>
						}
					>
						{(d: PortfolioDeferred) => {
							const merged = {
								ok: true as const,
								wallet: critical.wallet,
								rpc: critical.rpc,
								solPrice: critical.solPrice,
								summary: critical.summary,
								history: critical.history,
								pools: d.pools,
								closed: d.closed,
								total: d.total,
							};
							return (
								<PortfolioContent
									data={merged}
									currency={currency}
									rangeFilter={rangeFilter}
									onRangeFilterChange={setRangeFilter}
									onClosedPageChange={onClosedPageChange}
								/>
							);
						}}
					</Await>
				</Suspense>
			</div>
		</DashboardShell>
	);
}
