import { Skeleton } from "~/components/ui/skeleton";
import {
	ChartGridSkeleton,
	keys,
	STAT_CARD_GRID,
	StatCardSkeleton,
	TableSkeleton,
} from "./shared";

export function PoolsPageSkeleton() {
	return (
		<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
			<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
				<div className="space-y-2">
					<Skeleton className="h-8 w-40" />
					<Skeleton className="h-4 w-56" />
				</div>
				<div className="flex items-center gap-2">
					<Skeleton className="h-9 w-28" />
					<Skeleton className="h-9 w-24" />
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
			<ChartGridSkeleton />
			<TableSkeleton columns={11} rows={6} />
		</div>
	);
}
