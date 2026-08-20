import type { AnalyticsPayload } from "@vexis/shared/agent-analytics.js";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";

const o1Config = {
	open: { label: "Open", color: "var(--chart-1)" },
	hold: { label: "Hold", color: "var(--chart-5)" },
	tp: { label: "TP", color: "var(--chart-2)" },
	sl: { label: "SL", color: "var(--chart-3)" },
	closes: { label: "Close", color: "var(--chart-4)" },
} satisfies ChartConfig;

const o2Config = {
	blockedRate: { label: "Blocked", color: "var(--destructive)" },
	llmFailRate: { label: "LLM fail", color: "var(--chart-4)" },
	execFailRate: { label: "Exec fail", color: "var(--chart-3)" },
} satisfies ChartConfig;

const o3Config = {
	successRate: { label: "Success", color: "var(--color-emerald-500)" },
} satisfies ChartConfig;

export function OperationalCharts({
	data,
	onCycleClick,
}: {
	data: AnalyticsPayload["operational"];
	onCycleClick: (cycle: number) => void;
}) {
	if (data.perCycle.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
				No cycles in this range.
			</div>
		);
	}
	return (
		<div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle>Decisions per cycle</CardTitle>
					<p className="text-sm text-muted-foreground">
						Click a bar for detail — last {data.perCycle.length} cycles
					</p>
				</CardHeader>
				<CardContent>
					<ChartContainer config={o1Config} className="h-64 w-full">
						<BarChart
							data={[...data.perCycle]}
							onClick={(state) => {
								const idx = state?.activeTooltipIndex;
								if (typeof idx === "number" && data.perCycle[idx]) {
									onCycleClick(data.perCycle[idx].cycle);
								}
							}}
						>
							<CartesianGrid vertical={false} />
							<XAxis
								dataKey="cycle"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								width={20}
								allowDecimals={false}
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<Bar dataKey="open" stackId="a" fill="var(--color-open)" />
							<Bar dataKey="hold" stackId="a" fill="var(--color-hold)" />
							<Bar dataKey="tp" stackId="a" fill="var(--color-tp)" />
							<Bar dataKey="sl" stackId="a" fill="var(--color-sl)" />
							<Bar
								dataKey="closes"
								stackId="a"
								fill="var(--color-closes)"
								radius={[4, 4, 0, 0]}
							/>
						</BarChart>
					</ChartContainer>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Guardrail &amp; health</CardTitle>
					<p className="text-sm text-muted-foreground">
						Blocked / LLM-failed / execution-failed per day
					</p>
				</CardHeader>
				<CardContent>
					<ChartContainer config={o2Config} className="h-64 w-full">
						<LineChart data={[...data.daily]}>
							<CartesianGrid vertical={false} />
							<XAxis
								dataKey="date"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
							/>
							<YAxis
								domain={[0, 100]}
								tickLine={false}
								axisLine={false}
								width={32}
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<ChartLegend content={<ChartLegendContent />} />
							<Line
								dataKey="blockedRate"
								type="monotone"
								dot={false}
								stroke="var(--color-blockedRate)"
								strokeWidth={2}
							/>
							<Line
								dataKey="llmFailRate"
								type="monotone"
								dot={false}
								stroke="var(--color-llmFailRate)"
								strokeWidth={2}
							/>
							<Line
								dataKey="execFailRate"
								type="monotone"
								dot={false}
								stroke="var(--color-execFailRate)"
								strokeWidth={2}
								strokeDasharray="4 4"
							/>
						</LineChart>
					</ChartContainer>
				</CardContent>
			</Card>

			<Card className="@4xl/main:col-span-2">
				<CardHeader>
					<CardTitle>Success rate trend</CardTitle>
					<p className="text-sm text-muted-foreground">
						Open decisions as % of all decisions, per cycle
					</p>
				</CardHeader>
				<CardContent>
					<ChartContainer config={o3Config} className="h-64 w-full">
						<AreaChart data={[...data.perCycle]}>
							<CartesianGrid vertical={false} />
							<XAxis
								dataKey="cycle"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
							/>
							<YAxis
								domain={[0, 100]}
								tickLine={false}
								axisLine={false}
								width={32}
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<ReferenceLine
								y={50}
								stroke="var(--border)"
								strokeDasharray="4 4"
							/>
							<Area
								dataKey="successRate"
								type="natural"
								fill="var(--color-successRate)"
								fillOpacity={0.25}
								stroke="var(--color-successRate)"
								strokeWidth={2}
							/>
						</AreaChart>
					</ChartContainer>
				</CardContent>
			</Card>
		</div>
	);
}
