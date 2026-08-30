import { TrendingUpIcon } from "lucide-react";
import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import type { Currency } from "~/lib/currency";
import { formatNum } from "~/lib/format";
import type { OverviewMetrics } from "~/lib/overview-analytics";
import type {
	PortfolioSummary,
	PortfolioTotal,
} from "~/lib/server/portfolio.server";
export const ActiveSummaryCard = memo(function ActiveSummaryCard({
	summary,
	currency,
}: {
	summary: PortfolioSummary;
	currency: Currency;
}) {
	const isSol = currency === "sol";
	const deposited = isSol ? summary.openBalanceSol : summary.openBalanceUsd;
	const withdrawn = 0;
	const claimedFees = 0;
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
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								Total Withdrawn
							</span>
							<span className="text-xs font-medium">{fmt(withdrawn)}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								Claimed Fees
							</span>
							<span className="text-xs font-medium">{fmt(claimedFees)}</span>
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
							className={`font-bold text-base ${positive ? "text-emerald-500" : "text-red-500"}`}
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
	total,
	metrics,
	currency,
}: {
	summary: PortfolioSummary;
	total: PortfolioTotal | null;
	metrics: OverviewMetrics;
	currency: Currency;
}) {
	const isSol = currency === "sol";
	const totalPnl = isSol
		? Number.parseFloat(total?.totalPnlSol ?? "0") || 0
		: Number.parseFloat(total?.totalPnlUsd ?? "0") || 0;
	const positive = totalPnl >= 0;
	const unit = isSol ? "SOL" : "USD";
	const fmt = (value: number) => `${formatNum(value, isSol ? 3 : 2)} ${unit}`;
	const winRateLabel =
		metrics.winPct == null ? "—" : `${metrics.winPct.toFixed(2)}%`;

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
							<span className="text-xs font-medium">
								{fmt(
									summary.openBalanceSol + (isSol ? metrics.grossProfitSol : 0),
								)}
							</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								Total Withdrawals
							</span>
							<span className="text-xs font-medium">{fmt(0)}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">Total Fees</span>
							<span className="text-xs font-medium">
								{fmt(summary.openFeesSol)}
							</span>
						</div>
					</div>
					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">Net Worth</span>
							<span className="text-xs font-medium">
								{fmt(totalPnl || summary.openBalanceSol)}
							</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								Avg Invested
							</span>
							<span className="text-xs font-medium">
								{metrics.totalClosed > 0
									? fmt(
											summary.openBalanceSol / Math.max(1, metrics.totalClosed),
										)
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
							className={`font-bold text-base ${positive ? "text-emerald-500" : "text-red-500"}`}
						>
							{totalPnl >= 0 ? "+" : ""}
							{fmt(
								totalPnl ||
									(isSol ? (metrics.netPnlSol ?? 0) : (metrics.netPnlUsd ?? 0)),
							)}
						</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
});
