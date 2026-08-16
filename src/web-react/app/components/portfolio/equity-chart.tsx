import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";
import { fmtSol, fmtUsd, tsLocal } from "~/lib/format";
import type { PortfolioSnapshot } from "~/lib/server/portfolio.server";
import type { Currency } from "./portfolio-page";

const chartConfig = {
	value: {
		label: "PnL",
		color: "var(--chart-2)",
	},
} satisfies ChartConfig;

export function EquityChart({
	history,
	currency,
}: {
	history: readonly PortfolioSnapshot[];
	currency: Currency;
}) {
	const points = history
		.filter((s) => (currency === "sol" ? s.pnlSol !== null : s.pnlUsd !== null))
		.slice(-48)
		.map((s) => ({
			label: tsLocal(s.ts),
			value: currency === "sol" ? (s.pnlSol as number) : (s.pnlUsd as number),
		}));

	const last = points.at(-1);
	const first = points[0];
	const positive = (last?.value ?? 0) >= 0;

	return (
		<Card className="h-full">
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<div className="flex items-baseline gap-2">
					<CardTitle>PnL {currency.toUpperCase()}</CardTitle>
					<span
						className={`text-xl font-semibold tabular-nums ${positive ? "text-emerald-500" : "text-red-500"}`}
					>
						{last
							? currency === "sol"
								? fmtSol(last.value)
								: fmtUsd(last.value)
							: "—"}
					</span>
				</div>
				{first && last ? (
					<span className="text-xs text-muted-foreground">
						{first.label} → {last.label}
					</span>
				) : null}
			</CardHeader>
			<CardContent>
				{points.length < 2 ? (
					<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
						No PnL history yet — snapshots appear once the page has been
						refreshed a few times.
					</div>
				) : (
					<ChartContainer config={chartConfig} className="h-64 w-full">
						<AreaChart
							accessibilityLayer
							data={points}
							margin={{ left: 0, right: 10 }}
						>
							<CartesianGrid vertical={false} />
							<XAxis
								dataKey="label"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								tickFormatter={(value: string) =>
									value.length > 12 ? `${value.slice(0, 8)}…` : value
								}
								hide
							/>
							<ChartTooltip
								cursor={false}
								content={
									<ChartTooltipContent
										indicator="dot"
										formatter={(value) =>
											currency === "sol"
												? fmtSol(Number(value))
												: fmtUsd(Number(value))
										}
									/>
								}
							/>
							<ReferenceLine y={0} stroke="var(--border)" />
							<Area
								dataKey="value"
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
	);
}
