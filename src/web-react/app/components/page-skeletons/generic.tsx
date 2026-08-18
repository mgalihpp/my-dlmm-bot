import { Skeleton } from "~/components/ui/skeleton";
import {
	keys,
	STAT_CARD_GRID,
	StatCardSkeleton,
	TableSkeleton,
} from "./shared";

export function GenericPageSkeleton() {
	return (
		<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
			<div className="px-4 lg:px-6">
				<Skeleton className="h-8 w-40" />
			</div>
			<div
				className={`${STAT_CARD_GRID} @xl/main:grid-cols-2 @5xl/main:grid-cols-4`}
			>
				{keys(4).map((k) => (
					<StatCardSkeleton key={k} />
				))}
			</div>
			<TableSkeleton columns={6} rows={4} />
		</div>
	);
}
