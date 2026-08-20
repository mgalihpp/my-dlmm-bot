import type { ScreenedPool } from "@vexis/domain/index.js";
import type { ReactNode } from "react";
import { CurrencyValue } from "~/components/currency-value";
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
import { useIsMobile } from "~/hooks/use-mobile";
import { fmtPct, meteoraUrl, solscanAccountUrl } from "~/lib/format";
import { proxiedIconUrl } from "~/lib/icon";
import { type Currency, organicBucket, rugBucket } from "~/lib/pools";

function Metric({ label, value }: { label: string; value: ReactNode }) {
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
	const isMobile = useIsMobile();
	if (!pool) return null;
	const price = pool.price >= 1 ? pool.price.toFixed(3) : pool.price.toFixed(5);
	const amount = (value: number) => (
		<CurrencyValue
			currency={currency}
			value={currency === "sol" ? value / (solPrice ?? 1) : value}
		/>
	);
	const metrics: { label: string; value: ReactNode }[] = [
		{ label: "Market cap", value: amount(pool.mcap) },
		{ label: "TVL", value: amount(pool.tvl) },
		{
			label: "Active TVL",
			value: amount(pool.activeTvl),
		},
		{ label: "Volume", value: amount(pool.volume) },
		{ label: "Fees", value: amount(pool.fee) },
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
			<SheetContent
				side={isMobile ? "bottom" : "right"}
				className="!h-[90dvh] !max-h-[90dvh] overflow-y-auto sm:!h-auto sm:!max-h-none sm:max-w-md"
			>
				<SheetHeader>
					<div className="flex items-center gap-3">
						<div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
							<div className="flex h-full w-full items-center justify-center text-sm font-bold">
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
							href={solscanAccountUrl(pool.pool)}
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
