import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";
import type { CyclePoint } from "~/lib/server/agent.server";

const chartConfig = {
	open: { label: "Open", color: "var(--chart-1)" },
	tp: { label: "TP", color: "var(--chart-2)" },
	sl: { label: "SL", color: "var(--chart-3)" },
	close: { label: "Close", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function CycleChart({ data }: { data: readonly CyclePoint[] }) {
	const total = data.reduce((n, d) => n + d.open + d.tp + d.sl + d.close, 0);
	return (
		<Card className="h-full gap-3">
			<CardHeader className="flex flex-row items-baseline justify-between gap-2 space-y-0">
				<div>
					<CardTitle className="text-sm">Activity per cycle</CardTitle>
					<p className="text-xs text-muted-foreground">
						Successful executions · last {data.length} cycles
					</p>
				</div>
				<span className="font-mono text-xs text-muted-foreground tabular-nums">
					{total} exec
				</span>
			</CardHeader>
			<CardContent>
				{data.length === 0 ? (
					<div className="flex h-56 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-sm text-muted-foreground">
						No cycles recorded yet.
						<span className="text-xs">
							Run the agent once and activity shows up here.
						</span>
					</div>
				) : (
					<ChartContainer config={chartConfig} className="h-56 w-full">
						<BarChart accessibilityLayer data={[...data]} barCategoryGap="28%">
							<CartesianGrid vertical={false} strokeDasharray="3 3" />
							<XAxis
								dataKey="cycle"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								tick={{ fontSize: 11 }}
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								width={24}
								allowDecimals={false}
								tick={{ fontSize: 11 }}
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<Bar dataKey="open" stackId="a" fill="var(--color-open)" />
							<Bar dataKey="tp" stackId="a" fill="var(--color-tp)" />
							<Bar dataKey="sl" stackId="a" fill="var(--color-sl)" />
							<Bar
								dataKey="close"
								stackId="a"
								fill="var(--color-close)"
								radius={[3, 3, 0, 0]}
							/>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
