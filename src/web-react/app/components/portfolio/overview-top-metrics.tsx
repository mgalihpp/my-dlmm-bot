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
import type { Currency } from "~/lib/currency";
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
			className="h-14 w-24 aspect-video"
			style={
				{
					"--color-wins": "oklch(0.696 0.17 162.48)",
					"--color-losses": "oklch(0.637 0.237 25.331)",
				} as React.CSSProperties
			}
		>
			<PieChart>
				<ChartTooltip content={<ChartTooltipContent hideLabel />} />
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
			className="aspect-square h-16"
			style={
				{
					"--color-grossProfit": "oklch(0.696 0.17 162.48)",
					"--color-grossLoss": "oklch(0.637 0.237 25.331)",
				} as React.CSSProperties
			}
		>
			<PieChart>
				<ChartTooltip content={<ChartTooltipContent hideLabel />} />
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

export const OverviewTopMetrics = memo(function OverviewTopMetrics({
	metrics,
	currency,
}: {
	metrics: OverviewMetrics;
	currency: Currency;
}) {
	const isSol = currency === "sol";
	const netPnl = isSol ? metrics.netPnlSol : metrics.netPnlUsd;
	const netPnlLabel =
		netPnl == null
			? "—"
			: `${netPnl >= 0 ? "" : ""}${formatNum(netPnl)} ${isSol ? "SOL" : "USD"}`;
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
		metrics.profitFactor == null ? "—" : metrics.profitFactor.toFixed(3);
	const avgRatioLabel =
		metrics.avgRatio == null ? "—" : metrics.avgRatio.toFixed(3);

	const avgWinLabel =
		metrics.avgWinSol == null ? "—" : `${formatNum(metrics.avgWinSol)} SOL`;
	const avgLossLabel =
		metrics.avgLossSol == null ? "—" : `${formatNum(metrics.avgLossSol)} SOL`;

	const posPct =
		metrics.avgWinSol != null && metrics.avgLossSol != null
			? (Math.abs(metrics.avgWinSol) /
					(Math.abs(metrics.avgWinSol) + Math.abs(metrics.avgLossSol))) *
				100
			: 50;

	return (
		<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
			<Card data-size="sm" className="py-3">
				<CardContent className="flex h-full flex-col justify-center gap-1">
					<div className="flex items-center gap-1.5">
						<span className="text-xs text-muted-foreground">Net P&L</span>
						<InfoIcon className="size-3 text-muted-foreground/50" />
						<span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
							{metrics.totalClosed}
						</span>
					</div>
					<span className={`font-bold text-2xl ${netPnlColor}`}>
						{netPnlLabel}
					</span>
				</CardContent>
			</Card>

			<Card data-size="sm" className="py-3">
				<CardContent className="grid h-full grid-cols-2 gap-2">
					<div className="flex flex-col justify-center gap-1">
						<div className="flex items-center gap-1.5">
							<span className="text-xs text-muted-foreground">
								Position win %
							</span>
							<InfoIcon className="size-3 text-muted-foreground/50" />
						</div>
						<span className="font-bold text-2xl text-foreground">
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

			<Card data-size="sm" className="py-3">
				<CardContent className="grid h-full grid-cols-2 gap-2">
					<div className="flex flex-col justify-center gap-1">
						<div className="flex items-center gap-1.5">
							<span className="text-xs text-muted-foreground">
								Profit factor
							</span>
							<InfoIcon className="size-3 text-muted-foreground/50" />
						</div>
						<span className="font-bold text-2xl text-foreground">
							{profitFactorLabel}
						</span>
					</div>
					<div className="flex flex-col items-center justify-center">
						<FullDonut
							grossProfit={metrics.grossProfitSol}
							grossLoss={metrics.grossLossSol}
						/>
						<div className="mt-1 flex w-full items-center justify-between gap-2 text-[10px]">
							<span className="text-emerald-500">
								{formatNum(metrics.grossProfitSol)} SOL
							</span>
							<span className="text-red-500">
								{formatNum(metrics.grossLossSol)} SOL
							</span>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card data-size="sm" className="py-3">
				<CardContent className="grid h-full grid-cols-2 gap-2">
					<div className="flex flex-col justify-center gap-1">
						<div className="flex items-center gap-1.5">
							<span className="text-xs text-muted-foreground">Day win %</span>
							<InfoIcon className="size-3 text-muted-foreground/50" />
						</div>
						<span className="font-bold text-2xl text-foreground">
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
						<InfoIcon className="size-3 text-muted-foreground/50" />
					</div>
					<div className="flex items-center gap-3">
						<span className="font-bold text-2xl text-foreground">
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
