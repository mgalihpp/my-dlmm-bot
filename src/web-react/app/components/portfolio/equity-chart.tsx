import type { ClosedPool } from "@vexis/domain/portfolio.js";
import { memo, useMemo, useState } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";
import { CurrencyValue } from "~/components/currency-value";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";
import { buildCumulative } from "~/lib/cumulative-pnl";
import type { Currency } from "./portfolio-page";

type PnlMode = "fees" | "total";

export const EquityChart = memo(function EquityChart({
	closed,
	currency,
}: {
	closed: readonly ClosedPool[];
	currency: Currency;
}) {
	const [mode, setMode] = useState<PnlMode>("total");
	const { points, stops, positive, chartConfig } = useMemo(() => {
		const cum = buildCumulative(closed, currency);
		const points = cum.map((p) => ({
			label: p.label,
			value: mode === "fees" ? p.cumFees : p.cumPnl,
		}));

		const lastValue = points.at(-1)?.value ?? 0;
		const positive = lastValue >= 0;
		const colorFor = (v: number) =>
			v >= 0 ? "var(--color-emerald-500)" : "var(--color-red-500)";

		const stops: { offset: string; color: string }[] = [];
		if (points.length > 0) {
			stops.push({ offset: "0%", color: colorFor(points[0].value) });
		}
		for (let i = 1; i < points.length; i++) {
			const previous = points[i - 1].value;
			const current = points[i].value;
			const previousColor = colorFor(previous);
			const currentColor = colorFor(current);
			if (previousColor !== currentColor) {
				const ratio =
					Math.abs(previous) / (Math.abs(previous) + Math.abs(current));
				const crossing = ((i - 1 + ratio) / (points.length - 1)) * 100;
				const offset = `${crossing}%`;
				stops.push({ offset, color: previousColor });
				stops.push({ offset, color: currentColor });
			}
		}
		if (points.length > 1) {
			stops.push({
				offset: "100%",
				color: colorFor(points.at(-1)?.value ?? 0),
			});
		}
		const chartConfig = {
			value: {
				label: "PnL",
				color: colorFor(lastValue),
			},
		} satisfies ChartConfig;

		return { points, stops, positive, chartConfig };
	}, [closed, currency, mode]);

	const last = points.at(-1);

	return (
		<Card className="h-full">
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<div className="flex items-baseline gap-2">
					<CardTitle>Cumulative P&L</CardTitle>
					<span
						className={`text-xl font-semibold tabular-nums ${positive ? "text-emerald-500" : "text-red-500"}`}
					>
						{last ? (
							<CurrencyValue currency={currency} value={last.value} />
						) : (
							"—"
						)}
					</span>
				</div>
				<div className="flex overflow-hidden rounded-md border text-xs">
					<button
						onClick={() => setMode("fees")}
						className={`px-2.5 py-1 transition-colors ${mode === "fees" ? "bg-orange-500 text-white" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
					>
						Only fees
					</button>
					<button
						onClick={() => setMode("total")}
						className={`px-2.5 py-1 transition-colors ${mode === "total" ? "bg-orange-500 text-white" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
					>
						Total P&L
					</button>
				</div>
			</CardHeader>
			<CardContent>
				{points.length < 2 ? (
					<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
						No closed positions yet.
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
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								width={56}
								tickFormatter={(v: number) => `${v.toFixed(3)}`}
							/>
							<ChartTooltip
								cursor={false}
								content={
									<ChartTooltipContent
										className="font-mono font-medium tabular-nums"
										indicator="dot"
										formatter={(value) => (
											<CurrencyValue
												currency={currency}
												value={Number(value)}
											/>
										)}
									/>
								}
							/>
							<ReferenceLine y={0} stroke="var(--border)" />
							<defs>
								<linearGradient id="pnl-grad" x1="0" y1="0" x2="1" y2="0">
									{stops.map((s) => (
										<stop
											key={`${s.offset}-${s.color}`}
											offset={s.offset}
											stopColor={s.color}
										/>
									))}
								</linearGradient>
							</defs>
							<Area
								dataKey="value"
								type="natural"
								fill="url(#pnl-grad)"
								fillOpacity={0.25}
								stroke="url(#pnl-grad)"
								strokeWidth={2}
							/>
						</AreaChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
});
