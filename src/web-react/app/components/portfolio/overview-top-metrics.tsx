import { InfoIcon } from "lucide-react";
import { memo } from "react";
import { Pie, PieChart } from "recharts";
import { Card, CardContent } from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";
import { Skeleton } from "~/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import type { Currency } from "~/lib/currency";
import type { ResolvedRange } from "~/lib/date-range";
import { fmtPct, formatNum } from "~/lib/format";
import type { OverviewMetrics } from "~/lib/overview-analytics";

function HalfDonut({ wins, losses }: { wins: number; losses: number }) {
	const total = wins + losses;
	if (total === 0) return <div className="h-14 w-24" />;
	const data = [
		{ name: "wins", value: wins, fill: "var(--color-wins)" },
		{ name: "losses", value: losses, fill: "var(--color-losses)" },
	];
	const config = {
		wins: { label: "Wins", color: "var(--color-wins)" },
		losses: { label: "Losses", color: "var(--color-losses)" },
	} satisfies ChartConfig;
	return (
		<ChartContainer
			config={config}
			className="aspect-video h-14 w-24 overflow-visible [&_.recharts-wrapper]:overflow-visible"
			style={
				{
					"--color-wins": "oklch(0.696 0.17 162.48)",
					"--color-losses": "oklch(0.637 0.237 25.331)",
				} as React.CSSProperties
			}
		>
			<PieChart>
				<ChartTooltip
					content={<ChartTooltipContent hideLabel />}
					allowEscapeViewBox={{ x: true, y: true }}
					wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
				/>
				<Pie
					data={data}
					cx="50%"
					cy="100%"
					startAngle={180}
					endAngle={0}
					innerRadius={34}
					outerRadius={44}
					dataKey="value"
					strokeWidth={0}
				/>
			</PieChart>
		</ChartContainer>
	);
}

function FullDonut({
	grossProfit,
	grossLoss,
}: {
	grossProfit: number;
	grossLoss: number;
}) {
	const pos = Math.abs(grossProfit);
	const neg = Math.abs(grossLoss);
	const total = pos + neg;
	if (total === 0) return <div className="h-16 w-16" />;
	const data = [
		{ name: "grossProfit", value: pos, fill: "var(--color-grossProfit)" },
		{ name: "grossLoss", value: neg, fill: "var(--color-grossLoss)" },
	];
	const config = {
		grossProfit: { label: "Profit", color: "var(--color-grossProfit)" },
		grossLoss: { label: "Loss", color: "var(--color-grossLoss)" },
	} satisfies ChartConfig;
	return (
		<ChartContainer
			config={config}
			className="aspect-square h-16 overflow-visible [&_.recharts-wrapper]:overflow-visible"
			style={
				{
					"--color-grossProfit": "oklch(0.696 0.17 162.48)",
					"--color-grossLoss": "oklch(0.637 0.237 25.331)",
				} as React.CSSProperties
			}
		>
			<PieChart>
				<ChartTooltip
					content={<ChartTooltipContent hideLabel />}
					allowEscapeViewBox={{ x: true, y: true }}
					wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
				/>
				<Pie
					data={data}
					cx="50%"
					cy="50%"
					innerRadius={20}
					outerRadius={28}
					dataKey="value"
					strokeWidth={0}
				/>
			</PieChart>
		</ChartContainer>
	);
}

