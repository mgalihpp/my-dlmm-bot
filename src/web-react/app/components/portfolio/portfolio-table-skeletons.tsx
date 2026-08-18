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

const slots = (count: number) =>
	Array.from({ length: count }, (_, index) => index);

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
			<CardHeader className="flex flex-row items-center justify-between gap-3">
				<div className="space-y-2">
					<Skeleton className={`h-5 ${titleWidth}`} />
					<Skeleton className="h-4 w-32" />
				</div>
				<Skeleton className="h-9 w-36" />
			</CardHeader>
			<CardContent className="px-0 pb-0">
				<div className="overflow-x-auto">
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
											<Skeleton
												className={
													column === 0
														? "h-8 w-8 rounded-md"
														: "h-4 w-full max-w-24"
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

export function PositionsTableSkeleton() {
	return <TableCardSkeleton titleWidth="w-36" columns={9} rows={5} />;
}

export function ClosedTableSkeleton() {
	return <TableCardSkeleton titleWidth="w-40" columns={8} rows={4} />;
}
