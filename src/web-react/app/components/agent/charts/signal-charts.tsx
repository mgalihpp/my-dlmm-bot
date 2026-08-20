import type { AnalyticsPayload } from "@vexis/shared/agent-analytics.js";
import type { SignalName } from "@vexis/telegram/agent/signalWeights.js";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
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

const s1Config = {
	lift: { label: "Lift", color: "var(--chart-2)" },
} satisfies ChartConfig;

const s2Config = {
	weight: { label: "Weight", color: "var(--chart-1)" },
} satisfies ChartConfig;

function weightBadge(v: number): string {
	if (v >= 1.2) return "high";
	if (v <= 0.7) return "low";
	return "neutral";
}

export function SignalCharts({ data }: { data: AnalyticsPayload["signals"] }) {
	const weightsEntries = (
		Object.entries(data.weights) as [SignalName, number][]
	)
		.map(([signal, weight]) => ({ signal, weight }))
		.sort((a, b) => b.weight - a.weight);

	const learning = data.perfCount < data.minSamples;
	const lifts = [...data.lifts].reverse();

	return (
		<div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-2">
			<Card className="@4xl/main:col-span-2">
				<CardHeader>
					<CardTitle>Signal lift (Darwinian)</CardTitle>
					<p className="text-sm text-muted-foreground">
						Distinguishing power of each signal — learned from closed trades
					</p>
				</CardHeader>
				<CardContent>
					{learning ? (
						<div className="flex h-64 items-center justify-center text-center text-sm text-muted-foreground">
							Need {data.minSamples - data.perfCount} more closes to learn (have{" "}
							{data.perfCount}). Weights stay neutral.
						</div>
					) : (
						<ChartContainer config={s1Config} className="h-64 w-full">
							<BarChart
								layout="vertical"
								data={lifts}
								margin={{ left: 8, right: 12 }}
							>
								<CartesianGrid horizontal={false} />
								<XAxis
									type="number"
									tickLine={false}
									axisLine={false}
									tickFormatter={(v: number) => v.toFixed(2)}
								/>
								<YAxis
									type="category"
									dataKey="signal"
									tickLine={false}
									axisLine={false}
									width={120}
								/>
								<ChartTooltip content={<ChartTooltipContent />} />
								<ReferenceLine x={0} stroke="var(--border)" />
								<Bar
									dataKey="lift"
									radius={[0, 4, 4, 0]}
									fill="var(--color-lift)"
								>
									{lifts.map((l) => (
										<Cell
											key={l.signal}
											fill={
												l.lift >= 0
													? "var(--color-emerald-500)"
													: "var(--color-red-500)"
											}
										/>
									))}
								</Bar>
							</BarChart>
						</ChartContainer>
					)}
				</CardContent>
			</Card>

			<Card className="@4xl/main:col-span-2">
				<CardHeader>
					<CardTitle>Current signal weights</CardTitle>
					<p className="text-sm text-muted-foreground">
						Neutral = 1.0 (dashed). High ≥ 1.2, low ≤ 0.7.
					</p>
				</CardHeader>
				<CardContent>
					<ChartContainer config={s2Config} className="h-80 w-full">
						<BarChart
							layout="vertical"
							data={weightsEntries}
							margin={{ left: 8, right: 12 }}
						>
							<CartesianGrid horizontal={false} />
							<XAxis
								type="number"
								tickLine={false}
								axisLine={false}
								tickFormatter={(v: number) => v.toFixed(2)}
							/>
							<YAxis
								type="category"
								dataKey="signal"
								tickLine={false}
								axisLine={false}
								width={120}
							/>
							<ChartTooltip
								content={
									<ChartTooltipContent
										formatter={(value) => {
											const v = Number(value);
											return `${v.toFixed(2)} (${weightBadge(v)})`;
										}}
									/>
								}
							/>
							<ReferenceLine
								x={1}
								stroke="var(--border)"
								strokeDasharray="4 4"
							/>
							<Bar
								dataKey="weight"
								radius={[0, 4, 4, 0]}
								fill="var(--color-weight)"
							>
								{weightsEntries.map((w) => (
									<Cell
										key={w.signal}
										fill={
											w.weight >= 1.2
												? "var(--color-emerald-500)"
												: w.weight <= 0.7
													? "var(--color-red-500)"
													: "var(--color-muted-foreground)"
										}
									/>
								))}
							</Bar>
						</BarChart>
					</ChartContainer>
				</CardContent>
			</Card>
		</div>
	);
}
