import {
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	SearchIcon,
	ShareIcon,
} from "lucide-react";
import { Fragment, memo, useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
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
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ViewSwitcher } from "~/components/view-switcher";
import { useIsMobile } from "~/hooks/use-mobile";
import { useViewPreference } from "~/hooks/use-view-preference";
import { CLOSED_PAGE_SIZES } from "~/lib/closed-pagination";
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
type OutcomeFilter = "all" | "profit" | "loss";
type ClosedSortKey =
	| "pool"
	| "deposit"
	| "withdraw"
	| "fees"
	| "pnlUsd"
	| "pnlSol"
	| "closedAt";
type SortDir = "asc" | "desc";
interface ClosedQuery {
	readonly search: string;
	readonly outcome: OutcomeFilter;
	readonly sortKey: ClosedSortKey;
	readonly sortDir: SortDir;
}
const VALID_SORT_KEYS: readonly ClosedSortKey[] = [
	"pool",
	"deposit",
	"withdraw",
	"fees",
	"pnlUsd",
	"pnlSol",
	"closedAt",
];
const CLOSED_VALUE: Record<ClosedSortKey, (p: ClosedPool) => number | string> =
	{
		pool: (p) => pair(p.tokenX, p.tokenY),
		deposit: (p) => parseFloat(p.totalDeposit) || 0,
		withdraw: (p) => parseFloat(p.totalWithdrawal) || 0,
		fees: (p) => parseFloat(p.totalFee) || 0,
		pnlUsd: (p) => parseFloat(p.pnlUsd) || 0,
		pnlSol: (p) => parseFloat(p.pnlSol) || 0,
		closedAt: (p) => p.lastClosedAt ?? 0,
	};
