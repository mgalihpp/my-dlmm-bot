import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";

export const STAT_CARD_GRID =
	"grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 dark:*:data-[slot=card]:bg-card";

export function keys(n: number): number[] {
	return Array.from({ length: n }, (_, i) => i);
}

export function StatCardSkeleton() {
	return (
		<Card className="@container/card">
			<CardHeader className="gap-2">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-7 w-32" />
			</CardHeader>
			<CardFooter className="mt-auto">
				<Skeleton className="h-3 w-36" />
			</CardFooter>
		</Card>
	);
}

export function ChartCardSkeleton({
	blockClassName = "h-72 w-full",
}: {
	blockClassName?: string;
}) {
	return (
		<Card className="h-full">
			<CardHeader className="gap-1.5">
				<Skeleton className="h-5 w-40" />
				<Skeleton className="h-4 w-56" />
			</CardHeader>
			<CardContent>
				<Skeleton className={blockClassName} />
			</CardContent>
		</Card>
	);
}

export function ChartGridSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-2">
			<ChartCardSkeleton />
			<ChartCardSkeleton />
		</div>
	);
}

export function DonutCardSkeleton() {
	return (
		<Card className="h-full">
			<CardHeader>
				<Skeleton className="h-5 w-40" />
			</CardHeader>
			<CardContent className="flex flex-col items-center gap-4">
				<Skeleton className="mt-2 size-44 rounded-full" />
				<div className="flex gap-4">
					<Skeleton className="h-3 w-24" />
					<Skeleton className="h-3 w-24" />
				</div>
				<div className="w-full space-y-2">
					{keys(4).map((k) => (
						<Skeleton key={k} className="h-4 w-full" />
					))}
				</div>
			</CardContent>
		</Card>
	);
}

export function TableSkeleton({
	columns,
	rows,
}: {
	columns: number;
	rows: number;
}) {
	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
				<div className="space-y-1.5">
					<Skeleton className="h-5 w-32" />
					<Skeleton className="h-4 w-24" />
				</div>
				<Skeleton className="h-9 w-44" />
			</CardHeader>
			<CardContent className="px-0 pb-0">
				<div className="overflow-x-auto">
					<Table>
						<TableHeader className="bg-muted/50">
							<TableRow>
								{keys(columns).map((k) => (
									<TableHead key={k}>
										<Skeleton className="h-4 w-14" />
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{keys(rows).map((row) => (
								<TableRow key={row}>
									{keys(columns).map((column) => (
										<TableCell key={column}>
											<Skeleton
												className={
													column === 0
														? "h-8 w-8 rounded-md"
														: "h-4 w-full max-w-20"
												}
											/>
										</TableCell>
									))}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
