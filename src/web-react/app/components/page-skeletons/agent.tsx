import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { ChartCardSkeleton, keys, StatCardSkeleton } from "./shared";

export function AgentPageSkeleton() {
	return (
		<div className="flex flex-col gap-3 py-4 md:gap-4 md:py-6">
			<div className="flex flex-wrap items-end justify-between gap-3 px-4 lg:px-6">
				<div className="space-y-1.5">
					<Skeleton className="h-3 w-40" />
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-4 w-64" />
				</div>
				<Skeleton className="h-9 w-20" />
			</div>
			<Card className="mx-4 py-0 lg:mx-6">
				<CardContent className="grid grid-cols-2 divide-x p-0 lg:grid-cols-4">
					{keys(4).map((k) => (
						<div key={k} className="space-y-1.5 p-4 md:p-5">
							<Skeleton className="h-3 w-16" />
							<Skeleton className="h-7 w-20" />
							<Skeleton className="h-3 w-24" />
						</div>
					))}
				</CardContent>
			</Card>
			<div className="grid grid-cols-2 gap-3 px-4 lg:px-6 @4xl/main:grid-cols-4">
				{keys(4).map((k) => (
					<StatCardSkeleton key={k} />
				))}
			</div>
			<div className="px-4 lg:px-6">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-8 w-56 rounded-lg" />
				</div>
				<Card className="mt-3 gap-3">
					<CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
						<div className="space-y-1.5">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-44" />
						</div>
						<Skeleton className="h-4 w-20" />
					</CardHeader>
					<CardContent className="space-y-2.5">
						{keys(4).map((r) => (
							<Skeleton key={r} className="h-4 w-full" />
						))}
					</CardContent>
				</Card>
			</div>
			<div className="grid grid-cols-1 items-start gap-3 px-4 lg:px-6 @4xl/main:grid-cols-[minmax(0,1fr)_340px]">
				<Card className="gap-0 overflow-hidden py-0">
					<CardHeader className="gap-3 border-b py-4">
						<div className="flex items-center justify-between">
							<div className="space-y-1.5">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-44" />
							</div>
							<Skeleton className="h-4 w-24" />
						</div>
						<Skeleton className="h-8 w-full" />
					</CardHeader>
					<CardContent className="space-y-3 px-4 py-4">
						{keys(3).map((k) => (
							<div key={k} className="flex gap-3">
								<div className="flex w-12 flex-col items-center gap-1.5">
									<Skeleton className="size-2.5 rounded-full" />
									<Skeleton className="h-3 w-10" />
								</div>
								<Skeleton className="h-20 flex-1" />
							</div>
						))}
					</CardContent>
				</Card>
				<div className="flex flex-col gap-3">
					<Card className="h-full">
						<CardHeader className="gap-1.5">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-40" />
						</CardHeader>
						<CardContent className="space-y-2">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-11/12" />
							<Skeleton className="h-4 w-4/5" />
						</CardContent>
					</Card>
					<ChartCardSkeleton blockClassName="h-56 w-full" />
				</div>
			</div>
		</div>
	);
}
