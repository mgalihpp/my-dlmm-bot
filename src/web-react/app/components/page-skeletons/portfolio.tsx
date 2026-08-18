import { Skeleton } from "~/components/ui/skeleton";
import {
	ChartCardSkeleton,
	DonutCardSkeleton,
	keys,
	STAT_CARD_GRID,
	StatCardSkeleton,
	TableSkeleton,
} from "./shared";

export function PortfolioPageSkeleton() {
	return (
		<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
			<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
				<Skeleton className="h-8 w-44" />
				<div className="flex items-center gap-2">
					<Skeleton className="h-9 w-28" />
					<Skeleton className="h-9 w-20" />
				</div>
			</div>
			<div
				className={`${STAT_CARD_GRID} @xl/main:grid-cols-2 @5xl/main:grid-cols-5`}
			>
				{keys(5).map((k) => (
					<StatCardSkeleton key={k} />
				))}
			</div>
			<div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3">
				<div className="@4xl/main:col-span-2">
					<ChartCardSkeleton blockClassName="h-64 w-full" />
				</div>
				<DonutCardSkeleton />
			</div>
			<TableSkeleton columns={6} rows={6} />
			<TableSkeleton columns={5} rows={4} />
		</div>
	);
}
