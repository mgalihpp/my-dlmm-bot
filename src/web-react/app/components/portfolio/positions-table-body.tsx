import { ChevronDownIcon, ShareIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { fmtPct, pnlClass, pnlSign } from "~/lib/format";
import type { OpenPoolWithIcons } from "~/lib/server/portfolio.server";
import { cn } from "~/lib/utils";
import type { Currency } from "./portfolio-page";
import { PositionPnlShareDialog } from "./position-pnl-share-dialog.js";
import {
	CloseConfirmPopover,
	PoolCell,
	PortfolioAmount,
	PositionsDetail,
} from "./positions-detail";
import { RangeVisual } from "./range-visual";

type SortKey = "pair" | "balances" | "fees" | "pnl" | "pnlSol";
type SortDir = "asc" | "desc";

function SortableHead({
	label,
	k,
	sortKey,
	sortDir,
	onSort,
}: {
	label: string;
	k: SortKey;
	sortKey: SortKey;
	sortDir: SortDir;
	onSort: (key: SortKey) => void;
}) {
	return (
		<TableHead>
			<button
				type="button"
				className="inline-flex items-center gap-1 hover:text-foreground"
				onClick={() => onSort(k)}
			>
				{label}
				<span className="text-[10px] text-muted-foreground">
					{sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
				</span>
			</button>
		</TableHead>
	);
}

export function PositionsTableBody({
	pools,
	expanded,
	onExpandedChange,
	currency,
	solPrice,
	sortKey,
	sortDir,
	onSort,
	rangesLoading = false,
}: {
	pools: readonly OpenPoolWithIcons[];
	expanded: string | null;
	onExpandedChange: (poolAddress: string | null) => void;
	currency: Currency;
	solPrice: number | null;
	sortKey: SortKey;
	sortDir: SortDir;
	onSort: (key: SortKey) => void;
	rangesLoading?: boolean;
}) {
	const [sharePool, setSharePool] = useState<OpenPoolWithIcons | null>(null);
	return (
		<div className="overflow-x-auto">
			<Table>
				<TableHeader className="bg-muted/50">
					<TableRow>
						<TableHead className="w-8" />
						<SortableHead
							label="Pool"
							k="pair"
							sortKey={sortKey}
							sortDir={sortDir}
							onSort={onSort}
						/>
						<TableHead>Bin</TableHead>
						<SortableHead
							label="Balance"
							k="balances"
							sortKey={sortKey}
							sortDir={sortDir}
							onSort={onSort}
						/>
						<SortableHead
							label="Fees"
							k="fees"
							sortKey={sortKey}
							sortDir={sortDir}
							onSort={onSort}
						/>
						<SortableHead
							label="PnL USD"
							k="pnl"
							sortKey={sortKey}
							sortDir={sortDir}
							onSort={onSort}
						/>
						<SortableHead
							label="PnL SOL"
							k="pnlSol"
							sortKey={sortKey}
							sortDir={sortDir}
							onSort={onSort}
						/>
						<TableHead>Range</TableHead>
						<TableHead className="min-w-40">Visual Range</TableHead>
						<TableHead>Action</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{pools.map((pool) => {
						const oor =
							pool.outOfRange === true || pool.positionsOutOfRange.length > 0;
						const pnlUsd = parseFloat(pool.pnl);
						const pnlSol = pool.pnlSol != null ? parseFloat(pool.pnlSol) : null;
						const isOpen = expanded === pool.poolAddress;
						return (
							<Fragment key={pool.poolAddress}>
								<TableRow
									className="cursor-pointer"
									onClick={() =>
										onExpandedChange(isOpen ? null : pool.poolAddress)
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
										<PoolCell pool={pool} />
									</TableCell>
									<TableCell className="tabular-nums">{pool.binStep}</TableCell>
									<TableCell className="tabular-nums">
										<PortfolioAmount
											usd={pool.balances}
											currency={currency}
											solPrice={solPrice}
											solDecimals={4}
										/>
									</TableCell>
									<TableCell className="tabular-nums">
										<PortfolioAmount
											usd={pool.unclaimedFees}
											currency={currency}
											solPrice={solPrice}
											solDecimals={4}
										/>
									</TableCell>
									<TableCell
										className={cn("tabular-nums", pnlClass(pnlSign(pnlUsd)))}
									>
										<PortfolioAmount
											usd={pool.pnl}
											sol={pool.pnlSol}
											currency="usd"
											solPrice={solPrice}
											solDecimals={4}
										/>
										<div className="text-xs text-muted-foreground">
											{fmtPct(parseFloat(pool.pnlPctChange))}
										</div>
									</TableCell>
									<TableCell
										className={cn("tabular-nums", pnlClass(pnlSign(pnlSol)))}
									>
										<PortfolioAmount
											usd={pool.pnlSol}
											sol={pool.pnlSol}
											currency="sol"
											solPrice={solPrice}
											solDecimals={4}
										/>
										<div className="text-xs text-muted-foreground">
											{pool.pnlSolPctChange != null
												? fmtPct(parseFloat(pool.pnlSolPctChange))
												: "-"}
										</div>
									</TableCell>
									<TableCell>
										<Badge
											variant={oor ? "destructive" : "default"}
											className="gap-1"
										>
											{oor ? "OOR" : "IN RANGE"}
										</Badge>
										<div className="mt-1 text-xs text-muted-foreground">
											{pool.openPositionCount} position
											{pool.openPositionCount === 1 ? "" : "s"}
										</div>
									</TableCell>
									<TableCell>
										<RangeVisual
											ranges={pool.positionsRange ?? []}
											current={pool.poolPrice}
											mcap={pool.mcap ?? null}
											loading={rangesLoading}
										/>
									</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-1">
											{(pool.positionsLive ?? []).map((position) => (
												<CloseConfirmPopover
													key={position.address}
													pool={pool.poolAddress}
													position={position.address}
													poolName={`${pool.tokenX}/${pool.tokenY}`}
													side="right"
												>
													<Button
														type="button"
														variant="outline"
														size="sm"
														className="h-7 px-2 text-xs"
														onClick={(event) => event.stopPropagation()}
													>
														Close
													</Button>
												</CloseConfirmPopover>
											))}
											<Button
												type="button"
												variant="outline"
												size="sm"
												className="h-7 px-2 text-xs"
												onClick={(event) => {
													event.stopPropagation();
													setSharePool(pool);
												}}
											>
												<ShareIcon className="size-3" />
												Share
											</Button>
										</div>
									</TableCell>
								</TableRow>
								{isOpen ? (
									<TableRow>
										<TableCell colSpan={10} className="bg-muted/20 p-0">
											<PositionsDetail pool={pool} />
										</TableCell>
									</TableRow>
								) : null}
							</Fragment>
						);
					})}
				</TableBody>
			</Table>
			{sharePool ? (
				<PositionPnlShareDialog
					open={!!sharePool}
					onOpenChange={(v) => {
						if (!v) setSharePool(null);
					}}
					pool={sharePool}
					currency={currency as "usd" | "sol"}
					solPrice={solPrice}
				/>
			) : null}
		</div>
	);
}

export type { SortDir, SortKey };
