import { lazy, Suspense, useMemo } from "react";
import { ChartCardSkeleton } from "~/components/page-skeletons";
import type { Currency } from "~/lib/currency";
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
}: {
	data: PortfolioPayload;
	currency: Currency;
	rangeFilter: RangeFilter;
	onRangeFilterChange: (value: RangeFilter) => void;
}) {
	const metrics = useMemo(
		() =>
			computeOverviewMetrics(
				(data.closedAll ??
					data.closed?.pools ??
					[]) as unknown as import("@vexis/domain/portfolio.js").ClosedPool[],
				[],
				data.closed?.totalCount ?? 0,
				data.total ?? null,
				data.summary
					? { sol: data.summary.unrealizedSol, usd: data.summary.unrealizedUsd }
					: null,
			),
		[data.closedAll, data.closed, data.total, data.summary],
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
									total={data.total ?? null}
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
						<OverviewCalendar
							closed={
								(data.closedAll ??
									data.closed?.pools ??
								[]) as unknown as import("@vexis/domain/portfolio.js").ClosedPool[]
							}
							currency={currency}
						/>
					</div>
				</div>
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
					<Suspense
						fallback={<ChartCardSkeleton blockClassName="h-[300px] w-full" />}
					>
						<EquityChart
							closed={
								(data.closedAll ??
									data.closed?.pools ??
									[]) as unknown as import("@vexis/domain/portfolio.js").ClosedPool[]
							}
							currency={currency}
						/>
					</Suspense>
					<Suspense
						fallback={<ChartCardSkeleton blockClassName="h-[300px] w-full" />}
					>
						<DailyPnlChart
							closed={
								(data.closedAll ??
									data.closed?.pools ??
									[]) as unknown as import("@vexis/domain/portfolio.js").ClosedPool[]
							}
							currency={currency}
						/>
					</Suspense>
				</div>
			</div>
		</div>
	);
}
