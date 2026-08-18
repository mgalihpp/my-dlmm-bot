import type { ScreenedPool } from "@vexis/domain/index.js";
import { ChevronRightIcon } from "lucide-react";
import { CurrencyValue } from "~/components/currency-value";
import { Badge } from "~/components/ui/badge";
import { fmtPct, meteoraUrl, pnlClass, shortAddr } from "~/lib/format";
import { type Currency, organicBucket, rugBucket } from "~/lib/pools";
import { cn } from "~/lib/utils";
import { badgeVariant, Sparkline } from "./pool-table-parts";

export function PoolCard({
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
				{(["mcap", "fee"] as const).map((key) => (
					<div key={key}>
						<p className="text-xs text-muted-foreground">
							{key === "mcap" ? "MC" : "Fee"}
						</p>
						<p className="tabular-nums">
							<CurrencyValue
								currency={currency}
								value={
									currency === "sol"
										? Number(pool[key]) / (solPrice ?? 1)
										: pool[key]
								}
							/>
						</p>
					</div>
				))}
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
