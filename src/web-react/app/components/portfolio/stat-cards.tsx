import {
	AlertTriangleIcon,
	CircleDollarSignIcon,
	CoinsIcon,
	TrendingUpIcon,
	WalletIcon,
} from "lucide-react";
import { memo } from "react";
import { CurrencyValue } from "~/components/currency-value";
import { Badge } from "~/components/ui/badge";
import {
	Card,
	CardAction,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { fmtPct } from "~/lib/format";
import type {
	PortfolioSnapshot,
	PortfolioSummary,
	PortfolioTotal,
} from "~/lib/server/portfolio.server";
import { cn } from "~/lib/utils";
import type { Currency, RangeFilter } from "./portfolio-page";

function Sparkline({
	values,
	positive,
}: {
	values: number[];
	positive: boolean;
}) {
	if (values.length === 0) return null;
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;
	const points = values
		.map(
			(v, i) =>
				`${(i / (values.length - 1)) * 100},${20 - ((v - min) / range) * 16}`,
		)
		.join(" ");
	return (
		<svg
			viewBox="0 0 100 20"
			preserveAspectRatio="none"
			className="h-6 w-full"
			aria-hidden="true"
		>
			<polyline
				points={points}
				fill="none"
				stroke={positive ? "var(--chart-2)" : "var(--chart-1)"}
				strokeWidth="1.5"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

export const StatCards = memo(function StatCards({
	summary,
	total,
	history,
	currency,
	rangeFilter,
	onRangeFilterChange,
}: {
	summary: PortfolioSummary;
	total: PortfolioTotal;
	history: readonly PortfolioSnapshot[];
	currency: Currency;
	rangeFilter: RangeFilter;
	onRangeFilterChange: (f: RangeFilter) => void;
}) {
	const isUsd = currency === "usd";
	const equity = isUsd ? summary.openBalanceUsd : summary.openBalanceSol;
	const balanceHistory = history
		.map((s) => s.balanceUsd)
		.filter((v): v is number => v !== null)
		.slice(-24);
	const equityPositive = balanceHistory.at(-1)! >= (balanceHistory[0] ?? 0);

	return (
		<div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-5 dark:*:data-[slot=card]:bg-card">
			<Card className="@container/card">
				<CardHeader>
					<CardDescription className="flex items-center gap-1.5">
						<WalletIcon className="size-3.5" />
						Total equity
					</CardDescription>
					<CardTitle className="text-2xl font-semibold tabular-nums">
						<CurrencyValue currency={currency} value={equity} />
					</CardTitle>
				</CardHeader>
				<CardFooter className="mt-auto flex-col items-start gap-1">
					<Sparkline values={balanceHistory} positive={equityPositive} />
					<span className="text-xs text-muted-foreground">
						{summary.openPositionCount} active positions
					</span>
				</CardFooter>
			</Card>

			<Card className="@container/card">
				<CardHeader>
					<CardDescription className="flex items-center gap-1.5">
						<TrendingUpIcon className="size-3.5" />
						Realized PnL
					</CardDescription>
					<CardTitle
						className={cn(
							"text-2xl font-semibold tabular-nums",
							isUsd && Number(total.totalPnlUsd) > 0 && "text-emerald-500",
							isUsd && Number(total.totalPnlUsd) < 0 && "text-red-500",
							!isUsd && Number(total.totalPnlSol) > 0 && "text-emerald-500",
							!isUsd && Number(total.totalPnlSol) < 0 && "text-red-500",
						)}
					>
						<CurrencyValue
							currency={currency}
							value={isUsd ? total.totalPnlUsd : total.totalPnlSol}
						/>
					</CardTitle>
					<CardAction>
						<Badge variant="outline">
							{isUsd
								? fmtPct(total.totalPnlPctChange)
								: fmtPct(total.totalPnlSolPctChange)}
						</Badge>
					</CardAction>
				</CardHeader>
				<CardFooter className="mt-auto flex-col items-start gap-1.5 text-sm">
					<div className="text-xs text-muted-foreground">
						Lifetime across all pools
					</div>
				</CardFooter>
			</Card>

			<Card className="@container/card">
				<CardHeader>
					<CardDescription className="flex items-center gap-1.5">
						<CircleDollarSignIcon className="size-3.5" />
						Unrealized PnL
					</CardDescription>
					<CardTitle
						className={cn(
							"text-2xl font-semibold tabular-nums",
							(isUsd ? summary.unrealizedUsd : summary.unrealizedSol) > 0 &&
								"text-emerald-500",
							(isUsd ? summary.unrealizedUsd : summary.unrealizedSol) < 0 &&
								"text-red-500",
						)}
					>
						<CurrencyValue
							currency={currency}
							value={isUsd ? summary.unrealizedUsd : summary.unrealizedSol}
						/>
					</CardTitle>
					<CardAction>
						<Badge variant="outline">
							{isUsd
								? fmtPct(summary.unrealizedPct)
								: fmtPct(summary.unrealizedSolPct)}
						</Badge>
					</CardAction>
				</CardHeader>
				<CardFooter className="mt-auto flex-col items-start gap-1.5 text-sm">
					<div className="text-xs text-muted-foreground">
						<CurrencyValue
							currency={currency}
							value={isUsd ? summary.openBalanceUsd : summary.openBalanceSol}
						/>{" "}
						in pool balances
					</div>
				</CardFooter>
			</Card>

			<Card className="@container/card">
				<CardHeader>
					<CardDescription className="flex items-center gap-1.5">
						<CoinsIcon className="size-3.5" />
						Unclaimed fees
					</CardDescription>
					<CardTitle className="text-2xl font-semibold tabular-nums">
						<CurrencyValue
							currency={currency}
							value={isUsd ? summary.openFeesUsd : summary.openFeesSol}
						/>
					</CardTitle>
					<CardAction>
						<Badge variant="outline">
							{summary.openPositionCount} positions
						</Badge>
					</CardAction>
				</CardHeader>
				<CardFooter className="mt-auto flex-col items-start gap-1.5 text-sm">
					<div className="text-xs text-muted-foreground">
						Fees waiting to be claimed
					</div>
				</CardFooter>
			</Card>

			<Card
				className={cn(
					"@container/card cursor-pointer transition-colors",
					rangeFilter !== "all" && "ring-2 ring-ring",
				)}
				onClick={() =>
					onRangeFilterChange(rangeFilter === "all" ? "oor" : "all")
				}
			>
				<CardHeader>
					<CardDescription className="flex items-center gap-1.5">
						<AlertTriangleIcon className="size-3.5" />
						Out of range
					</CardDescription>
					<CardTitle className="text-2xl font-semibold tabular-nums">
						{summary.outOfRangePositions}
					</CardTitle>
					<CardAction>
						<Badge
							variant={summary.outOfRangePositions > 0 ? "default" : "outline"}
						>
							{summary.outOfRangePools} of {summary.poolsCount ?? 0} pools
						</Badge>
					</CardAction>
				</CardHeader>
				<CardFooter className="mt-auto flex-col items-start gap-1.5 text-sm">
					<div className="text-xs text-muted-foreground">
						Click to {rangeFilter === "all" ? "filter" : "clear"} the positions
						table
					</div>
				</CardFooter>
			</Card>
		</div>
	);
});
