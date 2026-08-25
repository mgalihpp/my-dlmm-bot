import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
	Await,
	useLoaderData,
	useRevalidator,
	useSearchParams,
} from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import {
	ChartCardSkeleton,
	DonutCardSkeleton,
	PageSkeleton,
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
import { PortfolioHeader } from "./portfolio-header";
import {
	ClosedTableSkeleton,
	PositionsTableSkeleton,
} from "./portfolio-table-skeletons";
import { StatCards } from "./stat-cards";

const EquityChart = lazy(() =>
	import("./equity-chart").then((m) => ({ default: m.EquityChart })),
);
const AllocationDonut = lazy(() =>
	import("./allocation-donut").then((m) => ({ default: m.AllocationDonut })),
);
const PositionsTable = lazy(() =>
	import("./positions-table-grid").then((m) => ({ default: m.PositionsTable })),
);
const ClosedTable = lazy(() =>
	import("./closed-table-grid").then((m) => ({ default: m.ClosedTable })),
);

export type { Currency } from "~/lib/currency";

export type RangeFilter = "all" | "in-range" | "oor";

type LoaderData = {
	critical: PortfolioCritical | { ok: false; error: string; solPrice: null };
	deferred: Promise<PortfolioDeferred>;
};

function PortfolioPageContent({
	critical,
	deferred,
}: {
	critical: PortfolioCritical;
	deferred: Promise<PortfolioDeferred>;
}) {
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

	useEffect(() => {
		setStoredCurrency(readStoredCurrency(window.localStorage));
	}, []);

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

				{/* Critical: stat cards render instantly; only total PnL streams — fallback identical so no flash */}
				<Suspense
					fallback={
						<StatCards
							summary={critical.summary}
							total={{
								totalPnlUsd: "-",
								totalPnlSol: "-",
								totalPnlPctChange: "-",
								totalPnlSolPctChange: "-",
							}}
							history={critical.history}
							currency={currency}
							rangeFilter={rangeFilter}
							onRangeFilterChange={setRangeFilter}
						/>
					}
				>
					<Await
						resolve={deferred}
						errorElement={
							<StatCards
								summary={critical.summary}
								total={{
									totalPnlUsd: "-",
									totalPnlSol: "-",
									totalPnlPctChange: "-",
									totalPnlSolPctChange: "-",
								}}
								history={critical.history}
								currency={currency}
								rangeFilter={rangeFilter}
								onRangeFilterChange={setRangeFilter}
							/>
						}
					>
						{(d: PortfolioDeferred) => (
							<StatCards
								summary={critical.summary}
								total={d.total}
								history={critical.history}
								currency={currency}
								rangeFilter={rangeFilter}
								onRangeFilterChange={setRangeFilter}
							/>
						)}
					</Await>
				</Suspense>

				<div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3">
					<div className="@4xl/main:col-span-2">
						<Suspense
							fallback={<ChartCardSkeleton blockClassName="h-64 w-full" />}
						>
							<EquityChart history={critical.history} currency={currency} />
						</Suspense>
					</div>
					<Suspense fallback={<DonutCardSkeleton />}>
						<AllocationDonut
							pools={critical.pools}
							summary={critical.summary}
							currency={currency}
						/>
					</Suspense>
				</div>

				{/* Deferred tables stream in background — skeleton stays in place, no whole-page flash */}
				<Suspense fallback={<PositionsTableSkeleton />}>
					<Await
						resolve={deferred}
						errorElement={
							<LoadErrorCard
								title="Failed to load positions"
								error="Deferred load failed"
							/>
						}
					>
						{(d: PortfolioDeferred) => (
							<PositionsTable
								pools={d.pools}
								rangeFilter={rangeFilter}
								onRangeFilterChange={setRangeFilter}
								currency={currency}
								solPrice={critical.solPrice}
							/>
						)}
					</Await>
				</Suspense>
				<Suspense fallback={<ClosedTableSkeleton />}>
					<Await resolve={deferred}>
						{(d: PortfolioDeferred) => (
							<ClosedTable
								closed={d.closed}
								currency={currency}
								onPageChange={onClosedPageChange}
							/>
						)}
					</Await>
				</Suspense>
			</div>
		</DashboardShell>
	);
}

export function PortfolioPage() {
	const data = useLoaderData<LoaderData>();
	const isNavigating = useIsNavigating();
	const [searchParams] = useSearchParams();
	const [storedCurrency, setStoredCurrency] = useState<Currency | null>(null);
	const currency = resolveCurrency(
		searchParams.get("currency"),
		storedCurrency,
	);
	const { revalidate, state } = useRevalidator();

	useEffect(() => {
		setStoredCurrency(readStoredCurrency(window.localStorage));
	}, []);

	if (isNavigating) {
		return (
			<DashboardShell title="Portfolio">
				<PageSkeleton />
			</DashboardShell>
		);
	}

	return (
		<Suspense
			fallback={
				<DashboardShell title="Portfolio">
					<PageSkeleton />
				</DashboardShell>
			}
		>
			<Await
				resolve={data.critical}
				errorElement={
					<DashboardShell title="Portfolio">
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
							<LoadErrorCard
								title="Failed to load portfolio"
								error="Loader failed"
							/>
						</div>
					</DashboardShell>
				}
			>
				{(
					critical:
						| PortfolioCritical
						| { ok: false; error: string; solPrice: null },
				) => {
					if (!critical.ok) {
						return (
							<DashboardShell
								title="Portfolio"
								wallet={undefined}
								rpc={undefined}
							>
								<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
									<PortfolioHeader
										currency={currency}
										onCurrencyChange={() => {}}
										onRefresh={revalidate}
										refreshing={state === "loading"}
									/>
									<LoadErrorCard
										title="Failed to load portfolio"
										error={critical.error}
									/>
								</div>
							</DashboardShell>
						);
					}
					return (
						<PortfolioPageContent
							critical={critical}
							deferred={data.deferred}
						/>
					);
				}}
			</Await>
		</Suspense>
	);
}
