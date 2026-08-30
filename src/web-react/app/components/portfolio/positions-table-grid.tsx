import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import { useIsMobile } from "~/hooks/use-mobile";
import { pair, shortAddr } from "~/lib/format";
import type { OpenPoolWithIcons } from "~/lib/server/portfolio.server";
import {
	getDefaultViewMode,
	readViewPreference,
	type ViewMode,
	writeViewPreference,
} from "~/lib/view-preference";
import { OpenPositionCard } from "./open-position-card";
import type { Currency, RangeFilter } from "./portfolio-page";
import { PositionsCardDetail } from "./positions-detail";
import {
	PositionsTableBody,
	type SortDir,
	type SortKey,
} from "./positions-table-body";
import { PositionsTableToolbar } from "./positions-table-toolbar";

export function matchesRangeFilter(
	pool: Pick<OpenPoolWithIcons, "outOfRange" | "positionsOutOfRange">,
	filter: RangeFilter,
): boolean {
	const oor = pool.outOfRange === true || pool.positionsOutOfRange.length > 0;
	return filter === "all" || (filter === "oor" ? oor : !oor);
}

function PositionsTableView({
	pools,
	rangeFilter,
	onRangeFilterChange,
	currency,
	solPrice,
	rangesLoading = false,
}: {
	pools: readonly OpenPoolWithIcons[];
	rangeFilter: RangeFilter;
	onRangeFilterChange: (filter: RangeFilter) => void;
	currency: Currency;
	solPrice: number | null;
	rangesLoading?: boolean;
}) {
	const isMobile = useIsMobile();
	const [search, setSearch] = useState("");
	const [sortKey, setSortKey] = useState<SortKey>("balances");
	const [sortDir, setSortDir] = useState<SortDir>("desc");
	const [expanded, setExpanded] = useState<string | null>(null);
	const [selectedCard, setSelectedCard] = useState<OpenPoolWithIcons | null>(
		null,
	);
	const [viewMode, setViewMode] = useState<ViewMode>("table");
	const [viewReady, setViewReady] = useState(false);

	useEffect(() => {
		setViewMode(
			readViewPreference(
				window.localStorage,
				"vexis:portfolio:open-view",
				getDefaultViewMode(window.innerWidth),
			),
		);
		setViewReady(true);
	}, []);

	const changeViewMode = (mode: ViewMode) => {
		setViewMode(mode);
		writeViewPreference(window.localStorage, "vexis:portfolio:open-view", mode);
	};
	const filtered = useMemo(() => {
		let rows = pools;
		if (rangeFilter !== "all")
			rows = rows.filter((pool) => matchesRangeFilter(pool, rangeFilter));
		if (search.trim()) {
			const query = search.trim().toLowerCase();
			rows = rows.filter(
				(pool) =>
					pool.tokenX.toLowerCase().includes(query) ||
					pool.tokenY.toLowerCase().includes(query) ||
					pool.poolAddress.toLowerCase().includes(query),
			);
		}
		const direction = sortDir === "asc" ? 1 : -1;
		return [...rows].sort((a, b) => {
			let av: number | string = 0;
			let bv: number | string = 0;
			if (sortKey === "pair") {
				av = pair(a.tokenX, a.tokenY);
				bv = pair(b.tokenX, b.tokenY);
			} else if (sortKey === "balances") {
				av = parseFloat(a.balances) || 0;
				bv = parseFloat(b.balances) || 0;
			} else if (sortKey === "fees") {
				av = parseFloat(a.unclaimedFees) || 0;
				bv = parseFloat(b.unclaimedFees) || 0;
			} else if (sortKey === "pnl") {
				av = parseFloat(a.pnl) || 0;
				bv = parseFloat(b.pnl) || 0;
			} else {
				av = parseFloat(a.pnlSol ?? "0") || 0;
				bv = parseFloat(b.pnlSol ?? "0") || 0;
			}
			return typeof av === "string"
				? av.localeCompare(bv as string) * direction
				: ((av as number) - (bv as number)) * direction;
		});
	}, [pools, rangeFilter, search, sortKey, sortDir]);
	const toggleSort = useCallback(
		(key: SortKey) => {
			if (sortKey === key)
				setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
			else {
				setSortKey(key);
				setSortDir("desc");
			}
		},
		[sortKey],
	);
	const rangeCounts = useMemo(
		() => ({
			all: pools.length,
			inRange: pools.filter(
				(pool) =>
					pool.outOfRange !== true && pool.positionsOutOfRange.length === 0,
			).length,
			oor: pools.filter(
				(pool) =>
					pool.outOfRange === true || pool.positionsOutOfRange.length > 0,
			).length,
		}),
		[pools],
	);

	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
				<div>
					<CardTitle>Open Positions</CardTitle>
					<p className="text-sm text-muted-foreground">
						{filtered.length} of {pools.length} pools
					</p>
				</div>
				<PositionsTableToolbar
					viewMode={viewMode}
					onViewModeChange={changeViewMode}
					rangeFilter={rangeFilter}
					onRangeFilterChange={onRangeFilterChange}
					rangeCounts={rangeCounts}
					search={search}
					onSearchChange={setSearch}
				/>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				{filtered.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No open positions{search ? " matching the search" : ""}.
					</div>
				) : !viewReady ? null : viewMode === "card" ? (
					<div className="grid gap-3 px-4 pb-4 md:grid-cols-2 lg:px-6 xl:grid-cols-3">
						{filtered.map((pool) => (
							<OpenPositionCard
								key={pool.poolAddress}
								pool={pool}
								currency={currency}
								solPrice={solPrice}
								onDetails={() => setSelectedCard(pool)}
								rangesLoading={rangesLoading}
							/>
						))}
					</div>
				) : (
					<PositionsTableBody
						pools={filtered}
						expanded={expanded}
						onExpandedChange={setExpanded}
						currency={currency}
						solPrice={solPrice}
						sortKey={sortKey}
						sortDir={sortDir}
						onSort={toggleSort}
						rangesLoading={rangesLoading}
					/>
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
								: "Position details"}
						</SheetTitle>
						<SheetDescription>
							{selectedCard
								? shortAddr(selectedCard.poolAddress, 6)
								: "Open position details"}
						</SheetDescription>
					</SheetHeader>
					{selectedCard ? (
						<PositionsCardDetail
							pool={selectedCard}
							currency={currency}
							solPrice={solPrice}
						/>
					) : null}
				</SheetContent>
			</Sheet>
		</Card>
	);
}

export const PositionsTable = memo(PositionsTableView);
