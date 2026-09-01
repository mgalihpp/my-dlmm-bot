import {
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	ShareIcon,
} from "lucide-react";
import { Fragment, memo, useCallback, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
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
import { useViewPreference } from "~/hooks/use-view-preference";
import {
	fmtPct,
	meteoraUrl,
	pair,
	pnlClass,
	pnlSign,
	shortAddr,
	timeAgo,
} from "~/lib/format";
import type { ClosedPoolWithIcons } from "~/lib/server/portfolio.server";
import { cn } from "~/lib/utils";
import { ClosedDetail, PortfolioAmount } from "./closed-detail";
import { ClosedPnlShareDialog } from "./closed-pnl-share-dialog.js";
import { ClosedPair, ClosedPoolCard } from "./closed-pool-card";
import type { Currency } from "./portfolio-page";

type ClosedPool = ClosedPoolWithIcons;
interface ClosedPayload {
	readonly pools: readonly ClosedPool[];
	readonly page: number;
	readonly pageSize: number;
	readonly totalCount: number;
}

function ClosedTableView({
	closed,
	currency,
	onPageChange,
}: {
	closed: ClosedPayload;
	currency: Currency;
	onPageChange: (page: number) => void;
}) {
	const isMobile = useIsMobile();
	const [expanded, setExpanded] = useState<string | null>(null);
	const [viewMode, setViewMode] = useViewPreference(
		"vexis:portfolio:closed-view",
	);
	const [selectedCard, setSelectedCard] = useState<ClosedPool | null>(null);
	const [sharePool, setSharePool] = useState<ClosedPool | null>(null);
	const { pools, page, pageSize, totalCount } = closed;
	const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));
	const from = (page - 1) * pageSize + 1;
	const to = from + pools.length - 1;
	const selectCard = useCallback(
		(pool: ClosedPool) => setSelectedCard(pool),
		[],
	);

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
					onValueChange={setViewMode}
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
								currency={currency}
								onDetails={selectCard}
							/>
						))}
					</div>
				) : (
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
									<TableHead>Action</TableHead>
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
													<a
														href={meteoraUrl(pool.poolAddress)}
														target="_blank"
														rel="noopener noreferrer"
														className="font-medium hover:underline"
													>
														<ClosedPair pool={pool} />
													</a>
												</TableCell>
												<TableCell className="tabular-nums">
													<PortfolioAmount
														usd={pool.totalDeposit}
														sol={pool.totalDepositSol}
														currency={currency}
														solDecimals={4}
													/>
												</TableCell>
												<TableCell className="tabular-nums">
													<PortfolioAmount
														usd={pool.totalWithdrawal}
														sol={pool.totalWithdrawalSol}
														currency={currency}
														solDecimals={4}
													/>
												</TableCell>
												<TableCell className="tabular-nums">
													<PortfolioAmount
														usd={pool.totalFee}
														sol={pool.totalFeeSol}
														currency={currency}
														solDecimals={4}
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
														solDecimals={4}
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
														solDecimals={4}
													/>
													<div className="text-xs text-muted-foreground">
														{fmtPct(pool.pnlSolPctChange)}
													</div>
												</TableCell>
												<TableCell className="text-xs text-muted-foreground">
													{timeAgo(pool.lastClosedAt)}
												</TableCell>
												<TableCell onClick={(e) => e.stopPropagation()}>
													<Button
														variant="ghost"
														size="sm"
														className="h-7 px-2 text-xs"
														onClick={(e) => {
															e.stopPropagation();
															setSharePool(pool);
														}}
													>
														<ShareIcon className="size-3" />
														Share
													</Button>
												</TableCell>
											</TableRow>
											{isOpen ? (
												<TableRow>
													<TableCell colSpan={9} className="bg-muted/20 p-0">
														<ClosedDetail
															pool={pool.poolAddress}
															pairLabel={p}
															currency={currency}
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
				)}
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
				{viewMode !== "card" && sharePool ? (
					<ClosedPnlShareDialog
						open={!!sharePool}
						onOpenChange={(o) => !o && setSharePool(null)}
						pool={sharePool}
						currency={currency}
					/>
				) : null}
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
						/>
					) : null}
				</SheetContent>
			</Sheet>
		</Card>
	);
}

export const ClosedTable = memo(ClosedTableView);
