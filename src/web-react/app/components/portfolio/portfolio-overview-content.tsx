import type { ClosedPool } from "@vexis/domain/portfolio.js";
import type { PositionPnLData } from "@vexis/domain/position.js";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";
import { ChartCardSkeleton } from "~/components/page-skeletons";
import type { Currency } from "~/lib/currency";
import {
	filterClosedByRange,
	filterPositionsByRange,
	type ResolvedRange,
} from "~/lib/date-range";
import {
	computeOverviewMetrics,
	computeOverviewMetricsFromRecords,
} from "~/lib/overview-analytics";
import type { PortfolioPayload } from "~/lib/server/portfolio.server";
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

type OverviewClosedResponse =
	| {
			ok: true;
			pools: readonly ClosedPool[];
			positions: readonly PositionPnLData[];
			byMonth: Readonly<Record<string, readonly PositionPnLData[]>>;
			totalCount: number;
			totalPositions: number;
	  }
	| { ok: false; error: string };

export function PortfolioOverviewContent({
	data,
	currency,
	dateRange,
}: {
	data: PortfolioPayload;
	currency: Currency;
	dateRange: ResolvedRange;
}) {
	const overviewFetcher = useFetcher<OverviewClosedResponse>();
	const overviewState = overviewFetcher.state;
	const hasOverviewData = !!overviewFetcher.data;
	useEffect(() => {
		if (overviewState !== "idle" || hasOverviewData) return;
		overviewFetcher.load("/api/overview-closed");
	}, [overviewState, hasOverviewData, overviewFetcher.load]);

	const overview = useMemo(() => {
		const d = overviewFetcher.data;
		if (d?.ok) return d;
		return null;
	}, [overviewFetcher.data]);

	const closedAll = overview?.pools ?? [];
	const positions = overview?.positions ?? [];
	const byMonth = overview?.byMonth ?? {};

	const filteredClosed = useMemo(
		() => filterClosedByRange(closedAll, dateRange),
		[closedAll, dateRange],
	);

	const [month, setMonth] = useState(() => new Date());
	const monthKey = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
	const monthPositions = useMemo(
		() => (byMonth[monthKey] as readonly PositionPnLData[] | undefined) ?? [],
		[byMonth, monthKey],
	);

	const filteredChartPositions = useMemo(
		() => filterPositionsByRange(positions, dateRange),
		[positions, dateRange],
	);
	const chartHasData = positions.length > 0;
	const isLoading = overviewState !== "idle" && !hasOverviewData;
	const topMetricsLoading = isLoading;
	const bounded = dateRange.kind === "bounded";
	const metrics = useMemo(() => {
		const hasPositions = chartHasData;
		if (hasPositions) {
			const source = filteredChartPositions;
			const records = source.map((p) => ({
				pnlSol: p.pnlSol,
				pnlUsd: p.pnlUsd,
				closedAt: p.closedAt,
			}));
			const total = bounded ? filteredChartPositions.length : positions.length;
			if (total > 0 || filteredChartPositions.length > 0) {
				return computeOverviewMetricsFromRecords(
					records,
					[],
					total,
					bounded ? null : (data.total ?? null),
					bounded || !data.summary
						? null
						: {
								sol: data.summary.unrealizedSol,
								usd: data.summary.unrealizedUsd,
							},
					currency,
					dateRange,
				);
			}
		}
		return computeOverviewMetrics(
			filteredClosed,
			[],
			bounded ? filteredClosed.length : (data.closed?.totalCount ?? 0),
			bounded ? null : (data.total ?? null),
			bounded || !data.summary
				? null
				: {
						sol: data.summary.unrealizedSol,
						usd: data.summary.unrealizedUsd,
					},
			currency,
			dateRange,
		);
	}, [
		filteredClosed,
		filteredChartPositions,
		positions,
		chartHasData,
		bounded,
		dateRange,
		data.closed,
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

	const monthLoading = isLoading && monthPositions.length === 0;
	const equityLoading = isLoading;

	return (
		<div className="relative">
			<div className="flex flex-col gap-2 px-4 pb-2 lg:px-6">
				{topMetricsLoading ? (
					<OverviewTopMetricsSkeleton />
				) : (
					<OverviewTopMetrics
						metrics={metrics}
						currency={currency}
						dateRange={dateRange}
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
								/>
							</>
						) : (
							<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
								Belum ada ringkasan aktif.
							</div>
						)}
					</div>
					<div className="lg:col-span-2">
						{monthLoading && monthPositions.length === 0 ? (
							<ChartCardSkeleton blockClassName="h-[360px] w-full" />
						) : (
							<Suspense
								fallback={
									<ChartCardSkeleton blockClassName="h-[360px] w-full" />
								}
							>
								<OverviewCalendar
									closed={monthPositions}
									currency={currency}
									month={month}
									onMonthChange={setMonth}
									loading={overviewState !== "idle"}
								/>
							</Suspense>
						)}
					</div>
				</div>
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
					<Suspense
						fallback={<ChartCardSkeleton blockClassName="h-[300px] w-full" />}
					>
						<EquityChart
							closed={filteredClosed}
							positions={filteredChartPositions}
							currency={currency}
							loading={equityLoading}
						/>
					</Suspense>
					<Suspense
						fallback={<ChartCardSkeleton blockClassName="h-[300px] w-full" />}
					>
						{topMetricsLoading ? (
							<ChartCardSkeleton blockClassName="h-[300px] w-full" />
						) : (
							<DailyPnlChart
								closed={filteredChartPositions}
								currency={currency}
							/>
						)}
					</Suspense>
				</div>
			</div>
		</div>
	);
}
