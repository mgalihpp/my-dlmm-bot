import type { ClosedPool } from "@vexis/domain/portfolio.js";
import type { PositionPnLData } from "@vexis/domain/position.js";
import { ShareIcon } from "lucide-react";
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
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import {
	buildCumulative,
	buildCumulativeFromPositions,
} from "~/lib/cumulative-pnl";
import type { Currency } from "./portfolio-page";

type PnlMode = "fees" | "total";

export const EquityChart = memo(function EquityChart({
	closed,
	positions,
	currency,
	loading = false,
}: {
	closed: readonly ClosedPool[];
	positions?: readonly PositionPnLData[];
	currency: Currency;
	loading?: boolean;
}) {
	const [mode, setMode] = useState<PnlMode>("total");
	const { points, stops, chartConfig } = useMemo(() => {
		const cum =
			positions && positions.length > 0
				? buildCumulativeFromPositions(positions, currency)
				: buildCumulative(closed, currency);
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

		return { points, stops, chartConfig };
	}, [closed, currency, mode, positions]);

	return (
		<Card className="h-full">
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<div className="flex items-center gap-1.5">
					<CardTitle>Cumulative P&L</CardTitle>
					<Button
						variant="ghost"
						size="icon"
						className="size-6 text-muted-foreground hover:text-white"
						aria-label="Share"
					>
						<ShareIcon className="size-3" />
					</Button>
				</div>
				<ToggleGroup
					type="single"
					value={mode}
					onValueChange={(v) => {
						if (v === "fees" || v === "total") setMode(v);
					}}
					size="sm"
					variant="outline"
					spacing={0}
				>
					<ToggleGroupItem value="fees" aria-label="Only fees">
						Only fees
					</ToggleGroupItem>
					<ToggleGroupItem value="total" aria-label="Total P&L">
						Total P&L
					</ToggleGroupItem>
				</ToggleGroup>
			</CardHeader>
			<CardContent>
				{loading && points.length < 2 ? (
					<div className="h-64 w-full animate-pulse rounded bg-muted" />
				) : points.length < 2 ? (
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
