import type { ClosedPool } from "@vexis/domain/portfolio.js";
import type { PositionPnLData } from "@vexis/domain/position.js";
import {
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import {
	fmtPct,
	fmtSol,
	fmtUsd,
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
		<div className="px-4 py-4">
			<Skeleton className="mb-2 h-3 w-48" />
			<div className="overflow-x-auto rounded-md border">
				<Table>
					<TableHeader className="bg-muted/50">
						<TableRow>
							{DETAIL_COLUMNS.map((col) => (
								<TableHead key={col}>
									<Skeleton className="h-4 w-14" />
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{[0, 1, 2].map((n) => (
							<TableRow key={n}>
								{DETAIL_COLUMNS.map((col) => (
									<TableCell key={col}>
										<Skeleton
											className={
												col === "Position" ? "h-4 w-24" : "h-4 w-full max-w-16"
											}
										/>
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
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
		<div className="px-4 py-4">
			<p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
				CLOSED POSITIONS · {pairLabel.toUpperCase()}
			</p>
			<div className="overflow-x-auto rounded-md border">
				<Table>
					<TableHeader className="bg-muted/50">
						<TableRow>
							<TableHead>Position</TableHead>
							<TableHead>Deposit</TableHead>
							<TableHead>Withdraw</TableHead>
							<TableHead>Fees</TableHead>
							<TableHead>PnL USD</TableHead>
							<TableHead>PnL SOL</TableHead>
							<TableHead>Closed</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{closed.map((pos) => {
							const pnlUsd = parseFloat(pos.pnlUsd);
							const pnlSol =
								pos.pnlSol != null ? parseFloat(String(pos.pnlSol)) : null;
							const pnlPct = parseFloat(pos.pnlPctChange);
							return (
								<TableRow key={pos.positionAddress}>
									<TableCell>
										<a
											href={solscanUrl(pos.positionAddress)}
											target="_blank"
											rel="noopener noreferrer"
											className="font-mono text-xs text-muted-foreground hover:underline"
										>
											{shortAddr(pos.positionAddress, 6)}
										</a>
									</TableCell>
									<TableCell className="tabular-nums">
										{fmtUsd(pos.allTimeDeposits.total.usd)}
									</TableCell>
									<TableCell className="tabular-nums">
										{fmtUsd(pos.allTimeWithdrawals.total.usd)}
									</TableCell>
									<TableCell className="tabular-nums">
										{fmtUsd(pos.allTimeFees.total.usd)}
									</TableCell>
									<TableCell
										className={cn("tabular-nums", pnlClass(pnlSign(pnlUsd)))}
									>
										{fmtUsd(pos.pnlUsd)}
										<div className="text-xs text-muted-foreground">
											{fmtPct(pnlPct)}
										</div>
									</TableCell>
									<TableCell
										className={cn("tabular-nums", pnlClass(pnlSign(pnlSol)))}
									>
										{fmtSol(pnlSol)}
										<div className="text-xs text-muted-foreground">
											{fmtPct(pos.pnlSolPctChange ?? null)}
										</div>
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{tsLocal(pos.closedAt)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

export function ClosedTable({ closed }: { closed: ClosedPayload }) {
	const [expanded, setExpanded] = useState<string | null>(null);
	const [, setSearchParams] = useSearchParams();
	const { pools, page, pageSize, totalCount } = closed;
	const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));
	const from = (page - 1) * pageSize + 1;
	const to = from + pools.length - 1;
	const goToPage = (next: number) =>
		setSearchParams(next > 1 ? { closedPage: String(next) } : {});

	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle>Closed Positions</CardTitle>
					<p className="text-sm text-muted-foreground">
						{totalCount} pools closed in total
					</p>
				</div>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				{pools.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No closed positions.
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
														{fmtUsd(pool.totalDeposit)}
													</TableCell>
													<TableCell className="tabular-nums">
														{fmtUsd(pool.totalWithdrawal)}
													</TableCell>
													<TableCell className="tabular-nums">
														{fmtUsd(pool.totalFee)}
													</TableCell>
													<TableCell
														className={cn(
															"tabular-nums",
															pnlClass(pnlSign(pnlUsd)),
														)}
													>
														{fmtUsd(pool.pnlUsd)}
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
														{fmtSol(pool.pnlSol)}
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
		</Card>
	);
}
