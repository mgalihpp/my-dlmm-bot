import type { PositionPnLData } from "@vexis/domain/position.js";
import {
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import { Fragment, memo, useCallback, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { CurrencyIcon } from "~/components/currency-icon";
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
	fmtPnl,
	meteoraUrl,
	pair,
	pnlClass,
	pnlSign,
	shortAddr,
	solscanUrl,
	timeAgo,
	tsLocal,
} from "~/lib/format";
import { fmtAmount } from "~/lib/pools";
import type { ClosedPoolWithIcons } from "~/lib/server/portfolio.server";
import { cn } from "~/lib/utils";
import {
	getDefaultViewMode,
	readViewPreference,
	type ViewMode,
	writeViewPreference,
} from "~/lib/view-preference";
import type { Currency } from "./portfolio-page";

type ClosedPool = ClosedPoolWithIcons;

interface ClosedPayload {
	readonly pools: readonly ClosedPool[];
	readonly page: number;
	readonly pageSize: number;
	readonly totalCount: number;
}

function TokenIcon({ icon, symbol }: { icon?: string | null; symbol: string }) {
	if (icon) {
		return (
			<img
				src={icon}
				alt={symbol}
				className="size-5 rounded-full object-cover"
				onError={(event) => {
					event.currentTarget.style.display = "none";
				}}
			/>
		);
	}
	return (
		<span className="flex size-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold">
			{symbol.slice(0, 2).toUpperCase()}
		</span>
	);
}

function ClosedPair({ pool }: { pool: ClosedPool }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span className="flex -space-x-1">
				<TokenIcon icon={pool.tokenXIcon} symbol={pool.tokenX} />
				<TokenIcon icon={pool.tokenYIcon} symbol={pool.tokenY} />
			</span>
			{pair(pool.tokenX, pool.tokenY)}
		</span>
	);
}

interface DetailPayload {
	readonly ok: boolean;
	readonly error?: string;
	readonly positions?: readonly PositionPnLData[];
}

