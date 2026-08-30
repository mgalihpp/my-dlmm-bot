import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";

const slots = (count: number) => Array.from({ length: count }, (_, index) => index);

function TableCardSkeleton({
	titleWidth,
	columns,
	rows,
}: {
	titleWidth: string;
	columns: number;
	rows: number;
}) {
	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
				<div className="space-y-2">
					<Skeleton className={`h-5 ${titleWidth}`} />
					<Skeleton className="h-4 w-32" />
				</div>
				<div className="flex items-center gap-2">
					<Skeleton className="h-9 w-24" />
					<Skeleton className="h-9 w-36" />
				</div>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				<div className="hidden lg:block overflow-x-auto">
					<Table>
						<TableHeader className="bg-muted/50">
							<TableRow>
								{slots(columns).map((column) => (
									<TableHead key={column}>
										<Skeleton className="h-4 w-16" />
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{slots(rows).map((row) => (
								<TableRow key={row}>
									{slots(columns).map((column) => (
										<TableCell key={column}>
											<Skeleton className={column === 0 ? "h-8 w-8 rounded-md" : "h-4 w-full max-w-24"} />
										</TableCell>
									))}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
				<div className="grid gap-3 px-4 pb-4 md:grid-cols-2 lg:hidden xl:grid-cols-3">
					{slots(6).map((i) => (
						<div key={i} className="rounded-xl border p-4 space-y-3">
							<div className="flex items-start justify-between gap-3">
								<div className="flex items-center gap-2">
									<Skeleton className="size-9 rounded-full" />
									<div className="space-y-1">
										<Skeleton className="h-4 w-24" />
										<Skeleton className="h-3 w-16" />
									</div>
								</div>
								<Skeleton className="h-5 w-16 rounded-full" />
							</div>
							<div className="grid grid-cols-3 gap-3">
								<div className="space-y-1">
									<Skeleton className="h-3 w-12" />
									<Skeleton className="h-4 w-16" />
								</div>
								<div className="space-y-1">
									<Skeleton className="h-3 w-12" />
									<Skeleton className="h-4 w-16" />
								</div>
								<div className="space-y-1">
									<Skeleton className="h-3 w-12" />
									<Skeleton className="h-4 w-16" />
								</div>
							</div>
							<Skeleton className="h-12 w-full rounded-md" />
							<div className="flex items-center justify-between">
								<Skeleton className="h-3 w-20" />
								<Skeleton className="h-7 w-16 rounded-md" />
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

export function PositionsTableSkeleton() {
	return <TableCardSkeleton titleWidth="w-36" columns={9} rows={5} />;
}

export function ClosedTableSkeleton() {
	return <TableCardSkeleton titleWidth="w-40" columns={8} rows={4} />;
}
