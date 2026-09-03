import type { PositionPnLData } from "@vexis/domain/position.js";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { ChartCardSkeleton } from "~/components/page-skeletons";
import type { Currency } from "~/lib/currency";
import {
	filterClosedByRange,
	filterPositionsByRange,
	monthKeysInRange,
	type ResolvedRange,
} from "~/lib/date-range";
import {
	computeClosedAggregates,
	computeOverviewMetrics,
	computeOverviewMetricsFromRecords,
} from "~/lib/overview-analytics";
import {
	type OverviewClosedResponse,
	resolveMonthStoreUpdate,
} from "~/lib/overview-month";
import type { PortfolioPayload } from "~/lib/server/portfolio.server";
import { useClosedMonthStore } from "~/stores/closed-month-cache";
import { ActiveSummaryCard, PerformanceCard } from "./overview-summary-cards";
import {
	OverviewTopMetrics,
	OverviewTopMetricsSkeleton,
} from "./overview-top-metrics";

const EquityChart = lazy(() =>
	import("./equity-chart").then((m) => ({ default: m.EquityChart })),
);
const OverviewCalendar = lazy(() =>
	import("./overview-calendar").then((m) => ({ default: m.OverviewCalendar })),
);
const DailyPnlChart = lazy(() =>
	import("./overview-daily-pnl").then((m) => ({ default: m.DailyPnlChart })),
);

