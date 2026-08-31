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
import {
	selectMissingChartMonths,
	selectMonthStatus,
	useClosedMonthStore,
} from "~/stores/closed-month-cache";
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

type ClosedPositionsResponse =
	| { ok: true; positions: PositionPnLData[]; month: string | null }
	| { ok: false; error: string };

type ClosedPoolsResponse =
	| { ok: true; pools: readonly ClosedPool[] }
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
	const closedAllFetcher = useFetcher<ClosedPoolsResponse>();
	const closedAllState = closedAllFetcher.state;
	const hasClosedAllData = !!closedAllFetcher.data;
	useEffect(() => {
		if (closedAllState !== "idle" || hasClosedAllData) return;
		closedAllFetcher.load("/api/closed-all");
	}, [closedAllState, hasClosedAllData, closedAllFetcher.load]);
	const closedAll = useMemo(() => {
		const d = closedAllFetcher.data;
		if (d?.ok && Array.isArray(d.pools)) return d.pools;
		return [];
	}, [closedAllFetcher.data]);
	const filteredClosed = useMemo(
		() => filterClosedByRange(closedAll, dateRange),
		[closedAll, dateRange],
	);
	const monthFetcher = useFetcher<ClosedPositionsResponse>();
	const monthFetcherState = monthFetcher.state;
	const monthFetcherData = monthFetcher.data;

	const [month, setMonth] = useState(() => new Date());
	const monthKey = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
	const currentMonthKey = useMemo(() => {
		const now = new Date();
		return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
	}, []);
	const entries = useClosedMonthStore((s) => s.entries);
	const setMonths = useClosedMonthStore((s) => s.setMonths);
	const closedMonthState = useMemo(
		() => ({ entries, setMonths }) as Parameters<typeof selectMonthStatus>[0],
		[entries, setMonths],
	);
	const monthPositions = useMemo(
		() => entries[monthKey]?.data ?? [],
		[entries, monthKey],
	);
	const chartMonths = useMemo(() => {
		const months: string[] = [];
		const now = new Date();
		for (let i = 11; i >= 0; i--) {
			const d = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
			);
			months.push(
				`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
			);
		}
		return months;
	}, []);
	const monthStatus = selectMonthStatus(
		closedMonthState,
		monthKey,
		currentMonthKey,
		Date.now(),
	);
	const missingMonths = selectMissingChartMonths(
		closedMonthState,
		chartMonths,
		currentMonthKey,
	);

	useEffect(() => {
		if (monthStatus === "fresh") return;
		if (monthFetcherState !== "idle") return;
		monthFetcher.load(`/api/closed-positions?month=${monthKey}`);
	}, [monthStatus, monthFetcherState, monthKey, monthFetcher.load]);

	useEffect(() => {
		const d = monthFetcherData;
		if (!d?.ok || !Array.isArray(d.positions)) return;
		setMonths([{ key: d.month ?? monthKey, data: d.positions }]);
	}, [monthFetcherData, monthKey, setMonths]);

	useEffect(() => {
		if (missingMonths === "") return;
		const missing = missingMonths.split(",");
		let cancelled = false;
		void (async () => {
			const results = await Promise.all(
				missing.map((key) =>
					fetch(`/api/closed-positions?month=${key}`, {
						credentials: "same-origin",
					})
						.then((r) => {
							if (!r.ok) return null as unknown as ClosedPositionsResponse;
							return r.json() as Promise<ClosedPositionsResponse>;
						})
						.then((d) => {
							if (!d?.ok || !Array.isArray(d.positions)) return null;
							const resolved = d.month ?? key;
							if (!/^\d{4}-\d{2}$/.test(resolved)) return null;
							return { key: resolved, data: d.positions };
						})
						.catch(() => null),
				),
			);
			if (cancelled) return;
			const valid = results.filter(
				(r): r is { key: string; data: PositionPnLData[] } => r !== null,
			);
			if (valid.length === 0) return;
			setMonths(valid);
		})();
		return () => {
			cancelled = true;
		};
	}, [missingMonths, setMonths]);

	const chartAggregated = useMemo(
		() => Object.values(entries).flatMap((entry) => entry.data),
		[entries],
	);
	const filteredChartPositions = useMemo(
		() => filterPositionsByRange(chartAggregated, dateRange),
		[chartAggregated, dateRange],
	);
	const chartHasData = chartAggregated.length > 0;
	const chartMissingCount = useMemo(
		() => chartMonths.filter((k) => !(k in entries)).length,
		[chartMonths, entries],
	);
	const topMetricsLoading = useMemo(
		() => !chartHasData && chartMissingCount > 0,
		[chartHasData, chartMissingCount],
	);
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
			const total = bounded
				? filteredChartPositions.length
				: chartAggregated.length;
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
		chartAggregated,
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

	const monthLoading =
		monthFetcherState !== "idle" && monthPositions.length === 0;
	const closedAllLoading = closedAllState !== "idle" && !hasClosedAllData;
	const equityLoading = closedAllLoading || topMetricsLoading;

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
									loading={monthFetcherState !== "idle"}
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
						{chartHasData ? (
							<DailyPnlChart
								closed={filteredChartPositions}
								currency={currency}
							/>
						) : (
							<ChartCardSkeleton blockClassName="h-[300px] w-full" />
						)}
					</Suspense>
				</div>
			</div>
		</div>
	);
}
