import type { ClosedPool } from "@vexis/domain/portfolio.js";
import type { PositionPnLData } from "@vexis/domain/position.js";
import { ShareIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "~/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import {
	buildDailyBuckets,
	poolDelta,
	positionDelta,
} from "~/lib/cumulative-pnl";
import type { Currency } from "~/lib/currency";
import { useChartPreferenceStore } from "~/stores/chart-preference";
import { DailyPnlShareDialog } from "./daily-pnl-share-dialog.js";
export const DailyPnlChart = memo(function DailyPnlChart({
	closed,
	pools,
	currency,
}: {
	closed: readonly PositionPnLData[];
	pools?: readonly ClosedPool[];
	currency: Currency;
}) {
	const timeframe = useChartPreferenceStore((s) => s.timeframe);
	const setTimeframe = useChartPreferenceStore((s) => s.setTimeframe);
	const mode = useChartPreferenceStore((s) => s.mode);
	const setMode = useChartPreferenceStore((s) => s.setMode);
	const [shareOpen, setShareOpen] = useState(false);
	const { points, config, rangeLabel, total } = useMemo(() => {
		const fromPositions = closed.map((p) => positionDelta(p, currency, mode));
		const hasPositions = fromPositions.some((d) => d !== null);
		const deltas = (
			hasPositions
				? fromPositions
				: ((pools ?? []).map((p) => poolDelta(p, currency, mode)) as ReturnType<
						typeof positionDelta
					>[])
		).filter((d): d is { ts: number; delta: number } => d !== null);
		const buckets = buildDailyBuckets(deltas, timeframe);
		const points = buckets.map((b) => ({
			key: b.key,
			label: b.label,
			value: b.value,
		}));
		const config = {
			value: {
				label: mode === "fees" ? "Fees" : "PnL",
				color: "var(--chart-1)",
			},
		} satisfies ChartConfig;
		const total = deltas.reduce((acc, d) => acc + d.delta, 0);
		let rangeLabel = "";
		if (deltas.length > 0) {
			let minTs = Number.POSITIVE_INFINITY;
			let maxTs = Number.NEGATIVE_INFINITY;
			for (const d of deltas) {
				if (d.ts < minTs) minTs = d.ts;
				if (d.ts > maxTs) maxTs = d.ts;
			}
			const fmt = (ts: number) =>
				new Date(ts * 1000)
					.toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
						year: "numeric",
						timeZone: "UTC",
					})
					.toUpperCase();
			rangeLabel = `${fmt(minTs)} - ${fmt(maxTs)}`;
		} else {
			const nowFmt = new Date()
				.toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					year: "numeric",
					timeZone: "UTC",
				})
				.toUpperCase();
			rangeLabel = ` - ${nowFmt}`;
		}
		return { points, config, rangeLabel, total };
	}, [closed, pools, currency, timeframe, mode]);

	return (
		<>
			<Card data-size="sm" className="py-3 pb-0">
				<CardHeader>
					<div className="flex w-full flex-wrap items-center justify-between gap-2">
						<div className="flex items-center gap-1.5">
							<CardTitle className="text-sm">
								{timeframe === "weekly"
									? "Weekly P&L"
									: timeframe === "monthly"
										? "Monthly P&L"
										: "Daily P&L"}
							</CardTitle>
							<Button
								variant="ghost"
								size="icon"
								className="size-6 text-muted-foreground hover:text-foreground"
								aria-label="Share"
								onClick={() => setShareOpen(true)}
							>
								<ShareIcon className="size-3" />
							</Button>
						</div>
						<div className="flex items-center gap-2">
							<div className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
								<Button
									variant={timeframe === "daily" ? "secondary" : "ghost"}
									size="sm"
									className="h-6 px-2 text-xs"
									onClick={() => setTimeframe("daily")}
								>
									daily
								</Button>
								<Button
									variant={timeframe === "weekly" ? "secondary" : "ghost"}
									size="sm"
									className="h-6 px-2 text-xs"
									onClick={() => setTimeframe("weekly")}
								>
									weekly
								</Button>
								<Button
									variant={timeframe === "monthly" ? "secondary" : "ghost"}
									size="sm"
									className="h-6 px-2 text-xs"
									onClick={() => setTimeframe("monthly")}
								>
									monthly
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
						</div>
					</div>
				</CardHeader>
				<CardContent className="pb-0">
					{points.length === 0 ? (
						<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
							No closed positions yet.
						</div>
					) : (
						<ChartContainer config={config} className="h-[300px] w-full">
							<BarChart data={points}>
								<CartesianGrid vertical={false} />
								<XAxis
									dataKey="label"
									tickLine={false}
									axisLine={false}
									interval="preserveStartEnd"
								/>
								<YAxis tickLine={false} axisLine={false} />
								<ChartTooltip
									cursor={{ fill: "hsl(var(--muted) / 0.15)" }}
									content={(props: {
										active?: boolean;
										payload?: ReadonlyArray<{ value?: unknown }>;
										label?: unknown;
									}) => {
										const { active, payload, label } = props;
										if (!active || !payload || payload.length === 0)
											return null;
										const first = payload[0];
										const rawUnknown = first.value;
										if (typeof rawUnknown !== "number") return null;
										const raw = rawUnknown;
										const isPositive = raw >= 0;
										const unit = currency === "sol" ? "SOL" : "USD";
										const rowLabel = mode === "fees" ? "Fees" : "P&L";
										const formatted = `${raw >= 0 ? "+" : ""}${raw.toFixed(3)} ${unit}`;
										const labelText =
											typeof label === "string" ? label : String(label ?? "");
										return (
											<div className="min-w-[160px] rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs shadow-xl">
												<div className="flex items-center justify-between gap-6">
													<span className="text-zinc-400">Date</span>
													<span className="font-medium text-white">
														{labelText}
													</span>
												</div>
												<div className="mt-1 flex items-center justify-between gap-6">
													<span className="text-zinc-400">{rowLabel}</span>
													<span
														className={`font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}
													>
														{formatted}
													</span>
												</div>
											</div>
										);
									}}
								/>
								<ReferenceLine
									y={0}
									stroke="currentColor"
									strokeOpacity={0.5}
								/>
								<Bar dataKey="value" radius={[2, 2, 0, 0]}>
									{points.map((p) => (
										<Cell
											key={p.key}
											fill={p.value >= 0 ? "#10b981" : "#ef4444"}
										/>
									))}
								</Bar>
							</BarChart>
						</ChartContainer>
					)}
				</CardContent>
			</Card>
			{shareOpen && (
				<DailyPnlShareDialog
					open={shareOpen}
					onOpenChange={setShareOpen}
					date={new Date()}
					closed={closed}
					currency={currency}
					variant="chart"
					chartPoints={points}
					chartRangeLabel={rangeLabel}
					chartTimeframe={timeframe}
					chartMode={mode}
					chartTotal={total}
				/>
			)}
		</>
	);
});
