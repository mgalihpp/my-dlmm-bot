import type { PositionPnLData } from "@vexis/domain/position.js";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ChartCardSkeleton } from "~/components/page-skeletons";
import type { Currency } from "~/lib/currency";
import {
	filterClosedByRange,
	filterPositionsByRange,
	type ResolvedRange,
} from "~/lib/date-range";
import { computeOverviewMetrics } from "~/lib/overview-analytics";
import type { PortfolioPayload } from "~/lib/server/portfolio.server";
import { OverviewCalendar } from "./overview-calendar";
import { DailyPnlChart } from "./overview-daily-pnl";
import { ActiveSummaryCard, PerformanceCard } from "./overview-summary-cards";
import { OverviewTopMetrics } from "./overview-top-metrics";
import type { RangeFilter } from "./portfolio-page";

const EquityChart = lazy(() =>
	import("./equity-chart").then((m) => ({ default: m.EquityChart })),
);

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
	const closedAll = data.closedAll ?? data.closed?.pools ?? [];
	const filteredClosed = useMemo(
		() => filterClosedByRange(closedAll, dateRange),
		[closedAll, dateRange],
	);
	const [fetchedPositions, setFetchedPositions] = useState<
		readonly PositionPnLData[] | null
	>(null);
	const [positionsLoading, setPositionsLoading] = useState(false);
	useEffect(() => {
		if (data.closedPositions && data.closedPositions.length > 0) return;
		let cancelled = false;
		setPositionsLoading(true);
		fetch("/api/closed-positions", { credentials: "same-origin" })
			.then((r) => (r.ok ? r.json() : null))
			.then((j) => {
				if (cancelled) return;
				if (j?.ok && Array.isArray(j.positions))
					setFetchedPositions(j.positions as PositionPnLData[]);
			})
			.catch(() => {})
			.finally(() => {
				if (!cancelled) setPositionsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [data.closedPositions]);
	const closedPositions = ((data.closedPositions &&
	data.closedPositions.length > 0
		? data.closedPositions
		: fetchedPositions) ?? []) as readonly PositionPnLData[];
	const filteredPositions = useMemo(
		() => filterPositionsByRange(closedPositions, dateRange),
		[closedPositions, dateRange],
	);
	const [month, setMonth] = useState(() => new Date());
	const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
	const [monthCache, setMonthCache] = useState<
		Map<string, readonly PositionPnLData[]>
	>(() => new Map());
	const [monthLoading, setMonthLoading] = useState(false);
	const monthPositions = monthCache.get(monthKey) ?? [];
	useEffect(() => {
		if (monthCache.has(monthKey)) return;
		let cancelled = false;
		setMonthLoading(true);
		fetch(`/api/closed-positions?month=${monthKey}`, {
			credentials: "same-origin",
		})
			.then((r) => (r.ok ? r.json() : null))
			.then((j) => {
				if (cancelled) return;
				if (j?.ok && Array.isArray(j.positions)) {
					setMonthCache((prev) => {
						const next = new Map(prev);
						next.set(monthKey, j.positions as PositionPnLData[]);
						return next;
					});
				} else if (j?.ok) {
					setMonthCache((prev) => {
						const next = new Map(prev);
						next.set(monthKey, []);
						return next;
					});
				}
			})
			.catch(() => {
				if (!cancelled)
					setMonthCache((prev) => {
						const next = new Map(prev);
						next.set(monthKey, []);
						return next;
					});
			})
			.finally(() => {
				if (!cancelled) setMonthLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [monthKey, monthCache]);
	const bounded = dateRange.kind === "bounded";
	const metrics = useMemo(
		() =>
			computeOverviewMetrics(
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
			),
		[filteredClosed, bounded, data.closed, data.total, data.summary],
	);

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
								loading={monthLoading}
							/>
						)}
					</div>
				</div>
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
					<Suspense
						fallback={<ChartCardSkeleton blockClassName="h-[300px] w-full" />}
					>
						<EquityChart closed={filteredClosed} currency={currency} />
					</Suspense>
					<Suspense
						fallback={<ChartCardSkeleton blockClassName="h-[300px] w-full" />}
					>
						{positionsLoading && filteredPositions.length === 0 ? (
							<ChartCardSkeleton blockClassName="h-[300px] w-full" />
						) : (
							<DailyPnlChart closed={filteredPositions} currency={currency} />
						)}
					</Suspense>
				</div>
			</div>
		</div>
	);
}