export const OverviewTopMetricsSkeleton = memo(
	function OverviewTopMetricsSkeleton() {
		return (
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
				<Card data-size="sm" className="py-3">
					<CardContent className="flex h-full flex-col justify-center gap-1">
						<div className="flex items-center gap-1.5">
							<Skeleton className="h-3 w-14" />
							<Skeleton className="size-3 rounded-full" />
							<span className="ml-auto">
								<Skeleton className="h-4 w-8 rounded" />
							</span>
						</div>
						<Skeleton className="mt-1 h-7 w-28" />
					</CardContent>
				</Card>

				<Card data-size="sm" className="py-3">
					<CardContent className="grid h-full grid-cols-2 gap-2">
						<div className="flex flex-col justify-center gap-1">
							<div className="flex items-center gap-1.5">
								<Skeleton className="h-3 w-20" />
								<Skeleton className="size-3 rounded-full" />
							</div>
							<Skeleton className="h-7 w-16" />
						</div>
						<div className="flex flex-col items-center justify-center gap-1.5">
							<Skeleton className="h-14 w-24 rounded-t-3xl" />
							<div className="flex w-24 items-center justify-between gap-2">
								<Skeleton className="h-3 w-6" />
								<Skeleton className="h-3 w-6" />
							</div>
						</div>
					</CardContent>
				</Card>

				<Card data-size="sm" className="py-3">
					<CardContent className="grid h-full grid-cols-2 gap-2">
						<div className="flex flex-col justify-center gap-1">
							<div className="flex items-center gap-1.5">
								<Skeleton className="h-3 w-18" />
								<Skeleton className="size-3 rounded-full" />
							</div>
							<Skeleton className="h-7 w-12" />
						</div>
						<div className="flex flex-col items-center justify-center gap-1">
							<Skeleton className="size-16 rounded-full" />
							<div className="mt-1 flex w-full items-center justify-between gap-2">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-3 w-16" />
							</div>
						</div>
					</CardContent>
				</Card>

				<Card data-size="sm" className="py-3">
					<CardContent className="grid h-full grid-cols-2 gap-2">
						<div className="flex flex-col justify-center gap-1">
							<div className="flex items-center gap-1.5">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="size-3 rounded-full" />
							</div>
							<Skeleton className="h-7 w-14" />
						</div>
						<div className="flex flex-col items-center justify-center gap-1.5">
							<Skeleton className="h-14 w-24 rounded-t-3xl" />
							<div className="flex w-24 items-center justify-between gap-2">
								<Skeleton className="h-3 w-6" />
								<Skeleton className="h-3 w-6" />
							</div>
						</div>
					</CardContent>
				</Card>

				<Card data-size="sm" className="py-3">
					<CardContent className="flex h-full flex-col justify-center gap-1">
						<div className="flex items-center gap-1.5">
							<Skeleton className="h-3 w-28" />
							<Skeleton className="size-3 rounded-full" />
						</div>
						<div className="flex items-center gap-3">
							<Skeleton className="h-7 w-10" />
							<div className="flex flex-1 flex-col justify-center gap-1">
								<Skeleton className="h-2 w-full rounded-full" />
								<div className="flex w-full items-center justify-between">
									<Skeleton className="h-3 w-16" />
									<Skeleton className="h-3 w-16" />
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	},
);

export const OverviewTopMetrics = memo(function OverviewTopMetrics({
	metrics,
	currency,
	dateRange,
	countBasis = "pools",
	positionCount = null,
}: {
	metrics: OverviewMetrics;
	currency: Currency;
	dateRange?: ResolvedRange | null;
	countBasis?: "pools" | "positions";
	positionCount?: number | null;
}) {
	const isSol = currency === "sol";
	const netPnl = isSol ? metrics.netPnlSol : metrics.netPnlUsd;
	const netPnlLabel =
		netPnl == null
			? "—"
			: `${netPnl >= 0 ? "" : ""}${formatNum(netPnl, isSol ? 3 : 2)} ${isSol ? "SOL" : "USD"}`;
	const netPnlColor =
		netPnl == null
			? "text-foreground"
			: netPnl >= 0
				? "text-emerald-500"
				: "text-red-500";

	const winPctLabel = metrics.winPct == null ? "—" : fmtPct(metrics.winPct);
	const dayWinPctLabel =
		metrics.dayWinPct == null ? "—" : fmtPct(metrics.dayWinPct);
	const profitFactorLabel =
		metrics.profitFactor == null ? "—" : metrics.profitFactor.toFixed(2);
	const avgRatioLabel =
		metrics.avgRatio == null ? "—" : metrics.avgRatio.toFixed(2);

	const unit = isSol ? "SOL" : "USD";
	const avgWinLabel =
		metrics.avgWinSol == null
			? "—"
			: `${formatNum(metrics.avgWinSol, isSol ? 3 : 2)} ${unit}`;
	const avgLossLabel =
		metrics.avgLossSol == null
			? "—"
			: `${formatNum(metrics.avgLossSol, isSol ? 3 : 2)} ${unit}`;
	const posPct =
		metrics.avgWinSol != null && metrics.avgLossSol != null
			? (Math.abs(metrics.avgWinSol) /
					(Math.abs(metrics.avgWinSol) + Math.abs(metrics.avgLossSol))) *
				100
			: 50;
	const grossProfit = isSol ? metrics.grossProfitSol : metrics.grossProfitUsd;
	const grossLoss = isSol ? metrics.grossLossSol : metrics.grossLossUsd;
	const isBounded = dateRange?.kind === "bounded";
	const badgeCount =
		!isBounded && positionCount != null
			? positionCount
			: metrics.totalClosed;
	const badgeTitle =
		!isBounded && positionCount != null && countBasis === "pools"
			? `${positionCount} closed positions across ${metrics.totalClosed} pools`
			: `${metrics.totalClosed} closed ${countBasis}`;

	return (
		<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
			<Card data-size="sm" className="py-3">
				<CardContent className="flex h-full flex-col justify-center gap-1">
					<div className="flex items-center gap-1.5">
						<span className="text-xs text-muted-foreground">Net P&L</span>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label="Net P&L info"
									className="cursor-help rounded-full text-muted-foreground/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								>
									<InfoIcon className="size-3" />
								</button>
							</TooltipTrigger>
							<TooltipContent className="max-w-xs">
								Realized PnL from closed {countBasis} plus unrealized PnL from
								open positions. Badge shows total closed positions
								{countBasis === "pools"
									? ` across ${metrics.totalClosed} aggregated pools`
									: ""}
								.
							</TooltipContent>
						</Tooltip>
						<span
							className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
							title={badgeTitle}
						>
							{badgeCount}
						</span>
					</div>
					<span className={`text-2xl font-bold ${netPnlColor}`}>
						{netPnlLabel}
					</span>
				</CardContent>
			</Card>

			<Card data-size="sm" className="overflow-visible py-3">
				<CardContent className="grid h-full grid-cols-2 gap-2">
					<div className="flex flex-col justify-center gap-1">
						<div className="flex items-center gap-1.5">
							<span className="text-xs text-muted-foreground">
								Position win %
							</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										aria-label="Position win % info"
										className="cursor-help rounded-full text-muted-foreground/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									>
										<InfoIcon className="size-3" />
									</button>
								</TooltipTrigger>
								<TooltipContent className="max-w-xs">
									Wins divided by total closed {countBasis} (breakeven
									excluded). Half-donut shows wins vs losses.
								</TooltipContent>
							</Tooltip>
						</div>
						<span className="text-2xl font-bold text-foreground">
							{winPctLabel}
						</span>
					</div>
					<div className="flex flex-col items-center justify-center">
						<HalfDonut wins={metrics.wins} losses={metrics.losses} />
						<div className="flex w-24 items-center justify-between gap-2 text-[10px]">
							<span className="text-emerald-500">{metrics.wins}</span>
							<span className="text-red-500">{metrics.losses}</span>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card data-size="sm" className="overflow-visible py-3">
				<CardContent className="grid h-full grid-cols-2 gap-2">
					<div className="flex flex-col justify-center gap-1">
						<div className="flex items-center gap-1.5">
							<span className="text-xs text-muted-foreground">
								Profit factor
							</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										aria-label="Profit factor info"
										className="cursor-help rounded-full text-muted-foreground/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									>
										<InfoIcon className="size-3" />
									</button>
								</TooltipTrigger>
								<TooltipContent className="max-w-xs">
									Gross profit divided by absolute gross loss in {unit}. Above
									1.0 means winners outweigh losers.
								</TooltipContent>
							</Tooltip>
						</div>
						<span className="text-2xl font-bold text-foreground">
							{profitFactorLabel}
						</span>
					</div>
					<div className="flex flex-col items-center justify-center">
						<FullDonut grossProfit={grossProfit} grossLoss={grossLoss} />
						<div className="mt-1 flex w-full items-center justify-between gap-2 text-[10px]">
							<span className="text-emerald-500">
								{formatNum(grossProfit, isSol ? 3 : 2)} {unit}
							</span>
							<span className="text-red-500">
								{formatNum(grossLoss, isSol ? 3 : 2)} {unit}
							</span>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card data-size="sm" className="overflow-visible py-3">
				<CardContent className="grid h-full grid-cols-2 gap-2">
					<div className="flex flex-col justify-center gap-1">
						<div className="flex items-center gap-1.5">
							<span className="text-xs text-muted-foreground">Day win %</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										aria-label="Day win % info"
										className="cursor-help rounded-full text-muted-foreground/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									>
										<InfoIcon className="size-3" />
									</button>
								</TooltipTrigger>
								<TooltipContent className="max-w-xs">
									{dateRange?.kind === "bounded"
										? "Winning days vs losing days in the selected period (daily net PnL)."
										: "Winning days vs losing days across all history (daily net PnL)."}
								</TooltipContent>
							</Tooltip>
						</div>
						<span className="text-2xl font-bold text-foreground">
							{dayWinPctLabel}
						</span>
					</div>
					<div className="flex flex-col items-center justify-center">
						<HalfDonut wins={metrics.dayWins} losses={metrics.dayLosses} />
						<div className="flex w-24 items-center justify-between gap-2 text-[10px]">
							<span className="text-emerald-500">{metrics.dayWins}</span>
							<span className="text-red-500">{metrics.dayLosses}</span>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card data-size="sm" className="py-3">
				<CardContent className="flex h-full flex-col justify-center gap-1">
					<div className="flex items-center gap-1.5">
						<span className="text-xs text-muted-foreground">
							Avg win/loss position
						</span>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label="Avg win/loss info"
									className="cursor-help rounded-full text-muted-foreground/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								>
									<InfoIcon className="size-3" />
								</button>
							</TooltipTrigger>
							<TooltipContent className="max-w-xs">
								Ratio of average winning PnL to average losing PnL (absolute).
								Bar shows relative size of avg win vs avg loss.
							</TooltipContent>
						</Tooltip>
					</div>
					<div className="flex items-center gap-3">
						<span className="text-2xl font-bold text-foreground">
							{avgRatioLabel}
						</span>
						<div className="flex flex-1 flex-col justify-center gap-1">
							<div className="flex h-2 w-full overflow-hidden rounded-full">
								<div
									className="bg-emerald-500"
									style={{ width: `${posPct}%` }}
								/>
								<div
									className="bg-red-500"
									style={{ width: `${100 - posPct}%` }}
								/>
							</div>
							<div className="flex w-full items-center justify-between text-[10px]">
								<span className="text-emerald-500">{avgWinLabel}</span>
								<span className="text-red-500">{avgLossLabel}</span>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
});
