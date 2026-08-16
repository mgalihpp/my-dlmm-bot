import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
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
	return (
		<Card className="h-full">
			<CardHeader>
				<CardTitle>Decisions per cycle</CardTitle>
				<p className="text-sm text-muted-foreground">
					Successful executions — last {data.length} cycles
				</p>
			</CardHeader>
			<CardContent>
				{data.length === 0 ? (
					<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
						No cycles recorded yet.
					</div>
				) : (
					<ChartContainer config={chartConfig} className="h-64 w-full">
						<BarChart accessibilityLayer data={[...data]}>
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
							<Bar dataKey="tp" stackId="a" fill="var(--color-tp)" />
							<Bar dataKey="sl" stackId="a" fill="var(--color-sl)" />
							<Bar
								dataKey="close"
								stackId="a"
								fill="var(--color-close)"
								radius={[4, 4, 0, 0]}
							/>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}