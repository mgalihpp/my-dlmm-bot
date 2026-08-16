import type { OpenPool } from "@vexis/domain/portfolio.js";
import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";
import { fmtSol, fmtUsd, pair, pnlClass, pnlSign } from "~/lib/format";
import type { PortfolioSummary } from "~/lib/server/portfolio.server";
import { cn } from "~/lib/utils";
import type { Currency } from "./portfolio-page";

const chartConfig = {
	balance: { label: "Balance", color: "var(--chart-1)" },
	fees: { label: "Unclaimed fees", color: "var(--chart-5)" },
} satisfies ChartConfig;

export function AllocationDonut({
	pools,
	summary,
	currency,
}: {
	pools: readonly OpenPool[];
	summary: PortfolioSummary;
	currency: Currency;
}) {
	const isUsd = currency === "usd";
	const balance = isUsd ? summary.openBalanceUsd : summary.openBalanceSol;
	const fees = isUsd ? summary.openFeesUsd : summary.openFeesSol;
	const total = balance + fees;
	const fmt = isUsd ? fmtUsd : fmtSol;
	const chartData = [
		{ name: "balance", value: balance },
		{ name: "fees", value: fees },
	];

	const poolRows = pools
		.map((pool) => ({
			pair: pair(pool.tokenX, pool.tokenY),
			pnlUsd: parseFloat(pool.pnl),
			pnlSol: pool.pnlSol != null ? parseFloat(pool.pnlSol) : null,
			address: pool.poolAddress,
		}))
		.sort((a, b) => (b.pnlSol ?? 0) - (a.pnlSol ?? 0))
		.slice(0, 8);

	const totalUsd = poolRows.reduce((sum, r) => sum + r.pnlUsd, 0);
	const totalSol = poolRows.reduce((sum, r) => sum + (r.pnlSol ?? 0), 0);

	return (
		<Card className="h-full">
			<CardHeader>
				<CardTitle className="flex items-baseline justify-between">
					<span>Open positions</span>
					<span className="text-sm font-normal text-muted-foreground">
						{pools.length} pools
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="relative mx-auto h-44 w-44">
					<ChartContainer
						config={chartConfig}
						className="relative z-10 h-full w-full"
					>
						<PieChart>
							<ChartTooltip
								content={
									<ChartTooltipContent
										formatter={(value, name) => (
											<div className="flex w-full flex-col gap-0.5">
												<span className="text-muted-foreground">
													{
														chartConfig[name === "balance" ? "balance" : "fees"]
															.label
													}
												</span>
												<b className="font-mono font-medium tabular-nums">
													{fmt(Number(value))}
												</b>
											</div>
										)}
									/>
								}
							/>
							<Pie
								data={chartData}
								dataKey="value"
								nameKey="name"
								innerRadius={56}
								outerRadius={80}
								paddingAngle={2}
								strokeWidth={2}
							>
								<Cell fill="var(--color-balance)" />
								<Cell fill="var(--color-fees)" />
							</Pie>
						</PieChart>
					</ChartContainer>
					<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
						<span className="text-lg font-semibold tabular-nums">
							{fmt(total)}
						</span>
						<span className="text-xs text-muted-foreground">
							POSITION VALUE
						</span>
					</div>
				</div>

				<div className="flex justify-center gap-4 text-xs">
					<span className="flex items-center gap-1.5">
						<i className="size-2.5 rounded-full bg-chart-1" />
						Balance <b className="tabular-nums">{fmt(balance)}</b>
					</span>
					<span className="flex items-center gap-1.5">
						<i className="size-2.5 rounded-full bg-chart-5" />
						Unclaimed fees <b className="tabular-nums">{fmt(fees)}</b>
					</span>
				</div>

				<div className="flex flex-col divide-y">
					{poolRows.map((row) => (
						<div
							key={row.address}
							className="flex items-center justify-between py-1.5 text-sm"
						>
							<span className="font-medium">{row.pair}</span>
							<span
								className={cn(
									"tabular-nums",
									pnlClass(
										pnlSign(currency === "sol" ? row.pnlSol : row.pnlUsd),
									),
								)}
							>
								{currency === "sol" ? fmtSol(row.pnlSol) : fmtUsd(row.pnlUsd)}
							</span>
						</div>
					))}
				</div>

				<div className="flex items-center justify-between border-t pt-3 text-sm">
					<span className="text-muted-foreground">TOTAL PNL</span>
					<b
						className={cn(
							"tabular-nums",
							pnlClass(pnlSign(currency === "sol" ? totalSol : totalUsd)),
						)}
					>
						{currency === "sol" ? fmtSol(totalSol) : fmtUsd(totalUsd)}
					</b>
				</div>
			</CardContent>
		</Card>
	);
}
