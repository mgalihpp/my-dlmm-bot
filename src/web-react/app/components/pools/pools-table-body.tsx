import type { ScreenedPool } from "@vexis/domain/index.js";
import { CurrencyValue } from "~/components/currency-value";
import { Badge } from "~/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "~/components/ui/table";
import { fmtPct, meteoraUrl, pnlClass, shortAddr } from "~/lib/format";
import { proxiedIconUrl } from "~/lib/icon";
import {
	type Currency,
	organicBucket,
	type PoolSortKey,
	rugBucket,
	type SortDir,
} from "~/lib/pools";
import { cn } from "~/lib/utils";
import { badgeVariant, Sparkline } from "./pool-table-parts";
import { PoolsTableHeader } from "./pools-table-header";

export function PoolsTableBody({
	pools,
	currency,
	solPrice,
	onSelect,
	sortKey,
	sortDir,
	onToggle,
}: {
	pools: readonly ScreenedPool[];
	currency: Currency;
	solPrice: number | null;
	onSelect: (pool: ScreenedPool) => void;
	sortKey: PoolSortKey;
	sortDir: SortDir;
	onToggle: (key: PoolSortKey) => void;
}) {
	return (
		<div className="overflow-x-auto">
			<Table>
				<PoolsTableHeader
					sortKey={sortKey}
					sortDir={sortDir}
					onToggle={onToggle}
				/>
				<TableBody>
					{pools.map((pool) => (
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
										{proxiedIconUrl(pool.baseIcon) ? (
											<img
												src={proxiedIconUrl(pool.baseIcon) as string}
												alt={pool.baseSymbol}
												crossOrigin="anonymous"
												referrerPolicy="no-referrer"
												loading="lazy"
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
											{pool.name || `${pool.baseSymbol}/${pool.quoteSymbol}`}
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
							{(["mcap", "tvl", "volume", "fee"] as const).map((key) => (
								<TableCell key={key} className="tabular-nums">
									<CurrencyValue
										currency={currency}
										value={
											currency === "sol"
												? Number(pool[key]) / (solPrice ?? 1)
												: pool[key]
										}
									/>
								</TableCell>
							))}
							<TableCell className="tabular-nums">
								{pool.binStep}
								<div className="text-xs text-muted-foreground">
									{pool.baseFeePct}% fee
								</div>
							</TableCell>
							<TableCell>
								<Badge variant={badgeVariant(organicBucket(pool.organicScore))}>
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
	);
}
