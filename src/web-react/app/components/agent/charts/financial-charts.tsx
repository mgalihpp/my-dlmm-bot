import type { AnalyticsPayload } from "@vexis/shared/agent-analytics.js";
import { memo } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ComposedChart,
	Line,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";
import { fmtPct } from "~/lib/format";

const f1Config = {
	closes: { label: "Closes", color: "var(--chart-1)" },
	winRate: { label: "Win rate", color: "var(--chart-2)" },
	avgPnl: { label: "Avg PnL", color: "var(--chart-4)" },
} satisfies ChartConfig;

const f2Config = {
	value: { label: "Cumulative PnL", color: "var(--color-emerald-500)" },
} satisfies ChartConfig;

const f3Config = {
	count: { label: "Trades", color: "var(--chart-1)" },
} satisfies ChartConfig;

function bucketValue(bucket: string): number {
	switch (bucket) {
		case "<-10":
			return -15;
		case "-10_-5":
			return -7.5;
		case "-5_-2":
			return -3.5;
		case "-2_0":
			return -1;
		case "0_2":
			return 1;
		case "2_5":
			return 3.5;
		case "5_10":
			return 7.5;
		default:
			return 15;
	}
}

function pnlColor(v: number): string {
	return v >= 0 ? "var(--color-emerald-500)" : "var(--color-red-500)";
}

export const FinancialCharts = memo(function FinancialCharts({
	data,
}: {
	data: AnalyticsPayload["financial"];
}) {
	const hasBuckets = data.buckets.length > 0;

	return (
		<div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-2">
			<Card className="@4xl/main:col-span-2">
				<CardHeader>
					<CardTitle>Win rate &amp; average PnL</CardTitle>
					<p className="text-sm text-muted-foreground">
						Per bucket (daily / weekly by range)
					</p>
				</CardHeader>
				<CardContent>
					{!hasBuckets ? (
						<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
							No closed trades yet — perf appears after TP/SL/close.
						</div>
					) : (
						<ChartContainer config={f1Config} className="h-64 w-full">
							<ComposedChart data={data.buckets}>
								<CartesianGrid vertical={false} />
								<XAxis
									dataKey="label"
									tickLine={false}
									axisLine={false}
									tickMargin={8}
								/>
								<YAxis
									yAxisId="left"
									tickLine={false}
									axisLine={false}
									width={32}
								/>
								<YAxis
									yAxisId="right"
									orientation="right"
									tickLine={false}
									axisLine={false}
									width={40}
									tickFormatter={(v: number) => `${v}%`}
								/>
								<ChartTooltip
									content={
										<ChartTooltipContent
											formatter={(value, name) => (
												<span>
													{name === "closes" ? `${value} trades` : `${value}%`}
												</span>
											)}
										/>
									}
								/>
								<Bar
									yAxisId="left"
									dataKey="closes"
									fill="var(--color-closes)"
									radius={[4, 4, 0, 0]}
								/>
								<ReferenceLine yAxisId="right" y={0} stroke="var(--border)" />
								<Line
									yAxisId="right"
									type="monotone"
									dot={false}
									strokeWidth={2}
									dataKey="winRate"
									stroke="var(--color-winRate)"
								/>
								<Line
									yAxisId="right"
									type="monotone"
									dot={false}
									strokeWidth={2}
									dataKey="avgPnl"
									stroke="var(--color-avgPnl)"
								/>
							</ComposedChart>
						</ChartContainer>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Cumulative PnL</CardTitle>
					<p className="text-sm text-muted-foreground">
						Running total of closed-trade PnL %
					</p>
				</CardHeader>
				<CardContent>
					{data.cumulative.length < 2 ? (
						<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
							No closed trades yet — perf appears after TP/SL/close.
						</div>
					) : (
						<ChartContainer config={f2Config} className="h-64 w-full">
							<AreaChart
								accessibilityLayer
								data={data.cumulative}
								margin={{ left: 0, right: 10 }}
							>
								<CartesianGrid vertical={false} />
								<XAxis
									dataKey="label"
									tickLine={false}
									axisLine={false}
									tickMargin={8}
								/>
								<YAxis
									tickLine={false}
									axisLine={false}
									width={40}
									tickFormatter={(v: number) => `${v}%`}
								/>
								<ChartTooltip
									cursor={false}
									content={
										<ChartTooltipContent
											formatter={(value) => fmtPct(value as number)}
										/>
									}
								/>
								<ReferenceLine y={0} stroke="var(--border)" />
								<Area
									dataKey="cumPnl"
									type="natural"
									fill="var(--color-value)"
									fillOpacity={0.25}
									stroke="var(--color-value)"
									strokeWidth={2}
								/>
							</AreaChart>
						</ChartContainer>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>PnL distribution</CardTitle>
					<p className="text-sm text-muted-foreground">
						Closed trades by PnL bucket
					</p>
				</CardHeader>
				<CardContent>
					<ChartContainer config={f3Config} className="h-64 w-full">
						<BarChart
							layout="vertical"
							data={data.distribution}
							margin={{ left: 8, right: 12 }}
						>
							<CartesianGrid horizontal={false} />
							<XAxis type="number" tickLine={false} axisLine={false} />
							<YAxis
								type="category"
								dataKey="bucket"
								tickLine={false}
								axisLine={false}
								width={56}
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<Bar
								dataKey="count"
								radius={[0, 4, 4, 0]}
								fill="var(--color-count)"
							>
								{data.distribution.map((d) => (
									<Cell key={d.bucket} fill={pnlColor(bucketValue(d.bucket))} />
								))}
							</Bar>
						</BarChart>
					</ChartContainer>
				</CardContent>
			</Card>
		</div>
	);
});