function PortfolioAmount({
	usd,
	sol,
	currency,
	solPrice,
}: {
	usd: string | number | null | undefined;
	sol?: string | number | null;
	currency: Currency;
	solPrice: number | null;
}) {
	const formatted =
		sol != null
			? fmtPnl(usd, sol, currency)
			: fmtAmount(usd, currency, solPrice);
	const value = currency === "sol" ? formatted.replace(/ SOL$/, "") : formatted;
	return (
		<span className="inline-flex items-center gap-1 tabular-nums">
			<span>{value}</span>
			{value !== "-" ? <CurrencyIcon currency={currency} decorative /> : null}
		</span>
	);
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
	currency,
	solPrice,
	layout = "card",
}: {
	pool: string;
	pairLabel: string;
	currency: Currency;
	solPrice: number | null;
	layout?: "card" | "table";
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
	if (layout === "table") {
		return (
			<div className="overflow-x-auto px-4 py-4">
				<Table className="min-w-[760px] rounded-md border">
					<TableHeader className="bg-muted/50">
						<TableRow>
							{DETAIL_COLUMNS.map((column) => (
								<TableHead key={column}>{column}</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{closed.map((pos) => {
							const pnlUsd = parseFloat(pos.pnlUsd);
							const pnlSol =
								pos.pnlSol != null ? parseFloat(String(pos.pnlSol)) : null;
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
										<PortfolioAmount
											usd={pos.allTimeDeposits.total.usd}
											currency={currency}
											solPrice={solPrice}
										/>
									</TableCell>
									<TableCell className="tabular-nums">
										<PortfolioAmount
											usd={pos.allTimeWithdrawals.total.usd}
											currency={currency}
											solPrice={solPrice}
										/>
									</TableCell>
									<TableCell className="tabular-nums">
										<PortfolioAmount
											usd={pos.allTimeFees.total.usd}
											currency={currency}
											solPrice={solPrice}
										/>
									</TableCell>
									<TableCell
										className={cn("tabular-nums", pnlClass(pnlSign(pnlUsd)))}
									>
										<PortfolioAmount
											usd={pos.pnlUsd}
											currency="usd"
											solPrice={solPrice}
										/>
										<div className="text-xs text-muted-foreground">
											{fmtPct(pos.pnlPctChange)}
										</div>
									</TableCell>
									<TableCell
										className={cn("tabular-nums", pnlClass(pnlSign(pnlSol)))}
									>
										<PortfolioAmount
											usd={pos.pnlSol}
											sol={pnlSol}
											currency="sol"
											solPrice={solPrice}
										/>
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
								<PortfolioAmount
									usd={pos.allTimeDeposits.total.usd}
									currency={currency}
									solPrice={solPrice}
								/>
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Withdraw</p>
								<PortfolioAmount
									usd={pos.allTimeWithdrawals.total.usd}
									currency={currency}
									solPrice={solPrice}
								/>
							</div>
							<div>
								<p className="text-xs text-muted-foreground">Fees</p>
								<PortfolioAmount
									usd={pos.allTimeFees.total.usd}
									currency={currency}
									solPrice={solPrice}
								/>
							</div>
							<div className={cn("tabular-nums", pnlClass(pnlSign(pnlUsd)))}>
								<p className="text-xs text-muted-foreground">PnL USD</p>
								<PortfolioAmount
									usd={pos.pnlUsd}
									currency="usd"
									solPrice={solPrice}
								/>
								<p className="text-xs text-muted-foreground">
									{fmtPct(pnlPct)}
								</p>
							</div>
							<div className={cn("tabular-nums", pnlClass(pnlSign(pnlSol)))}>
								<p className="text-xs text-muted-foreground">PnL SOL</p>
								<PortfolioAmount
									usd={pos.pnlSol}
									sol={pnlSol}
									currency="sol"
									solPrice={solPrice}
								/>
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

const ClosedPoolCard = memo(function ClosedPoolCard({
	pool,
	onDetails,
	currency,
	solPrice,
}: {
	pool: ClosedPool;
	onDetails: (pool: ClosedPool) => void;
	currency: Currency;
	solPrice: number | null;
}) {
	const pnlUsd = parseFloat(pool.pnlUsd);
	const pnlSol = parseFloat(pool.pnlSol);
	return (
		// biome-ignore lint/a11y/useSemanticElements: card contains links and cannot be a button
		<div
			className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50"
			role="button"
			tabIndex={0}
			onClick={() => onDetails(pool)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onDetails(pool);
				}
			}}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<a
						href={meteoraUrl(pool.poolAddress)}
						target="_blank"
						rel="noopener noreferrer"
						className="block truncate font-semibold hover:underline"
						onClick={(event) => event.stopPropagation()}
					>
						<ClosedPair pool={pool} />
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
					<PortfolioAmount
						usd={pool.totalDeposit}
						currency={currency}
						solPrice={solPrice}
					/>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Withdraw</p>
					<PortfolioAmount
						usd={pool.totalWithdrawal}
						currency={currency}
						solPrice={solPrice}
					/>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Fees</p>
					<PortfolioAmount
						usd={pool.totalFee}
						currency={currency}
						solPrice={solPrice}
					/>
				</div>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3">
				<div>
					<p className="text-xs text-muted-foreground">PnL USD</p>
					<span className={cn("tabular-nums", pnlClass(pnlSign(pnlUsd)))}>
						<PortfolioAmount
							usd={pool.pnlUsd}
							sol={pool.pnlSol}
							currency="usd"
							solPrice={solPrice}
						/>
					</span>
					<p className="text-xs text-muted-foreground">
						{fmtPct(pool.pnlPctChange)}
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">PnL SOL</p>
					<span className={cn("tabular-nums", pnlClass(pnlSign(pnlSol)))}>
						<PortfolioAmount
							usd={pool.pnlUsd}
							sol={pool.pnlSol}
							currency="sol"
							solPrice={solPrice}
						/>
					</span>
					<p className="text-xs text-muted-foreground">
						{fmtPct(pool.pnlSolPctChange)}
					</p>
				</div>
			</div>
			<div className="mt-3 flex justify-end">
				<ChevronRightIcon
					className="size-5 text-muted-foreground"
					aria-hidden="true"
				/>
			</div>
		</div>
	);
});

function ClosedTableView({
	closed,
	currency,
	solPrice,
	onPageChange,
}: {
	closed: ClosedPayload;
	currency: Currency;
	solPrice: number | null;
	onPageChange: (page: number) => void;
}) {
	const isMobile = useIsMobile();
	const [expanded, setExpanded] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<ViewMode>("table");
	const [viewReady, setViewReady] = useState(false);
	const [selectedCard, setSelectedCard] = useState<ClosedPool | null>(null);
	const { pools, page, pageSize, totalCount } = closed;
	const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));
	const from = (page - 1) * pageSize + 1;
	const to = from + pools.length - 1;
	const selectCard = useCallback((pool: ClosedPool) => {
		setSelectedCard(pool);
	}, []);

	useEffect(() => {
		setViewMode(
			readViewPreference(
				window.localStorage,
				"vexis:portfolio:closed-view",
				getDefaultViewMode(window.innerWidth),
			),
		);
		setViewReady(true);
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
				) : !viewReady ? null : viewMode === "card" ? (
					<div className="grid gap-3 px-4 pb-4 md:grid-cols-2 lg:px-6 xl:grid-cols-3">
						{pools.map((pool) => (
							<ClosedPoolCard
								key={pool.poolAddress}
								pool={pool}
								currency={currency}
								solPrice={solPrice}
								onDetails={selectCard}
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
																<ClosedPair pool={pool} />
															</a>
														</div>
													</TableCell>
													<TableCell className="tabular-nums">
														<PortfolioAmount
															usd={pool.totalDeposit}
															currency={currency}
															solPrice={solPrice}
														/>
													</TableCell>
													<TableCell className="tabular-nums">
														<PortfolioAmount
															usd={pool.totalWithdrawal}
															currency={currency}
															solPrice={solPrice}
														/>
													</TableCell>
													<TableCell className="tabular-nums">
														<PortfolioAmount
															usd={pool.totalFee}
															currency={currency}
															solPrice={solPrice}
														/>
													</TableCell>
													<TableCell
														className={cn(
															"tabular-nums",
															pnlClass(pnlSign(pnlUsd)),
														)}
													>
														<PortfolioAmount
															usd={pool.pnlUsd}
															sol={pool.pnlSol}
															currency="usd"
															solPrice={solPrice}
														/>
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
														<PortfolioAmount
															usd={pool.pnlUsd}
															sol={pool.pnlSol}
															currency="sol"
															solPrice={solPrice}
														/>
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
																currency={currency}
																solPrice={solPrice}
																layout="table"
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
										onClick={() => onPageChange(page - 1)}
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
										onClick={() => onPageChange(page + 1)}
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
							currency={currency}
							solPrice={solPrice}
						/>
					) : null}
				</SheetContent>
			</Sheet>
		</Card>
	);
}

export const ClosedTable = memo(
	ClosedTableView,
	(prev, next) =>
		prev.currency === next.currency &&
		(prev.currency === "usd" || prev.solPrice === next.solPrice) &&
		prev.onPageChange === next.onPageChange &&
		JSON.stringify(prev.closed) === JSON.stringify(next.closed),
);
