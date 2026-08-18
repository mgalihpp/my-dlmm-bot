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
import { EDITABLE_FIELDS } from "~/lib/settings";

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
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:py-8">
			<div className="space-y-2">
				<Skeleton className="h-9 w-32" />
				<Skeleton className="h-4 w-52" />
			</div>
			<div className="flex flex-col items-center gap-4 py-2">
				<Skeleton className="size-24 rounded-full" />
				<div className="flex w-full flex-col items-center gap-2">
					<Skeleton className="h-6 w-32" />
					<Skeleton className="h-5 w-48" />
				</div>
			</div>
			<div className="flex flex-col gap-6">
				{keys(4).map((group) => (
					<section key={group}>
						<Skeleton className="mb-2 ml-1 h-4 w-20" />
						<div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
							{keys(group === 2 ? 2 : 1).map((row) => (
								<div
									key={row}
									className="flex h-[73px] items-center gap-3 border-b border-border/60 px-4 last:border-b-0"
								>
									<Skeleton className="size-9 rounded-xl" />
									<div className="flex min-w-0 flex-1 flex-col gap-2">
										<Skeleton className="h-4 w-24" />
										<Skeleton className="h-3 w-44" />
									</div>
									<Skeleton className="size-5" />
								</div>
							))}
						</div>
					</section>
				))}
				<Skeleton className="h-14 w-full rounded-2xl" />
			</div>
		</div>
	);
}

export function SettingsCategoryPageSkeleton() {
	const pathname = useLocation().pathname;
	const category = pathname.split("/").filter(Boolean).at(-1);
	const isAgent = category === "agent";
	const isPreferences = category === "preferences";
	const fieldCount = EDITABLE_FIELDS.filter(
		(field) => field.section === category,
	).length;

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 md:py-8">
			<div className="space-y-3">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-9 w-36" />
			</div>
			{isAgent && (
				<Card>
					<CardHeader className="flex-row items-center justify-between gap-3">
						<Skeleton className="h-5 w-28" />
						<Skeleton className="h-6 w-16 rounded-full" />
					</CardHeader>
					<CardContent className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
						<Skeleton className="h-4 w-64" />
						<Skeleton className="h-9 w-28" />
					</CardContent>
				</Card>
			)}
			{isPreferences ? (
				<Card>
					<CardHeader className="border-b">
						<Skeleton className="h-5 w-24" />
						<Skeleton className="h-4 w-56" />
					</CardHeader>
					<CardContent className="space-y-4 pt-5">
						<Skeleton className="h-4 w-16" />
						<div className="grid gap-2 sm:grid-cols-2">
							<Skeleton className="h-24 rounded-lg" />
							<Skeleton className="h-24 rounded-lg" />
						</div>
					</CardContent>
				</Card>
			) : (
				<Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
					<CardHeader className="border-b border-border/60 bg-muted/20 px-4 py-3">
						<Skeleton className="h-5 w-28" />
					</CardHeader>
					<CardContent className="space-y-0 p-0">
						{keys(Math.max(fieldCount, 3)).map((field) => (
							<div
								key={field}
								className="flex min-h-14 items-center gap-4 border-b border-border/60 px-4 last:border-b-0"
							>
								<Skeleton className="h-4 w-32" />
								<Skeleton className="ml-auto h-9 w-[42%]" />
							</div>
						))}
					</CardContent>
				</Card>
			)}
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
			if (navigation.location?.pathname.startsWith("/settings/")) {
				return <SettingsCategoryPageSkeleton />;
			}
			return <GenericPageSkeleton />;
	}
}
