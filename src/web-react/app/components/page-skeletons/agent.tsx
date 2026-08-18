import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
	ChartCardSkeleton,
	keys,
	STAT_CARD_GRID,
	StatCardSkeleton,
} from "./shared";

export function AgentPageSkeleton() {
	return (
		<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
			<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-9 w-20" />
			</div>
			<Card className="mx-4 lg:mx-6">
				<CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-6">
					<div className="flex items-center gap-3">
						<Skeleton className="size-2.5 rounded-full" />
						<div className="space-y-1.5">
							<Skeleton className="h-3 w-32" />
							<Skeleton className="h-5 w-44" />
							<Skeleton className="h-4 w-56" />
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Skeleton className="h-5 w-16 rounded-full" />
						<Skeleton className="h-5 w-16 rounded-full" />
					</div>
				</CardContent>
			</Card>
			<div
				className={`${STAT_CARD_GRID} @xl/main:grid-cols-2 @5xl/main:grid-cols-6`}
			>
				{keys(6).map((k) => (
					<StatCardSkeleton key={k} />
				))}
			</div>
			<div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-2">
				<Card className="h-full">
					<CardHeader className="gap-1.5">
						<Skeleton className="h-5 w-36" />
						<Skeleton className="h-4 w-40" />
					</CardHeader>
					<CardContent className="space-y-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-11/12" />
						<Skeleton className="h-4 w-4/5" />
					</CardContent>
				</Card>
				<ChartCardSkeleton blockClassName="h-64 w-full" />
			</div>
			<Card className="mx-4 lg:mx-6">
				<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
					<div className="space-y-1.5">
						<Skeleton className="h-5 w-36" />
						<Skeleton className="h-4 w-24" />
					</div>
					<Skeleton className="h-9 w-64" />
				</CardHeader>
				<CardContent className="space-y-3 px-4 py-3">
					{keys(3).map((k) => (
						<div key={k} className="space-y-2">
							<div className="flex items-center gap-2">
								<Skeleton className="h-4 w-12" />
								<Skeleton className="h-4 w-28" />
							</div>
							<Skeleton className="h-4 w-full" />
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}
