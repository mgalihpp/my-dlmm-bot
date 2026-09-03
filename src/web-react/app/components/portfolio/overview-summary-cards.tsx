import { TrendingUpIcon } from "lucide-react";
import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import type { Currency } from "~/lib/currency";
import { formatNum } from "~/lib/format";
import type {
	ClosedAggregates,
	OverviewMetrics,
} from "~/lib/overview-analytics";
import type { PortfolioSummary } from "~/lib/server/portfolio.server";
export const ActiveSummaryCard = memo(function ActiveSummaryCard({
	summary,
	currency,
}: {
	summary: PortfolioSummary;
	currency: Currency;
}) {
	const isSol = currency === "sol";
	const deposited = isSol ? summary.openBalanceSol : summary.openBalanceUsd;
	const current = isSol ? summary.openBalanceSol : summary.openBalanceUsd;
	const pendingFees = isSol ? summary.openFeesSol : summary.openFeesUsd;
	const currentWithFees = current + pendingFees;
	const pnl = isSol ? summary.unrealizedSol : summary.unrealizedUsd;
	const pnlPct = isSol ? summary.unrealizedSolPct : summary.unrealizedPct;
	const positive = pnl >= 0;
	const unit = isSol ? "SOL" : "USD";
	const fmt = (value: number) => `${formatNum(value, isSol ? 3 : 2)} ${unit}`;

	return (
		<Card data-size="sm" className="py-3">
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="text-sm">Active Positions Summary</CardTitle>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>{summary.openPositionCount} positions</span>
					<span className="text-border">|</span>
					<span>{summary.poolsCount} pools</span>
				</div>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col gap-2.5">
				<div className="grid flex-1 grid-cols-2 gap-3">
					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								Total Deposited
							</span>
							<span className="text-xs font-medium">{fmt(deposited)}</span>
						</div>
					</div>
					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								Current Position
							</span>
							<span className="text-xs font-medium">{fmt(current)}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								Pending Fees
							</span>
							<span className="text-xs font-medium">{fmt(pendingFees)}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								Current + Fees
							</span>
							<span className="text-xs font-semibold">
								{fmt(currentWithFees)}
							</span>
						</div>
					</div>
				</div>
				<Separator />
				<div
					className={`relative flex items-center justify-between overflow-hidden rounded-md px-3 py-2 ${positive ? "bg-emerald-500/10" : "bg-red-500/10"}`}
				>
					<span className="relative z-10 text-sm font-medium">P&L</span>
					<div className="relative z-10 flex items-center gap-2">
						<TrendingUpIcon
							className={`size-4 ${positive ? "text-emerald-500" : "text-red-500"}`}
						/>
						<span
							className={`rounded px-1.5 py-0.5 text-xs ${positive ? "bg-emerald-500/20 text-emerald-500" : "bg-red-500/20 text-red-500"}`}
						>
							{pnlPct >= 0 ? "+" : ""}
							{pnlPct.toFixed(2)}%
						</span>
						<span
							className={`text-base font-bold ${positive ? "text-emerald-500" : "text-red-500"}`}
						>
							{pnl >= 0 ? "+" : ""}
							{fmt(pnl)}
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
});

export const PerformanceCard = memo(function PerformanceCard({
	summary,
	metrics,
	currency,
	aggregates,
}: {
	summary: PortfolioSummary;
	metrics: OverviewMetrics;
	currency: Currency;
	aggregates: ClosedAggregates;
}) {
	const isSol = currency === "sol";
	const net = isSol ? metrics.netPnlSol : metrics.netPnlUsd;
	const positive = (net ?? 0) >= 0;
	const unit = isSol ? "SOL" : "USD";
	const fmt = (value: number) => `${formatNum(value, isSol ? 3 : 2)} ${unit}`;
	const winRateLabel =
		metrics.winPct == null ? "—" : `${metrics.winPct.toFixed(2)}%`;
	const totalDeposits = isSol
		? aggregates.totalDepositSol
		: aggregates.totalDepositUsd;
	const totalFees = isSol ? aggregates.totalFeeSol : aggregates.totalFeeUsd;
	const netWorth = isSol
		? summary.openBalanceSol + summary.openFeesSol
		: summary.openBalanceUsd + summary.openFeesUsd;

	return (
		<Card data-size="sm" className="py-3">
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="text-sm">Performance</CardTitle>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span className="text-emerald-500">{metrics.wins}W</span>
					<span className="text-border">/</span>
					<span className="text-red-500">{metrics.losses}L</span>
					<span className="text-border">|</span>
					<span>{metrics.totalClosed} total</span>
				</div>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col gap-2.5">
				<div className="grid flex-1 grid-cols-2 gap-3">
					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								Total Deposits
							</span>
							<span className="text-xs font-medium">{fmt(totalDeposits)}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">Total Fees</span>
							<span className="text-xs font-medium">{fmt(totalFees)}</span>
						</div>
					</div>
					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">Net Worth</span>
							<span className="text-xs font-medium">{fmt(netWorth)}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								Avg Invested / pool
							</span>
							<span className="text-xs font-medium">
								{aggregates.count > 0
									? fmt(totalDeposits / Math.max(1, aggregates.count))
									: "—"}
							</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">Win Rate</span>
							<span className="text-xs font-semibold text-emerald-500">
								{winRateLabel}
							</span>
						</div>
					</div>
				</div>
				<Separator />
				<div
					className={`relative flex items-center justify-between overflow-hidden rounded-md px-3 py-2 ${positive ? "bg-emerald-500/10" : "bg-red-500/10"}`}
				>
					<span className="relative z-10 text-sm font-medium">
						Total Profit
					</span>
					<div className="relative z-10 flex items-center gap-2">
						<TrendingUpIcon
							className={`size-4 ${positive ? "text-emerald-500" : "text-red-500"}`}
						/>
						<span
							className={`text-base font-bold ${positive ? "text-emerald-500" : "text-red-500"}`}
						>
							{net == null ? "—" : `${net >= 0 ? "+" : ""}${fmt(net)}`}
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
});
