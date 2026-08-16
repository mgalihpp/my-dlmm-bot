import type { ScreenedPool } from "@vexis/domain/index.js";
import { useMemo } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Scatter,
	ScatterChart,
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
import { type Currency, fmtAmount } from "~/lib/pools";

const tvlConfig = {
	tvl: { label: "TVL", color: "var(--chart-1)" },
} satisfies ChartConfig;

const scatterConfig = {
	mcap: { label: "Market cap", color: "var(--chart-2)" },
	volume: { label: "Volume", color: "var(--chart-4)" },
} satisfies ChartConfig;

export function MarketCharts({
	pools,
	currency,
	solPrice,
}: {
	pools: readonly ScreenedPool[];
	currency: Currency;
	solPrice: number | null;
}) {
	const { top, scatter } = useMemo(() => {
		const top = [...pools]
			.sort((a, b) => b.tvl - a.tvl)
			.slice(0, 10)
			.map((p) => ({
				name: p.name || p.baseSymbol || p.pool.slice(0, 8),
				tvl: p.tvl,
			}));

		const scatter = pools
			.filter((p) => p.mcap > 0 && p.volume > 0)
			.map((p) => ({
				name: p.name || p.baseSymbol || p.pool.slice(0, 8),
				mcap: p.mcap,
				volume: p.volume,
			}));

		return { top, scatter };
	}, [pools]);

	return (
		<div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-2">
			<Card className="h-full">
				<CardHeader>
					<CardTitle>Top pools by TVL</CardTitle>
					<p className="text-sm text-muted-foreground">
						Highest TVL among screened pools
					</p>
				</CardHeader>
				<CardContent>
					<ChartContainer config={tvlConfig} className="h-72 w-full">
						<BarChart accessibilityLayer data={top} layout="vertical">
							<CartesianGrid horizontal={false} />
							<XAxis
								type="number"
								tickLine={false}
								axisLine={false}
								tickFormatter={(v) => fmtAmount(Number(v), currency, solPrice)}
							/>
							<YAxis
								type="category"
								dataKey="name"
								tickLine={false}
								axisLine={false}
								width={90}
							/>
							<ChartTooltip
								cursor={false}
								content={
									<ChartTooltipContent
										formatter={(value) =>
											fmtAmount(Number(value), currency, solPrice)
										}
									/>
								}
							/>
							<Bar dataKey="tvl" fill="var(--color-tvl)" radius={4} />
						</BarChart>
					</ChartContainer>
				</CardContent>
			</Card>

			<Card className="h-full">
				<CardHeader>
					<CardTitle>Market cap vs volume</CardTitle>
					<p className="text-sm text-muted-foreground">
						Log scale, per screened pool
					</p>
				</CardHeader>
				<CardContent>
					<ChartContainer
						config={scatterConfig}
						className="h-72 w-full [&_.recharts-cartesian-axis-tick_text]:fill-foreground [&_.recharts-scatter-symbol]:fill-cyan-400 [&_.recharts-scatter-symbol]:stroke-background"
					>
						<ScatterChart
							accessibilityLayer
							data={scatter}
							margin={{ left: 18, right: 12, bottom: 8 }}
						>
							<CartesianGrid stroke="var(--border)" />
							<XAxis
								type="number"
								dataKey="mcap"
								name="Market cap"
								scale="log"
								domain={["auto", "auto"]}
								tickFormatter={(v) => fmtAmount(Number(v), currency, solPrice)}
								width={90}
							/>
							<YAxis
								type="number"
								dataKey="volume"
								name="Volume"
								scale="log"
								domain={["auto", "auto"]}
								tickFormatter={(v) => fmtAmount(Number(v), currency, solPrice)}
								width={90}
							/>
							<ChartTooltip
								cursor={{ strokeDasharray: "3 3" }}
								content={
									<ChartTooltipContent
										formatter={(value, name) =>
											`${name}: ${fmtAmount(Number(value), currency, solPrice)}`
										}
									/>
								}
							/>
							<Scatter
								dataKey="volume"
								fill="#22d3ee"
								stroke="var(--background)"
								strokeWidth={1.5}
							/>
						</ScatterChart>
					</ChartContainer>
				</CardContent>
			</Card>
		</div>
	);
}
