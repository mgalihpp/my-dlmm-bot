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
	const lastValue = last?.value ?? 0;
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
}
