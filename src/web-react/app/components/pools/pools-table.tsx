import type { ScreenedPool } from "@vexis/domain/index.js";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
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
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { fmtPct, meteoraUrl, pnlClass, shortAddr } from "~/lib/format";
import {
	type Currency,
	fmtAmount,
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
					<ToggleGroup
						type="single"
						value={bucket}
						onValueChange={(v) => v && setBucket(v as OrganicBucket)}
						variant="outline"
						size="sm"
					>
						<ToggleGroupItem value="all">All</ToggleGroupItem>
						<ToggleGroupItem value="pass">Pass</ToggleGroupItem>
						<ToggleGroupItem value="review">Review</ToggleGroupItem>
						<ToggleGroupItem value="blocked">Blocked</ToggleGroupItem>
					</ToggleGroup>
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
												{pool.baseIcon ? (
													<img
														src={pool.baseIcon}
														alt={pool.baseSymbol}
														className="h-8 w-8 shrink-0 rounded-md bg-muted object-cover"
														onError={(e) => {
															(
																e.currentTarget as HTMLImageElement
															).style.display = "none";
														}}
													/>
												) : (
													<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold">
														{pool.baseSymbol.slice(0, 2).toUpperCase()}
													</div>
												)}
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
											{fmtAmount(pool.mcap, currency, solPrice)}
										</TableCell>
										<TableCell className="tabular-nums">
											{fmtAmount(pool.tvl, currency, solPrice)}
										</TableCell>
										<TableCell className="tabular-nums">
											{fmtAmount(pool.volume, currency, solPrice)}
										</TableCell>
										<TableCell className="tabular-nums">
											{fmtAmount(pool.fee, currency, solPrice)}
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
