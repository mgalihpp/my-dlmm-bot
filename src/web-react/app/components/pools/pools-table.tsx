import type { ScreenedPool } from "@vexis/domain/index.js";
import { SearchIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ViewSwitcher } from "~/components/view-switcher";
import { useViewPreference } from "~/hooks/use-view-preference";
import {
	type Currency,
	matchesSearch,
	type OrganicBucket,
	organicFilter,
	type PoolSortKey,
	type SortDir,
	sortPools,
} from "~/lib/pools";
import { PoolCard } from "./pool-card";
import { PoolsTableBody } from "./pools-table-body";

export function PoolsTable({
	pools,
	currency,
	solPrice,
	onSelect,
}: {
	pools: readonly ScreenedPool[];
	currency: Currency;
	solPrice: number | null;
	onSelect: (pool: ScreenedPool) => void;
}) {
	const [search, setSearch] = useState("");
	const [bucket, setBucket] = useState<OrganicBucket>("all");
	const [sortKey, setSortKey] = useState<PoolSortKey>("tvl");
	const [sortDir, setSortDir] = useState<SortDir>("desc");
	const [viewMode, setViewMode] = useViewPreference("vexis:pools:results-view");

	const rows = useMemo(() => {
		const filtered = pools.filter(
			(p) => matchesSearch(p, search) && organicFilter(p, bucket),
		);
		return sortPools(filtered, sortKey, sortDir);
	}, [pools, search, bucket, sortKey, sortDir]);

	const toggleSort = useCallback(
		(key: PoolSortKey) => {
			if (sortKey === key) {
				setSortDir((d) => (d === "asc" ? "desc" : "asc"));
			} else {
				setSortKey(key);
				setSortDir("desc");
			}
		},
		[sortKey],
	);

	const changeViewMode = useCallback(
		(mode: typeof viewMode) => setViewMode(mode),
		[setViewMode],
	);

	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
				<div>
					<CardTitle>Screen results</CardTitle>
					<p className="text-sm text-muted-foreground">
						{rows.length} of {pools.length} pools
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<ViewSwitcher
						value={viewMode}
						onValueChange={changeViewMode}
						label="Pool results view"
					/>
					<Tabs
						value={bucket}
						onValueChange={(v) => v && setBucket(v as OrganicBucket)}
					>
						<TabsList aria-label="Pool screening filter">
							<TabsTrigger value="all">All</TabsTrigger>
							<TabsTrigger value="pass">Pass</TabsTrigger>
							<TabsTrigger value="review">Review</TabsTrigger>
							<TabsTrigger value="blocked">Blocked</TabsTrigger>
						</TabsList>
					</Tabs>
					<label className="relative" htmlFor="pools-search">
						<SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							id="pools-search"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search pool…"
							className="h-9 w-44 pl-8"
						/>
						<span className="sr-only">Search pools</span>
					</label>
				</div>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				{rows.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No pools{search ? " matching the search" : ""}.
					</div>
				) : viewMode === "card" ? (
					<div className="grid gap-3 px-4 pb-4 md:grid-cols-2 lg:px-6 xl:grid-cols-3">
						{rows.map((pool) => (
							<PoolCard
								key={pool.pool}
								pool={pool}
								currency={currency}
								solPrice={solPrice}
								onSelect={() => onSelect(pool)}
							/>
						))}
					</div>
				) : (
					<PoolsTableBody
						pools={rows}
						currency={currency}
						solPrice={solPrice}
						onSelect={onSelect}
						sortKey={sortKey}
						sortDir={sortDir}
						onToggle={toggleSort}
					/>
				)}
			</CardContent>
		</Card>
	);
}