function ClosedSortableHead({
	label,
	k,
	sortKey,
	sortDir,
	onSort,
}: {
	label: string;
	k: ClosedSortKey;
	sortKey: ClosedSortKey;
	sortDir: SortDir;
	onSort: (key: ClosedSortKey) => void;
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

function ClosedTableView({
	closed,
	currency,
	usdToIdr,
	onPageChange,
}: {
	closed: ClosedPayload;
	currency: Currency;
	usdToIdr?: number | null;
	onPageChange: (page: number) => void;
}) {
	const isMobile = useIsMobile();
	const [searchParams, setSearchParams] = useSearchParams();
	const search = searchParams.get("q") ?? "";
	const outcomeParam = searchParams.get("outcome");
	const outcome: OutcomeFilter =
		outcomeParam === "profit" || outcomeParam === "loss" ? outcomeParam : "all";
	const sortParam = searchParams.get("sort");
	const sortKey: ClosedSortKey = (
		VALID_SORT_KEYS as readonly string[]
	).includes(sortParam ?? "")
		? (sortParam as ClosedSortKey)
		: "closedAt";
	const dirParam = searchParams.get("dir");
	const sortDir: SortDir =
		dirParam === "asc" || dirParam === "desc" ? dirParam : "desc";
	const query: ClosedQuery = { search, outcome, sortKey, sortDir };
	const [expanded, setExpanded] = useState<string | null>(null);
	const [viewMode, setViewMode] = useViewPreference(
		"vexis:portfolio:closed-view",
	);
	const [selectedCard, setSelectedCard] = useState<ClosedPool | null>(null);
	const [sharePool, setSharePool] = useState<ClosedPool | null>(null);
	const { pools, page, pageSize, totalCount } = closed;
	const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));
	const outcomeCounts = useMemo(
		() => ({
			all: pools.length,
			profit: pools.filter((pool) => parseFloat(pool.pnlUsd) >= 0).length,
			loss: pools.filter((pool) => parseFloat(pool.pnlUsd) < 0).length,
		}),
		[pools],
	);
	const filtered = useMemo(() => {
		let rows = pools;
		if (query.outcome !== "all")
			rows = rows.filter((pool) =>
				query.outcome === "profit"
					? parseFloat(pool.pnlUsd) >= 0
					: parseFloat(pool.pnlUsd) < 0,
			);
		if (query.search.trim()) {
			const needle = query.search.trim().toLowerCase();
			rows = rows.filter(
				(pool) =>
					pool.tokenX.toLowerCase().includes(needle) ||
					pool.tokenY.toLowerCase().includes(needle) ||
					pool.poolAddress.toLowerCase().includes(needle),
			);
		}
		const direction = query.sortDir === "asc" ? 1 : -1;
		const get = CLOSED_VALUE[query.sortKey];
		return [...rows].sort((a, b) => {
			const av = get(a);
			const bv = get(b);
			return typeof av === "string"
				? av.localeCompare(bv as string) * direction
				: (av - (bv as number)) * direction;
		});
	}, [pools, query.search, query.outcome, query.sortKey, query.sortDir]);
	const filterActive = query.search.trim() !== "" || query.outcome !== "all";
	const from = (page - 1) * pageSize + 1;
	const to = from + filtered.length - 1;
	const updateParam = useCallback(
		(key: string, value: string | null, defaultValue?: string) => {
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					if (value === null || value === "" || value === defaultValue)
						next.delete(key);
					else next.set(key, value);
					next.delete("closedPage");
					return next;
				},
				{ preventScrollReset: true },
			);
		},
		[setSearchParams],
	);
	const setSearch = useCallback(
		(v: string) => updateParam("q", v),
		[updateParam],
	);
	const setOutcome = useCallback(
		(v: OutcomeFilter) => updateParam("outcome", v, "all"),
		[updateParam],
	);
	const toggleSort = useCallback(
		(key: ClosedSortKey) => {
			if (sortKey === key) {
				updateParam("dir", sortDir === "asc" ? "desc" : "asc", "desc");
			} else {
				setSearchParams(
					(prev) => {
						const next = new URLSearchParams(prev);
						if (key === "closedAt") next.delete("sort");
						else next.set("sort", key);
						if (key === "pool") next.set("dir", "asc");
						else next.delete("dir");
						next.delete("closedPage");
						return next;
					},
					{ preventScrollReset: true },
				);
			}
		},
		[sortKey, sortDir, updateParam, setSearchParams],
	);
	const resetFilter = useCallback(() => {
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				next.delete("q");
				next.delete("outcome");
				next.delete("closedPage");
				return next;
			},
			{ preventScrollReset: true },
		);
	}, [setSearchParams]);
	const selectCard = useCallback(
		(pool: ClosedPool) => setSelectedCard(pool),
		[],
	);

	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
				<div>
					<CardTitle>Closed Positions</CardTitle>
					<p className="text-sm text-muted-foreground">
						{totalCount} pools closed in total
					</p>
					{filterActive ? (
						<p className="text-sm text-muted-foreground">
							{filtered.length} of {pools.length} on this page match the filter
						</p>
					) : null}
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<ViewSwitcher
						value={viewMode}
						onValueChange={setViewMode}
						label="Closed positions view"
					/>
					<Tabs
						value={outcome}
						onValueChange={(value) => setOutcome(value as OutcomeFilter)}
					>
						<TabsList>
							<TabsTrigger value="all">
								All <Badge variant="secondary">{outcomeCounts.all}</Badge>
							</TabsTrigger>
							<TabsTrigger value="profit">
								Profit <Badge variant="secondary">{outcomeCounts.profit}</Badge>
							</TabsTrigger>
							<TabsTrigger value="loss">
								Loss <Badge variant="secondary">{outcomeCounts.loss}</Badge>
							</TabsTrigger>
						</TabsList>
					</Tabs>
					<label htmlFor="closed-search" className="relative">
						<SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							id="closed-search"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search pool…"
							className="h-9 w-44 pl-8"
						/>
						<span className="sr-only">Search pools</span>
					</label>
				</div>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				{pools.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No closed positions.
					</div>
				) : filtered.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						<p>No closed positions on this page match the current filter.</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-3"
							onClick={resetFilter}
						>
							Reset filter
						</Button>
					</div>
				) : viewMode === "card" ? (
					<div className="grid gap-3 px-4 pb-4 md:grid-cols-2 lg:px-6 xl:grid-cols-3">
						{filtered.map((pool) => (
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
									<ClosedSortableHead
										label="Pool"
										k="pool"
										sortKey={sortKey}
										sortDir={sortDir}
										onSort={toggleSort}
									/>
									<ClosedSortableHead
										label="Deposit"
										k="deposit"
										sortKey={sortKey}
										sortDir={sortDir}
										onSort={toggleSort}
									/>
									<ClosedSortableHead
										label="Withdraw"
										k="withdraw"
										sortKey={sortKey}
										sortDir={sortDir}
										onSort={toggleSort}
									/>
									<ClosedSortableHead
										label="Fees"
										k="fees"
										sortKey={sortKey}
										sortDir={sortDir}
										onSort={toggleSort}
									/>
									<ClosedSortableHead
										label="PnL USD"
										k="pnlUsd"
										sortKey={sortKey}
										sortDir={sortDir}
										onSort={toggleSort}
									/>
									<ClosedSortableHead
										label="PnL SOL"
										k="pnlSol"
										sortKey={sortKey}
										sortDir={sortDir}
										onSort={toggleSort}
									/>
									<ClosedSortableHead
										label="Closed"
										k="closedAt"
										sortKey={sortKey}
										sortDir={sortDir}
										onSort={toggleSort}
									/>
									<TableHead>Action</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filtered.map((pool) => {
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
															tokenXIcon={pool.tokenXIcon}
															tokenXSymbol={pool.tokenX}
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
							{filtered.length === 0
								? `Showing 0 of ${totalCount}`
								: `Showing ${from}–${to} of ${totalCount}`}
						</span>
						<div className="flex items-center gap-2">
							<label
								htmlFor="closed-page-size"
								className="text-sm text-muted-foreground"
							>
								Rows
							</label>
							<Select
								value={String(pageSize)}
								onValueChange={(value) =>
									updateParam("closedSize", value, "10")
								}
							>
								<SelectTrigger
									id="closed-page-size"
									size="sm"
									className="w-20"
									aria-label="Rows per page"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CLOSED_PAGE_SIZES.map((size) => (
										<SelectItem key={size} value={String(size)}>
											{size}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
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
						usdToIdr={usdToIdr}
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
							tokenXIcon={selectedCard.tokenXIcon}
							tokenXSymbol={selectedCard.tokenX}
							currency={currency}
						/>
					) : null}
				</SheetContent>
			</Sheet>
		</Card>
	);
}

export const ClosedTable = memo(ClosedTableView);
