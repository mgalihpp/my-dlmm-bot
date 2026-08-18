import type { ClosedPool } from "@vexis/domain/portfolio.js";
import type { PositionPnLData } from "@vexis/domain/position.js";
import {
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { CurrencyValue } from "~/components/currency-value";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { ViewSwitcher } from "~/components/view-switcher";
import { useIsMobile } from "~/hooks/use-mobile";
import {
	fmtPct,
	meteoraUrl,
	pair,
	pnlClass,
	pnlSign,
	shortAddr,
	solscanUrl,
	timeAgo,
	tsLocal,
} from "~/lib/format";
import { cn } from "~/lib/utils";
import {
	getDefaultViewMode,
	readViewPreference,
	type ViewMode,
	writeViewPreference,
} from "~/lib/view-preference";

interface ClosedPayload {
	readonly pools: readonly ClosedPool[];
	readonly page: number;
	readonly pageSize: number;
	readonly totalCount: number;
}

interface DetailPayload {
	readonly ok: boolean;
	readonly error?: string;
	readonly positions?: readonly PositionPnLData[];
}

const DETAIL_COLUMNS = [
	"Position",
	"Deposit",
	"Withdraw",
	"Fees",
	"PnL USD",
	"PnL SOL",
	"Closed",
];

function ClosedDetailSkeleton() {
	return (
		<div className="space-y-3 px-4 py-4">
			<Skeleton className="mb-2 h-3 w-48" />
			{[0, 1, 2].map((n) => (
				<div key={n} className="space-y-3 rounded-lg border p-3">
					<Skeleton className="h-4 w-24" />
					<div className="grid grid-cols-2 gap-3">
						{DETAIL_COLUMNS.slice(1).map((col) => (
							<div key={col} className="space-y-1">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-4 w-24" />
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

function ClosedDetail({
	pool,
	pairLabel,
}: {
	pool: string;
	pairLabel: string;
}) {
	const fetcher = useFetcher<DetailPayload>();

	useEffect(() => {
		if (fetcher.state === "idle" && fetcher.data === undefined) {
			fetcher.load(`/api/closed-detail/${encodeURIComponent(pool)}`);
		}
	}, [pool, fetcher.state, fetcher.data, fetcher.load]);

	const data = fetcher.data;
	if (data === undefined) {
		return <ClosedDetailSkeleton />;
	}
	if (!data.ok) {
		return (
			<div className="py-6 text-center text-sm text-destructive">
				{data?.error ?? "Failed to load closed positions"}
			</div>
		);
	}
	const closed = (data.positions ?? []).filter((p) => p.isClosed);
	if (closed.length === 0) {
		return (
			<div className="py-6 text-center text-sm text-muted-foreground">
				No closed positions for {pairLabel}.
			</div>
		);
	}
	return (
		<div className="space-y-3 px-4 py-4">
			<p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
				CLOSED POSITIONS · {pairLabel.toUpperCase()}
			</p>
			{closed.map((pos) => {
				const pnlUsd = parseFloat(pos.pnlUsd);
				const pnlSol =
					pos.pnlSol != null ? parseFloat(String(pos.pnlSol)) : null;
				const pnlPct = parseFloat(pos.pnlPctChange);
				return (
					<div
						key={pos.positionAddress}
						className="space-y-3 rounded-lg border p-3"
					>
						<div className="flex items-center justify-between gap-3">
							<a
								href={solscanUrl(pos.positionAddress)}
								target="_blank"
								rel="noopener noreferrer"
								className="font-mono text-xs text-muted-foreground hover:underline"
							>
								{shortAddr(pos.positionAddress, 6)}
							</a>
							<span className="text-xs text-muted-foreground">
								{tsLocal(pos.closedAt)}
							</span>
						</div>
						<div className="grid grid-cols-2 gap-3 text-sm">
							<div>
								<p className="text-xs text-muted-foreground">Deposit</p>
								<CurrencyValue
									currency="usd"
									value={pos.allTimeDeposits.total.usd}
								/>
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Withdraw</p>
								<CurrencyValue
									currency="usd"
									value={pos.allTimeWithdrawals.total.usd}
								/>
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Fees</p>
								<CurrencyValue
									currency="usd"
									value={pos.allTimeFees.total.usd}
								/>
							</div>
							<div className={cn("tabular-nums", pnlClass(pnlSign(pnlUsd)))}>
								<p className="text-xs text-muted-foreground">PnL USD</p>
								<CurrencyValue currency="usd" value={pos.pnlUsd} />
								<p className="text-xs text-muted-foreground">
									{fmtPct(pnlPct)}
								</p>
							</div>
							<div className={cn("tabular-nums", pnlClass(pnlSign(pnlSol)))}>
								<p className="text-xs text-muted-foreground">PnL SOL</p>
								<CurrencyValue currency="sol" value={pnlSol} />
								<p className="text-xs text-muted-foreground">
									{fmtPct(pos.pnlSolPctChange ?? null)}
								</p>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}

function ClosedPoolCard({
	pool,
	onDetails,
}: {
	pool: ClosedPool;
	onDetails: () => void;
}) {
	const p = pair(pool.tokenX, pool.tokenY);
	const pnlUsd = parseFloat(pool.pnlUsd);
	const pnlSol = parseFloat(pool.pnlSol);
	return (
		<div className="rounded-xl border bg-card p-4 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<a
						href={meteoraUrl(pool.poolAddress)}
						target="_blank"
						rel="noopener noreferrer"
						className="block truncate font-semibold hover:underline"
					>
						{p}
					</a>
					<p className="text-xs text-muted-foreground">
						Closed {timeAgo(pool.lastClosedAt)}
					</p>
				</div>
				<span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
					Closed
				</span>
			</div>
			<div className="mt-5 grid grid-cols-3 gap-3">
				<div>
					<p className="text-xs text-muted-foreground">Deposit</p>
					<CurrencyValue currency="usd" value={pool.totalDeposit} />
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Withdraw</p>
					<CurrencyValue currency="usd" value={pool.totalWithdrawal} />
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Fees</p>
					<CurrencyValue currency="usd" value={pool.totalFee} />
				</div>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3">
				<div>
					<p className="text-xs text-muted-foreground">PnL USD</p>
					<span className={cn("tabular-nums", pnlClass(pnlSign(pnlUsd)))}>
						<CurrencyValue currency="usd" value={pool.pnlUsd} />
					</span>
					<p className="text-xs text-muted-foreground">
						{fmtPct(pool.pnlPctChange)}
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">PnL SOL</p>
					<span className={cn("tabular-nums", pnlClass(pnlSign(pnlSol)))}>
						<CurrencyValue currency="sol" value={pool.pnlSol} />
					</span>
					<p className="text-xs text-muted-foreground">
						{fmtPct(pool.pnlSolPctChange)}
					</p>
				</div>
			</div>
			<div className="mt-3 flex justify-end">
				<Button variant="ghost" size="sm" onClick={onDetails}>
					Details
				</Button>
			</div>
		</div>
	);
}

export function ClosedTable({ closed }: { closed: ClosedPayload }) {
	const isMobile = useIsMobile();
	const [expanded, setExpanded] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<ViewMode>("table");
	const [selectedCard, setSelectedCard] = useState<ClosedPool | null>(null);
	const [, setSearchParams] = useSearchParams();
	const { pools, page, pageSize, totalCount } = closed;
	const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));
	const from = (page - 1) * pageSize + 1;
	const to = from + pools.length - 1;
	const goToPage = (next: number) =>
		setSearchParams(next > 1 ? { closedPage: String(next) } : {});

	useEffect(() => {
		setViewMode(
			readViewPreference(
				window.localStorage,
				"vexis:portfolio:closed-view",
				getDefaultViewMode(window.innerWidth),
			),
		);
	}, []);

	const changeViewMode = (mode: ViewMode) => {
		setViewMode(mode);
		writeViewPreference(
			window.localStorage,
			"vexis:portfolio:closed-view",
			mode,
		);
	};

	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader className="flex flex-row items-center justify-between gap-3">
				<div>
					<CardTitle>Closed Positions</CardTitle>
					<p className="text-sm text-muted-foreground">
						{totalCount} pools closed in total
					</p>
				</div>
				<ViewSwitcher
					value={viewMode}
					onValueChange={changeViewMode}
					label="Closed positions view"
				/>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				{pools.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No closed positions.
					</div>
				) : viewMode === "card" ? (
					<div className="grid gap-3 px-4 pb-4 md:grid-cols-2 lg:px-6 xl:grid-cols-3">
						{pools.map((pool) => (
							<ClosedPoolCard
								key={pool.poolAddress}
								pool={pool}
								onDetails={() => setSelectedCard(pool)}
							/>
						))}
					</div>
				) : (
					<>
						<div className="overflow-x-auto">
							<Table>
								<TableHeader className="bg-muted/50">
									<TableRow>
										<TableHead className="w-8" />
										<TableHead>Pool</TableHead>
										<TableHead>Deposit</TableHead>
										<TableHead>Withdraw</TableHead>
										<TableHead>Fees</TableHead>
										<TableHead>PnL USD</TableHead>
										<TableHead>PnL SOL</TableHead>
										<TableHead>Closed</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{pools.map((pool) => {
										const p = pair(pool.tokenX, pool.tokenY);
										const pnlUsd = parseFloat(pool.pnlUsd);
										const pnlSol = parseFloat(pool.pnlSol);
										const isOpen = expanded === pool.poolAddress;
										return (
											<Fragment key={pool.poolAddress}>
												<TableRow
													key={pool.poolAddress}
													className="cursor-pointer"
													onClick={() =>
														setExpanded(isOpen ? null : pool.poolAddress)
													}
												>
													<TableCell>
														<ChevronDownIcon
															className={cn(
																"size-4 text-muted-foreground transition-transform",
																isOpen && "rotate-180",
															)}
														/>
													</TableCell>
													<TableCell>
														<div className="flex items-center gap-1.5 font-medium">
															<a
																href={meteoraUrl(pool.poolAddress)}
																target="_blank"
																rel="noopener noreferrer"
																className="hover:underline"
															>
																{p}
															</a>
														</div>
													</TableCell>
													<TableCell className="tabular-nums">
														<CurrencyValue
															currency="usd"
															value={pool.totalDeposit}
														/>
													</TableCell>
													<TableCell className="tabular-nums">
														<CurrencyValue
															currency="usd"
															value={pool.totalWithdrawal}
														/>
													</TableCell>
													<TableCell className="tabular-nums">
														<CurrencyValue
															currency="usd"
															value={pool.totalFee}
														/>
													</TableCell>
													<TableCell
														className={cn(
															"tabular-nums",
															pnlClass(pnlSign(pnlUsd)),
														)}
													>
														<CurrencyValue currency="usd" value={pool.pnlUsd} />
														<div className="text-xs text-muted-foreground">
															{fmtPct(pool.pnlPctChange)}
														</div>
													</TableCell>
													<TableCell
														className={cn(
															"tabular-nums",
															pnlClass(pnlSign(pnlSol)),
														)}
													>
														<CurrencyValue currency="sol" value={pool.pnlSol} />
														<div className="text-xs text-muted-foreground">
															{fmtPct(pool.pnlSolPctChange)}
														</div>
													</TableCell>
													<TableCell className="text-xs text-muted-foreground">
														{timeAgo(pool.lastClosedAt)}
													</TableCell>
												</TableRow>
												{isOpen ? (
													<TableRow key={`${pool.poolAddress}-detail`}>
														<TableCell colSpan={8} className="bg-muted/20 p-0">
															<ClosedDetail
																pool={pool.poolAddress}
																pairLabel={p}
															/>
														</TableCell>
													</TableRow>
												) : null}
											</Fragment>
										);
									})}
								</TableBody>
							</Table>
						</div>
						{totalCount > 0 ? (
							<div className="flex items-center justify-between px-4 py-3">
								<span className="text-sm text-muted-foreground">
									Showing {from}–{to} of {totalCount}
								</span>
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										disabled={page <= 1}
										onClick={() => goToPage(page - 1)}
									>
										<ChevronLeftIcon />
										Prev
									</Button>
									<span className="text-sm tabular-nums">
										Page {page} of {lastPage}
									</span>
									<Button
										variant="outline"
										size="sm"
										disabled={page >= lastPage}
										onClick={() => goToPage(page + 1)}
									>
										Next
										<ChevronRightIcon />
									</Button>
								</div>
							</div>
						) : null}
					</>
				)}
			</CardContent>
			<Sheet
				open={selectedCard !== null}
				onOpenChange={(open) => !open && setSelectedCard(null)}
			>
				<SheetContent
					side={isMobile ? "bottom" : "right"}
					className="!h-[90dvh] !max-h-[90dvh] overflow-y-auto sm:!h-auto sm:!max-h-none"
				>
					<SheetHeader>
						<SheetTitle>
							{selectedCard
								? pair(selectedCard.tokenX, selectedCard.tokenY)
								: "Closed position details"}
						</SheetTitle>
						<SheetDescription>
							{selectedCard
								? shortAddr(selectedCard.poolAddress, 6)
								: "Closed position details"}
						</SheetDescription>
					</SheetHeader>
					{selectedCard ? (
						<ClosedDetail
							pool={selectedCard.poolAddress}
							pairLabel={pair(selectedCard.tokenX, selectedCard.tokenY)}
						/>
					) : null}
				</SheetContent>
			</Sheet>
		</Card>
	);
}
