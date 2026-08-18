import type { ScreenedPool } from "@vexis/domain/index.js";
import { ChevronRightIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CurrencyValue } from "~/components/currency-value";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
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
import { fmtPct, meteoraUrl, pnlClass, shortAddr } from "~/lib/format";
import {
	type Currency,
	matchesSearch,
	type OrganicBucket,
	organicBucket,
	organicFilter,
	type PoolSortKey,
	rugBucket,
	type SortDir,
	sortPools,
} from "~/lib/pools";
import { cn } from "~/lib/utils";
import {
	getDefaultViewMode,
	readViewPreference,
	type ViewMode,
	writeViewPreference,
} from "~/lib/view-preference";

function Sparkline({ values }: { values: readonly number[] }) {
	const points = values.filter((v) => Number.isFinite(v));
	if (points.length < 2) return <span className="text-xs">—</span>;
	const min = Math.min(...points);
	const max = Math.max(...points);
	const range = max - min || 1;
	const coords = points
		.map(
			(v, i) =>
				`${(i / (points.length - 1)) * 100},${20 - ((v - min) / range) * 16}`,
		)
		.join(" ");
	const positive = points.at(-1)! >= points[0];
	return (
		<svg
			viewBox="0 0 100 20"
			preserveAspectRatio="none"
			className="h-5 w-16"
			aria-hidden="true"
		>
			<polyline
				points={coords}
				fill="none"
				stroke={positive ? "var(--chart-2)" : "var(--chart-1)"}
				strokeWidth="1.5"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

function badgeVariant(kind: "pass" | "review" | "blocked" | "na") {
	switch (kind) {
		case "pass":
			return "default" as const;
		case "review":
			return "secondary" as const;
		case "blocked":
			return "destructive" as const;
		default:
			return "outline" as const;
	}
}

function SortableHead({
	label,
	k,
	sortKey,
	sortDir,
	onToggle,
}: {
	label: string;
	k: PoolSortKey;
	sortKey: PoolSortKey;
	sortDir: SortDir;
	onToggle: (k: PoolSortKey) => void;
}) {
	return (
		<TableHead>
			<button
				type="button"
				className="inline-flex items-center gap-1 hover:text-foreground"
				onClick={() => onToggle(k)}
			>
				{label}
				<span className="text-[10px] text-muted-foreground">
					{sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
				</span>
			</button>
		</TableHead>
	);
}

function PoolCard({
	pool,
	currency,
	solPrice,
	onSelect,
}: {
	pool: ScreenedPool;
	currency: Currency;
	solPrice: number | null;
	onSelect: () => void;
}) {
	const organic = organicBucket(pool.organicScore);
	const rug = rugBucket(pool.rugScore);
	return (
		// biome-ignore lint/a11y/useSemanticElements: card contains links and cannot be a button
		<div
			className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50"
			role="button"
			tabIndex={0}
			onClick={onSelect}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onSelect();
				}
			}}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<div className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-bold">
						{pool.baseSymbol.slice(0, 2).toUpperCase()}
						{pool.baseIcon ? (
							<img
								src={pool.baseIcon}
								alt={pool.baseSymbol}
								className="absolute inset-0 size-full object-cover"
								onError={(e) => {
									e.currentTarget.style.display = "none";
								}}
							/>
						) : null}
					</div>
					<div className="min-w-0">
						<a
							href={meteoraUrl(pool.pool)}
							target="_blank"
							rel="noopener noreferrer"
							className="block truncate font-semibold hover:underline"
							onClick={(event) => event.stopPropagation()}
						>
							{pool.name || `${pool.baseSymbol}/${pool.quoteSymbol}`}
						</a>
						<span className="font-mono text-xs text-muted-foreground">
							{shortAddr(pool.pool, 5)}
						</span>
					</div>
				</div>
				<div className="flex shrink-0 gap-1.5">
					<Badge variant={badgeVariant(organic)}>{pool.organicScore}</Badge>
					<Badge variant={badgeVariant(rug)}>{pool.rugScore ?? "N/A"}</Badge>
				</div>
			</div>
			<div className="mt-5 grid grid-cols-3 gap-3">
				<div>
					<p className="text-xs text-muted-foreground">Price</p>
					<p className="tabular-nums">
						{pool.price >= 1 ? pool.price.toFixed(3) : pool.price.toFixed(5)}
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">TVL</p>
					<p className="tabular-nums">
						<CurrencyValue
							currency={currency}
							value={
								currency === "sol"
									? Number(pool.tvl) / (solPrice ?? 1)
									: pool.tvl
							}
						/>
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Volume</p>
					<p className="tabular-nums">
						<CurrencyValue
							currency={currency}
							value={
								currency === "sol"
									? Number(pool.volume) / (solPrice ?? 1)
									: pool.volume
							}
						/>
					</p>
				</div>
			</div>
			<div className="mt-4 grid grid-cols-3 gap-3 border-t pt-3 text-sm">
				<div>
					<p className="text-xs text-muted-foreground">MC</p>
					<p className="tabular-nums">
						<CurrencyValue
							currency={currency}
							value={
								currency === "sol"
									? Number(pool.mcap) / (solPrice ?? 1)
									: pool.mcap
							}
						/>
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Fee</p>
					<p className="tabular-nums">
						<CurrencyValue
							currency={currency}
							value={
								currency === "sol"
									? Number(pool.fee) / (solPrice ?? 1)
									: pool.fee
							}
						/>
					</p>
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Trend</p>
					<div className="flex items-center gap-1.5">
						<Sparkline values={pool.priceSeries ?? []} />
						<span
							className={cn("tabular-nums", pnlClass(pool.priceChangePct ?? 0))}
						>
							{fmtPct(pool.priceChangePct)}
						</span>
					</div>
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
}

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
	const [viewMode, setViewMode] = useState<ViewMode>("table");

	useEffect(() => {
		setViewMode(
			readViewPreference(
				window.localStorage,
				"vexis:pools:results-view",
				getDefaultViewMode(window.innerWidth),
			),
		);
	}, []);

	const changeViewMode = (mode: ViewMode) => {
		setViewMode(mode);
		writeViewPreference(window.localStorage, "vexis:pools:results-view", mode);
	};

	const rows = useMemo(() => {
		const filtered = pools.filter(
			(p) => matchesSearch(p, search) && organicFilter(p, bucket),
		);
		return sortPools(filtered, sortKey, sortDir);
	}, [pools, search, bucket, sortKey, sortDir]);

	const toggleSort = (key: PoolSortKey) => {
		if (sortKey === key) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir("desc");
		}
	};

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
					<div className="overflow-x-auto">
						<Table>
							<TableHeader className="bg-muted/50">
								<TableRow>
									<SortableHead
										label="Pool"
										k="pool"
										sortKey={sortKey}
										sortDir={sortDir}
										onToggle={toggleSort}
									/>
									<SortableHead
										label="Price"
										k="price"
										sortKey={sortKey}
										sortDir={sortDir}
										onToggle={toggleSort}
									/>
									<SortableHead
										label="MC"
										k="mcap"
										sortKey={sortKey}
										sortDir={sortDir}
										onToggle={toggleSort}
									/>
									<SortableHead
										label="TVL"
										k="tvl"
										sortKey={sortKey}
										sortDir={sortDir}
										onToggle={toggleSort}
									/>
									<SortableHead
										label="Volume"
										k="volume"
										sortKey={sortKey}
										sortDir={sortDir}
										onToggle={toggleSort}
									/>
									<SortableHead
										label="Fee"
										k="fee"
										sortKey={sortKey}
										sortDir={sortDir}
										onToggle={toggleSort}
									/>
									<SortableHead
										label="Bin"
										k="binStep"
										sortKey={sortKey}
										sortDir={sortDir}
										onToggle={toggleSort}
									/>
									<SortableHead
										label="Organic"
										k="organicScore"
										sortKey={sortKey}
										sortDir={sortDir}
										onToggle={toggleSort}
									/>
									<SortableHead
										label="Rug"
										k="rugScore"
										sortKey={sortKey}
										sortDir={sortDir}
										onToggle={toggleSort}
									/>
									<SortableHead
										label="From ATH"
										k="fromAthPct"
										sortKey={sortKey}
										sortDir={sortDir}
										onToggle={toggleSort}
									/>
									<SortableHead
										label="Trend"
										k="priceChangePct"
										sortKey={sortKey}
										sortDir={sortDir}
										onToggle={toggleSort}
									/>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((pool) => (
									<TableRow
										key={pool.pool}
										className="cursor-pointer"
										onClick={() => onSelect(pool)}
									>
										<TableCell>
											<div className="flex items-center gap-3">
												<div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-muted">
													<div className="flex h-full w-full items-center justify-center text-xs font-bold">
														{pool.baseSymbol.slice(0, 2).toUpperCase()}
													</div>
													{pool.baseIcon ? (
														<img
															src={pool.baseIcon}
															alt={pool.baseSymbol}
															className="absolute inset-0 h-full w-full rounded-md object-cover"
															onError={(e) => {
																e.currentTarget.style.display = "none";
															}}
														/>
													) : null}
												</div>
												<div className="flex flex-col">
													<a
														href={meteoraUrl(pool.pool)}
														target="_blank"
														rel="noopener noreferrer"
														className="font-medium hover:underline"
														onClick={(e) => e.stopPropagation()}
													>
														{pool.name ||
															`${pool.baseSymbol}/${pool.quoteSymbol}`}
													</a>
													<span className="font-mono text-xs text-muted-foreground">
														{shortAddr(pool.pool, 5)}
													</span>
												</div>
											</div>
										</TableCell>
										<TableCell className="tabular-nums">
											{pool.price >= 1
												? pool.price.toFixed(3)
												: pool.price.toFixed(5)}
										</TableCell>
										<TableCell className="tabular-nums">
											<CurrencyValue
												currency={currency}
												value={
													currency === "sol"
														? Number(pool.mcap) / (solPrice ?? 1)
														: pool.mcap
												}
											/>
										</TableCell>
										<TableCell className="tabular-nums">
											<CurrencyValue
												currency={currency}
												value={
													currency === "sol"
														? Number(pool.tvl) / (solPrice ?? 1)
														: pool.tvl
												}
											/>
										</TableCell>
										<TableCell className="tabular-nums">
											<CurrencyValue
												currency={currency}
												value={
													currency === "sol"
														? Number(pool.volume) / (solPrice ?? 1)
														: pool.volume
												}
											/>
										</TableCell>
										<TableCell className="tabular-nums">
											<CurrencyValue
												currency={currency}
												value={
													currency === "sol"
														? Number(pool.fee) / (solPrice ?? 1)
														: pool.fee
												}
											/>
										</TableCell>
										<TableCell className="tabular-nums">
											{pool.binStep}
											<div className="text-xs text-muted-foreground">
												{pool.baseFeePct}% fee
											</div>
										</TableCell>
										<TableCell>
											<Badge
												variant={badgeVariant(organicBucket(pool.organicScore))}
											>
												{pool.organicScore}
											</Badge>
										</TableCell>
										<TableCell>
											<Badge variant={badgeVariant(rugBucket(pool.rugScore))}>
												{pool.rugScore ?? "N/A"}
											</Badge>
										</TableCell>
										<TableCell className="tabular-nums">
											{pool.fromAthPct == null
												? "-"
												: `-${(pool.fromAthPct * 100).toFixed(1)}%`}
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-1.5">
												<Sparkline values={pool.priceSeries ?? []} />
												<span
													className={cn(
														"tabular-nums",
														pnlClass(pool.priceChangePct ?? 0),
													)}
												>
													{fmtPct(pool.priceChangePct)}
												</span>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
