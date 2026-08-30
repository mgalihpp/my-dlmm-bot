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
import { OverviewCalendar } from "./overview-calendar";
import { DailyPnlChart } from "./overview-daily-pnl";
import { ActiveSummaryCard, PerformanceCard } from "./overview-summary-cards";
import { OverviewTopMetrics } from "./overview-top-metrics";
import type { RangeFilter } from "./portfolio-page";

const EquityChart = lazy(() =>
	import("./equity-chart").then((m) => ({ default: m.EquityChart })),
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
	rangeFilter: RangeFilter;
	onRangeFilterChange: (value: RangeFilter) => void;
}) {
	const closedAllFetcher = useFetcher<ClosedPoolsResponse>();
	useEffect(() => {
		if (closedAllFetcher.state !== "idle" || closedAllFetcher.data) return;
		closedAllFetcher.load("/api/closed-all");
	}, [closedAllFetcher.data, closedAllFetcher.state, closedAllFetcher.load]);
	const closedAll = useMemo(() => {
		const d = closedAllFetcher.data;
		if (d?.ok && Array.isArray(d.pools)) return d.pools;
		return data.closedAll ?? data.closed?.pools ?? [];
	}, [closedAllFetcher.data, data.closedAll, data.closed]);
	const filteredClosed = useMemo(
		() => filterClosedByRange(closedAll, dateRange),
		[closedAll, dateRange],
	);
	const closedFetcher = useFetcher<ClosedPositionsResponse>();
	const monthFetcher = useFetcher<ClosedPositionsResponse>();
	const chartFetcher = useFetcher<ClosedPositionsResponse>();

	useEffect(() => {
		if (data.closedPositions && data.closedPositions.length > 0) return;
		if (closedFetcher.state !== "idle" || closedFetcher.data) return;
		closedFetcher.load("/api/closed-positions");
	}, [data.closedPositions, closedFetcher]);

	const closedPositions = useMemo(() => {
		if (data.closedPositions && data.closedPositions.length > 0)
			return data.closedPositions;
		const d = closedFetcher.data;
		if (d?.ok && Array.isArray(d.positions)) return d.positions;
		return [] as readonly PositionPnLData[];
	}, [data.closedPositions, closedFetcher.data]);

	const positionsLoading =
		closedFetcher.state !== "idle" && closedPositions.length === 0;

	const filteredPositions = useMemo(
		() => filterPositionsByRange(closedPositions, dateRange),
		[closedPositions, dateRange],
	);
	const [month, setMonth] = useState(() => new Date());
	const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
	const currentMonthKey = useMemo(() => {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	}, []);
	const [monthCache, setMonthCache] = useState<
		Map<string, { data: readonly PositionPnLData[]; at: number }>
	>(() => new Map());
	const monthPositions = monthCache.get(monthKey)?.data ?? [];
	const chartMonths = useMemo(() => {
		const months: string[] = [];
		const now = new Date();
		for (let i = 11; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
			months.push(
				`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
			);
		}
		return months;
	}, []);
	useEffect(() => {
		const missing = [...chartMonths].reverse().find((k) => !monthCache.has(k));
		if (!missing) return;
		if (chartFetcher.state !== "idle") return;
		chartFetcher.load(`/api/closed-positions?month=${missing}`);
	}, [chartMonths, monthCache, chartFetcher]);

	useEffect(() => {
		const entry = monthCache.get(monthKey);
		if (entry) {
			const isCurrent = monthKey === currentMonthKey;
			if (!isCurrent) return;
			if (Date.now() - entry.at < 5 * 60 * 1000) return;
		}
		if (monthFetcher.state !== "idle") return;
		monthFetcher.load(`/api/closed-positions?month=${monthKey}`);
	}, [monthKey, monthCache, monthFetcher, currentMonthKey]);

	useEffect(() => {
		const d = monthFetcher.data as ClosedPositionsResponse | undefined;
		if (!d?.ok || !Array.isArray((d as { positions?: unknown }).positions))
			return;
		const key = (d as { month?: string | null }).month ?? monthKey;
		const existing = monthCache.get(key);
		if (existing) {
			const isCurrent = key === currentMonthKey;
			if (!isCurrent) return;
			if (Date.now() - existing.at < 5 * 60 * 1000) return;
		}
		setMonthCache((prev) => {
			const next = new Map(prev);
			next.set(key, {
				data: (d as { positions: PositionPnLData[] }).positions,
				at: Date.now(),
			});
			return next;
		});
	}, [monthFetcher.data, monthCache, monthKey, currentMonthKey]);

	useEffect(() => {
		const d = chartFetcher.data as ClosedPositionsResponse | undefined;
		if (!d?.ok || !Array.isArray((d as { positions?: unknown }).positions))
			return;
		const key = (d as { month?: string | null }).month ?? "";
		if (!key || !/^\d{4}-\d{2}$/.test(key)) return;
		const existing = monthCache.get(key);
		if (existing) {
			const isCurrent = key === currentMonthKey;
			if (!isCurrent) return;
			if (Date.now() - existing.at < 5 * 60 * 1000) return;
		}
		setMonthCache((prev) => {
			const next = new Map(prev);
			next.set(key, {
				data: (d as { positions: PositionPnLData[] }).positions,
				at: Date.now(),
			});
			return next;
		});
	}, [chartFetcher.data, monthCache, currentMonthKey]);

	const chartAggregated = useMemo(
		() => [...monthCache.values()].flatMap((v) => v.data),
		[monthCache],
	);
	const filteredChartPositions = useMemo(
		() => filterPositionsByRange(chartAggregated, dateRange),
		[chartAggregated, dateRange],
	);
	const chartLoading =
		chartFetcher.state !== "idle" && chartAggregated.length === 0;
	const _hasAllChartMonths = useMemo(
		() => chartMonths.every((k) => monthCache.has(k)),
		[chartMonths, monthCache],
	);

	useEffect(() => {
		if (monthKey !== currentMonthKey) return;
		const id = setInterval(() => {
			const entry = monthCache.get(currentMonthKey);
			if (!entry) return;
			if (Date.now() - entry.at > 5 * 60 * 1000) {
				setMonthCache((prev) => {
					const next = new Map(prev);
					next.delete(currentMonthKey);
					return next;
				});
			}
		}, 60 * 1000);
		return () => clearInterval(id);
	}, [monthKey, currentMonthKey, monthCache]);

	const monthLoading =
		monthFetcher.state !== "idle" && monthPositions.length === 0;
	const bounded = dateRange.kind === "bounded";
	const metrics = useMemo(() => {
		const hasPositions = closedPositions.length > 0;
		if (hasPositions) {
			const records = filteredPositions.map((p) => ({
				pnlSol: p.pnlSol,
				pnlUsd: p.pnlUsd,
				closedAt: p.closedAt,
			}));
			const total = bounded ? filteredPositions.length : closedPositions.length;
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
			);
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
		);
	}, [
		filteredClosed,
		filteredPositions,
		closedPositions,
		bounded,
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

	return (
		<div className="relative">
			<div className="flex flex-col gap-2 px-4 pb-2 lg:px-6">
				<OverviewTopMetrics metrics={metrics} currency={currency} />
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
							<OverviewCalendar
								closed={monthPositions}
								currency={currency}
								month={month}
								onMonthChange={setMonth}
								loading={monthFetcher.state !== "idle"}
							/>
						)}
					</div>
				</div>
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
					<Suspense
						fallback={<ChartCardSkeleton blockClassName="h-[300px] w-full" />}
					>
						<EquityChart
							closed={filteredClosed}
							positions={filteredPositions}
							currency={currency}
						/>
					</Suspense>
					<Suspense
						fallback={<ChartCardSkeleton blockClassName="h-[300px] w-full" />}
					>
						{(chartAggregated.length > 0 ? chartLoading : positionsLoading) &&
						(chartAggregated.length > 0
							? filteredChartPositions.length === 0
							: filteredPositions.length === 0) ? (
							<ChartCardSkeleton blockClassName="h-[300px] w-full" />
						) : (
							<DailyPnlChart
								closed={
									chartAggregated.length > 0
										? filteredChartPositions
										: filteredPositions
								}
								currency={currency}
							/>
						)}
					</Suspense>
				</div>
			</div>
		</div>
	);
}
