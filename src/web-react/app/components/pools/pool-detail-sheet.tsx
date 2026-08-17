import type { ScreenedPool } from "@vexis/domain/index.js";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import { fmtPct, meteoraUrl, solscanUrl } from "~/lib/format";
import {
	type Currency,
	fmtAmount,
	organicBucket,
	rugBucket,
} from "~/lib/pools";

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="font-medium tabular-nums">{value}</div>
		</div>
	);
}

export function PoolDetailSheet({
	pool,
	currency,
	solPrice,
	onOpenChange,
}: {
	pool: ScreenedPool | null;
	currency: Currency;
	solPrice: number | null;
	onOpenChange: (open: boolean) => void;
}) {
	if (!pool) return null;
	const price = pool.price >= 1 ? pool.price.toFixed(3) : pool.price.toFixed(5);
	const metrics: { label: string; value: string }[] = [
		{ label: "Market cap", value: fmtAmount(pool.mcap, currency, solPrice) },
		{ label: "TVL", value: fmtAmount(pool.tvl, currency, solPrice) },
		{
			label: "Active TVL",
			value: fmtAmount(pool.activeTvl, currency, solPrice),
		},
		{ label: "Volume", value: fmtAmount(pool.volume, currency, solPrice) },
		{ label: "Fees", value: fmtAmount(pool.fee, currency, solPrice) },
		{ label: "Holders", value: String(pool.holders) },
		{
			label: "Organic score",
			value: String(pool.organicScore),
		},
		{ label: "Quote organic", value: String(pool.quoteOrganic) },
		{ label: "Bin step", value: String(pool.binStep) },
		{ label: "Base fee", value: `${pool.baseFeePct}%` },
		{
			label: "From ATH",
			value:
				pool.fromAthPct == null
					? "-"
					: `-${(pool.fromAthPct * 100).toFixed(1)}%`,
		},
		{
			label: "Volatility",
			value: pool.volatility != null ? String(pool.volatility) : "-",
		},
		{
			label: "Fee / TVL ratio",
			value:
				pool.feeActiveTvlRatio != null ? String(pool.feeActiveTvlRatio) : "-",
		},
		{ label: "Active positions", value: String(pool.activePositions) },
		{ label: "Open positions", value: String(pool.openPositions) },
		{
			label: "Token age",
			value: pool.tokenAgeHours != null ? `${pool.tokenAgeHours}h` : "-",
		},
		{
			label: "Pool age",
			value: pool.poolAgeHours != null ? `${pool.poolAgeHours}h` : "-",
		},
		{ label: "Swaps", value: String(pool.swapCount) },
		{ label: "Unique traders", value: String(pool.uniqueTraders) },
		{
			label: "Rug score",
			value: pool.rugScore != null ? String(pool.rugScore) : "N/A",
		},
		{
			label: "LP locked",
			value: pool.lpLockedPct != null ? `${pool.lpLockedPct}%` : "-",
		},
	];
	const flags: string[] = [];
	if (pool.isRugpull) flags.push("Rugpull risk");
	if (pool.isWash) flags.push("Wash trading");
	if (pool.devSoldAll) flags.push("Dev sold all");

	return (
		<Sheet open onOpenChange={onOpenChange}>
			<SheetContent className="sm:max-w-md">
				<SheetHeader>
					<div className="flex items-center gap-3">
						<div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
							<div className="flex h-full w-full items-center justify-center text-sm font-bold">
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
						<div>
							<SheetTitle>
								{pool.name || `${pool.baseSymbol}/${pool.quoteSymbol}`}
							</SheetTitle>
							<SheetDescription className="flex items-center gap-2">
								<span className="tabular-nums">{price}</span>
								<span
									className={
										pool.priceChangePct != null && pool.priceChangePct >= 0
											? "text-emerald-500"
											: "text-red-500"
									}
								>
									{fmtPct(pool.priceChangePct)}
								</span>
							</SheetDescription>
						</div>
					</div>
					{flags.length > 0 && (
						<div className="flex flex-wrap gap-1.5 pt-1">
							{flags.map((f) => (
								<Badge key={f} variant="destructive">
									{f}
								</Badge>
							))}
						</div>
					)}
				</SheetHeader>
				<div className="grid grid-cols-2 gap-x-4 gap-y-3 px-6">
					{metrics.map((m) => (
						<Metric key={m.label} label={m.label} value={m.value} />
					))}
					<div className="col-span-2 flex items-center gap-1.5 pt-1">
						<Badge
							variant={
								organicBucket(pool.organicScore) === "pass"
									? "default"
									: organicBucket(pool.organicScore) === "review"
										? "secondary"
										: "destructive"
							}
						>
							Organic: {pool.organicScore}
						</Badge>
						<Badge
							variant={
								rugBucket(pool.rugScore) === "pass"
									? "default"
									: rugBucket(pool.rugScore) === "review"
										? "secondary"
										: "outline"
							}
						>
							Rug: {pool.rugScore ?? "N/A"}
						</Badge>
					</div>
				</div>
				<SheetFooter>
					<Button asChild variant="outline">
						<a
							href={meteoraUrl(pool.pool)}
							target="_blank"
							rel="noopener noreferrer"
						>
							Open in Meteora
						</a>
					</Button>
					<Button asChild variant="outline">
						<a
							href={solscanUrl(pool.pool)}
							target="_blank"
							rel="noopener noreferrer"
						>
							View on Solscan
						</a>
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
