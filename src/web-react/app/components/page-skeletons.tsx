import { useLocation, useNavigation } from "react-router";
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

export function useIsNavigating(): boolean {
	const navigation = useNavigation();
	const { pathname } = useLocation();
	return (
		navigation.state === "loading" &&
		navigation.location !== undefined &&
		navigation.location.pathname !== pathname
	);
}

const STAT_CARD_GRID =
	"grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 dark:*:data-[slot=card]:bg-card";

function keys(n: number): number[] {
	return Array.from({ length: n }, (_, i) => i);
}

function StatCardSkeleton() {
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

function TableSkeleton({ columns, rows }: { columns: number; rows: number }) {
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
							{keys(rows).map((k) => (
								<TableRow key={k}>
									{keys(columns).map((k) => (
										<TableCell key={k}>
											<Skeleton
												className={
													k === 0 ? "h-8 w-8 rounded-md" : "h-4 w-full max-w-20"
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

export function SettingsPageSkeleton() {
	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-4 md:gap-6 md:py-6">
			<div className="px-4 lg:px-6">
				<Skeleton className="h-8 w-32" />
			</div>
			<div className="px-4 lg:px-6">
				<Card>
					<CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-6">
						<div className="space-y-2">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-5 w-40" />
							<Skeleton className="h-4 w-48" />
						</div>
						<Skeleton className="h-9 w-28" />
					</CardContent>
				</Card>
			</div>
			<div className="grid gap-4 px-4 md:grid-cols-[220px_1fr] lg:px-6">
				<div className="space-y-1">
					{keys(5).map((k) => (
						<Skeleton key={k} className="h-9 w-full" />
					))}
				</div>
				<Card>
					<CardContent className="space-y-4 p-4 md:p-6">
						{keys(5).map((k) => (
							<div key={k} className="flex items-center justify-between gap-4">
								<div className="space-y-1.5">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-4 w-48" />
								</div>
								<Skeleton className="h-9 w-20" />
							</div>
						))}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function GenericPageSkeleton() {
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

export function PageSkeleton() {
	const navigation = useNavigation();
	switch (navigation.location?.pathname) {
		case "/pools":
			return <PoolsPageSkeleton />;
		case "/portfolio":
			return <PortfolioPageSkeleton />;
		case "/agent":
			return <AgentPageSkeleton />;
		case "/settings":
			return <SettingsPageSkeleton />;
		default:
			return <GenericPageSkeleton />;
	}
}
