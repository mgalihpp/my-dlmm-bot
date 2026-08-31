// biome-ignore-all lint/suspicious/noArrayIndexKey: skeleton uses positional keys
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { ChartCardSkeleton } from "./shared";

function TopMetricsSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
			{Array.from({ length: 5 }).map((_, i) => (
				<Card key={i} data-size="sm" className="py-3">
					<CardContent className="flex h-full flex-col justify-center gap-2">
						<div className="flex items-center gap-1.5">
							<Skeleton className="h-3 w-14" />
							<Skeleton className="size-3 rounded-full" />
							<span className="ml-auto">
								<Skeleton className="h-4 w-8 rounded" />
							</span>
						</div>
						<Skeleton className="h-7 w-24" />
						{i > 0 && i < 4 ? (
							<div className="flex items-center gap-2 pt-1">
								<Skeleton className="size-12 rounded-full" />
								<div className="flex flex-1 flex-col gap-1">
									<Skeleton className="h-3 w-full" />
									<Skeleton className="h-3 w-2/3" />
								</div>
							</div>
						) : null}
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function SummaryCardSkeleton() {
	return (
		<Card data-size="sm" className="py-3">
			<CardHeader className="flex flex-row items-center justify-between">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-3 w-20" />
			</CardHeader>
			<CardContent className="flex flex-1 flex-col gap-2.5">
				<div className="grid flex-1 grid-cols-2 gap-3">
					<div className="flex flex-col gap-2">
						{Array.from({ length: 3 }).map((_, i) => (
							<div key={i} className="flex items-center justify-between">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-3 w-14" />
							</div>
						))}
					</div>
					<div className="flex flex-col gap-2">
						{Array.from({ length: 3 }).map((_, i) => (
							<div key={i} className="flex items-center justify-between">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-3 w-14" />
							</div>
						))}
					</div>
				</div>
				<Skeleton className="h-10 w-full rounded-md" />
			</CardContent>
		</Card>
	);
}

export function PortfolioPageSkeleton() {
	return (
		<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
			<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
				<Skeleton className="h-8 w-44" />
				<div className="flex items-center gap-2">
					<Skeleton className="h-9 w-28" />
					<Skeleton className="h-9 w-20" />
					<Skeleton className="h-9 w-20" />
				</div>
			</div>
			<div className="flex flex-col gap-2 px-4 pb-2 lg:px-6">
				<TopMetricsSkeleton />
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-3 lg:items-stretch">
					<div className="grid grid-rows-2 gap-2">
						<SummaryCardSkeleton />
						<SummaryCardSkeleton />
					</div>
					<div className="lg:col-span-2">
						<ChartCardSkeleton blockClassName="h-[360px] w-full" />
					</div>
				</div>
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
					<ChartCardSkeleton blockClassName="h-[300px] w-full" />
					<ChartCardSkeleton blockClassName="h-[300px] w-full" />
				</div>
			</div>
		</div>
	);
}
