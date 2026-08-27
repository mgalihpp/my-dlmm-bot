import { lazy, Suspense } from "react";
import {
	ChartCardSkeleton,
	DonutCardSkeleton,
} from "~/components/page-skeletons";
import type { Currency } from "~/lib/currency";
import type { PortfolioPayload } from "~/lib/server/portfolio.server";
import type { PnlCardData } from "../../../../pnl-card/types.js";
import type { RangeFilter } from "./portfolio-page";
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

export function PortfolioContent({
	data,
	currency,
	rangeFilter,
	onRangeFilterChange,
	onClosedPageChange,
	onPnlCard,
}: {
	data: PortfolioPayload;
	currency: Currency;
	rangeFilter: RangeFilter;
	onRangeFilterChange: (value: RangeFilter) => void;
	onClosedPageChange: (page: number) => void;
	onPnlCard?: (data: PnlCardData) => void;
}) {
	return (
		<>
			<StatCards
				summary={data.summary!}
				total={data.total!}
				history={data.history!}
				currency={currency}
				rangeFilter={rangeFilter}
				onRangeFilterChange={onRangeFilterChange}
			/>
			<div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3">
				<div className="@4xl/main:col-span-2">
					<Suspense
						fallback={<ChartCardSkeleton blockClassName="h-64 w-full" />}
					>
						<EquityChart history={data.history!} currency={currency} />
					</Suspense>
				</div>
				<Suspense fallback={<DonutCardSkeleton />}>
					<AllocationDonut
						pools={data.pools!}
						summary={data.summary!}
						currency={currency}
					/>
				</Suspense>
			</div>
			<Suspense fallback={<PositionsTableSkeleton />}>
				<PositionsTable
					pools={data.pools!}
					rangeFilter={rangeFilter}
					onRangeFilterChange={onRangeFilterChange}
					currency={currency}
					solPrice={data.solPrice}
					onPnlCard={onPnlCard}
					wallet={data.wallet}
				/>
			</Suspense>
			<Suspense fallback={<ClosedTableSkeleton />}>
				<ClosedTable
					closed={data.closed!}
					currency={currency}
					onPageChange={onClosedPageChange}
					onPnlCard={onPnlCard}
					wallet={data.wallet}
				/>
			</Suspense>
		</>
	);
}