export function PortfolioOverviewContent({
	data,
	currency,
	dateRange,
}: {
	data: PortfolioPayload;
	currency: Currency;
	dateRange: ResolvedRange;
}) {
	// Stage 1: pool summary — complete all-time coverage without the per-pool
	// positionPnl fan-out, so top metrics and equity render fast.
	const summaryFetcher = useFetcher<OverviewClosedResponse>();
	useEffect(() => {
		if (summaryFetcher.state !== "idle" || summaryFetcher.data) return;
		summaryFetcher.load("/api/overview-closed?poolsOnly=1");
	}, [summaryFetcher]);

	const summary = summaryFetcher.data?.ok === true ? summaryFetcher.data : null;

	const [month, setMonth] = useState(() => new Date());
	const monthKey = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;

	// Stage 2: position detail for the visible calendar month only, accumulated
	// in the month cache so navigation never refetches a loaded month.
	const entries = useClosedMonthStore((s) => s.entries);
	const setMonths = useClosedMonthStore((s) => s.setMonths);
	const cachedMonth = entries[monthKey]?.data;
	const detailFetcher = useFetcher<OverviewClosedResponse>();
	const [loadingMonth, setLoadingMonth] = useState<string | null>(null);
	const attempted = useRef<Set<string>>(new Set());
	// Snapshot of the response visible when a request starts. Right after
	// load() the fetcher still exposes the previous month's idle payload,
	// which must never be stored under the newly requested month.
	const dataAtRequest = useRef<OverviewClosedResponse | undefined>(undefined);
	useEffect(() => {
		if (cachedMonth || loadingMonth !== null || detailFetcher.state !== "idle")
			return;
		if (attempted.current.has(monthKey)) return;
		attempted.current.add(monthKey);
		dataAtRequest.current = detailFetcher.data;
		setLoadingMonth(monthKey);
		detailFetcher.load(`/api/overview-closed?month=${monthKey}`);
	}, [monthKey, cachedMonth, loadingMonth, detailFetcher]);
	useEffect(() => {
		if (loadingMonth === null) return;
		if (detailFetcher.state !== "idle") return;
		const update = resolveMonthStoreUpdate(
			loadingMonth,
			dataAtRequest.current,
			detailFetcher.data,
		);
		if (update === null) return;
		if (update.length > 0) setMonths(update);
		setLoadingMonth(null);
	}, [detailFetcher.data, detailFetcher.state, loadingMonth, setMonths]);

	const closedAll = useMemo(() => summary?.pools ?? [], [summary]);
	const totalCount = summary?.totalCount ?? data.closed?.totalCount ?? 0;
	const apiTotalPositions = summary?.apiTotalPositions ?? 0;

	const monthPositions = useMemo(
		() => (cachedMonth ?? []) as readonly PositionPnLData[],
		[cachedMonth],
	);

	const loadedPositions = useMemo(
		() => Object.values(entries).flatMap((e) => e.data),
		[entries],
	);

	// Position-level views only when every month in the selected range is
	// loaded; otherwise pool aggregates (complete) avoid undercount bias.
	const positionsCoverRange =
		dateRange.kind === "bounded" &&
		monthKeysInRange(dateRange.from, dateRange.to).every(
			(k) => entries[k] !== undefined,
		) &&
		monthKeysInRange(dateRange.from, dateRange.to).length > 0;

	const filteredClosed = useMemo(
		() => filterClosedByRange(closedAll, dateRange),
		[closedAll, dateRange],
	);

	const filteredChartPositions = useMemo(
		() =>
			positionsCoverRange
				? filterPositionsByRange(loadedPositions, dateRange)
				: [],
		[positionsCoverRange, loadedPositions, dateRange],
	);
	const bounded = dateRange.kind === "bounded";
	const countBasis = positionsCoverRange ? "positions" : "pools";
	const aggregates = useMemo(
		() => computeClosedAggregates(filteredClosed),
		[filteredClosed],
	);
	const avgDenominator =
		positionsCoverRange && filteredChartPositions.length > 0
			? filteredChartPositions.length
			: bounded
				? Math.max(1, filteredClosed.length)
				: Math.max(1, apiTotalPositions > 0 ? apiTotalPositions : totalCount);
	const metrics = useMemo(() => {
		if (positionsCoverRange && filteredChartPositions.length > 0) {
			const records = filteredChartPositions.map((p) => ({
				pnlSol: p.pnlSol,
				pnlUsd: p.pnlUsd,
				closedAt: p.closedAt,
			}));
			return computeOverviewMetricsFromRecords(
				records,
				[],
				filteredChartPositions.length,
				null,
				data.summary
					? {
							sol: data.summary.unrealizedSol,
							usd: data.summary.unrealizedUsd,
						}
					: null,
				currency,
			);
		}
		return computeOverviewMetrics(
			filteredClosed,
			[],
			bounded ? filteredClosed.length : totalCount,
			bounded ? null : (data.total ?? null),
			bounded || !data.summary
				? null
				: {
						sol: data.summary.unrealizedSol,
						usd: data.summary.unrealizedUsd,
					},
			currency,
		);
	}, [
		positionsCoverRange,
		filteredChartPositions,
		filteredClosed,
		bounded,
		totalCount,
		data.total,
		data.summary,
		currency,
	]);

	if (!data.summary && !data.closed) {
		return (
			<div className="px-2 py-8 text-center text-sm text-muted-foreground">
				Belum ada data portfolio. Hubungkan wallet dengan posisi aktif atau
				tunggu sinkronisasi pertama.
			</div>
		);
	}

	const summaryLoading = summaryFetcher.state !== "idle" && !summary;
	const monthLoading =
		!cachedMonth && (loadingMonth !== null || detailFetcher.state !== "idle");

	return (
		<div className="relative">
			<div className="flex flex-col gap-2 px-4 pb-2 lg:px-6">
				{summaryLoading ? (
					<OverviewTopMetricsSkeleton />
				) : (
					<OverviewTopMetrics
						metrics={metrics}
						currency={currency}
						dateRange={dateRange}
						countBasis={countBasis}
						positionCount={apiTotalPositions > 0 ? apiTotalPositions : null}
					/>
				)}
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-3 lg:items-stretch">
					<div className="grid grid-rows-2 gap-2">
						{data.summary ? (
							<>
								<ActiveSummaryCard summary={data.summary} currency={currency} />
								<PerformanceCard
									summary={data.summary}
									total={bounded ? null : (data.total ?? null)}
									metrics={metrics}
									currency={currency}
									aggregates={aggregates}
									avgDenominator={avgDenominator}
									countBasis={countBasis}
								/>
							</>
						) : (
							<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
								Belum ada ringkasan aktif.
							</div>
						)}
					</div>
					<div className="lg:col-span-2">
						<Suspense
							fallback={<ChartCardSkeleton blockClassName="h-[360px] w-full" />}
						>
							<OverviewCalendar
								closed={monthPositions}
								currency={currency}
								month={month}
								onMonthChange={setMonth}
								loading={monthLoading}
							/>
						</Suspense>
					</div>
				</div>
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
					<Suspense
						fallback={<ChartCardSkeleton blockClassName="h-[300px] w-full" />}
					>
						<EquityChart
							closed={filteredClosed}
							positions={
								positionsCoverRange ? filteredChartPositions : undefined
							}
							currency={currency}
							loading={summaryLoading}
						/>
					</Suspense>
					<Suspense
						fallback={<ChartCardSkeleton blockClassName="h-[300px] w-full" />}
					>
						{summaryLoading ? (
							<ChartCardSkeleton blockClassName="h-[300px] w-full" />
						) : (
							<DailyPnlChart
								closed={filteredChartPositions}
								pools={filteredClosed}
								currency={currency}
							/>
						)}
					</Suspense>
				</div>
			</div>
		</div>
	);
}
