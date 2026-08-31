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
import type { Currency } from "~/lib/currency";
import { useChartPreferenceStore } from "~/stores/chart-preference";
import { DailyPnlShareDialog } from "./daily-pnl-share-dialog.js";
export const DailyPnlChart = memo(function DailyPnlChart({
	closed,
	currency,
}: {
	closed: readonly PositionPnLData[];
	currency: Currency;
}) {
	const timeframe = useChartPreferenceStore((s) => s.timeframe);
	const setTimeframe = useChartPreferenceStore((s) => s.setTimeframe);
	const mode = useChartPreferenceStore((s) => s.mode);
	const setMode = useChartPreferenceStore((s) => s.setMode);
	const [shareOpen, setShareOpen] = useState(false);
	const { points, config, rangeLabel, total } = useMemo(() => {
		const getVal = (p: PositionPnLData) => {
			if (mode === "fees")
				return (
					Number(
						currency === "sol"
							? (p.allTimeFees.total.sol ?? "0")
							: p.allTimeFees.total.usd,
					) || 0
				);
			return Number(currency === "sol" ? (p.pnlSol ?? "0") : p.pnlUsd) || 0;
		};
		const deltas = closed
			.filter(
				(p): p is PositionPnLData & { closedAt: number } => p.closedAt != null,
			)
			.map((p) => ({ ts: p.closedAt, delta: getVal(p) }));
		let buckets: { key: string; label: string; value: number }[] = [];
		if (timeframe === "daily") {
			if (deltas.length === 0) {
				buckets = [];
			} else {
				let minTs = Number.POSITIVE_INFINITY;
				let maxTs = Number.NEGATIVE_INFINITY;
				for (const d of deltas) {
					if (d.ts < minTs) minTs = d.ts;
					if (d.ts > maxTs) maxTs = d.ts;
				}
				const minDt = new Date(minTs * 1000);
				const maxDt = new Date(maxTs * 1000);
				const startUtc = Date.UTC(
					minDt.getUTCFullYear(),
					minDt.getUTCMonth(),
					minDt.getUTCDate(),
				);
				const endUtc = Date.UTC(
					maxDt.getUTCFullYear(),
					maxDt.getUTCMonth(),
					maxDt.getUTCDate(),
				);
				const spansYears = minDt.getUTCFullYear() !== maxDt.getUTCFullYear();
				const dayBuckets = new Map<string, { label: string; value: number }>();
				for (let t = startUtc; t <= endUtc; t += 86400000) {
					const dt = new Date(t);
					const key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}`;
					const label = dt.toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
						year: spansYears ? "2-digit" : undefined,
						timeZone: "UTC",
					});
					dayBuckets.set(key, { label, value: 0 });
				}
				for (const d of deltas) {
					const dt = new Date(d.ts * 1000);
					const key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}`;
					const entry = dayBuckets.get(key);
					if (entry) entry.value += d.delta;
				}
				buckets = [...dayBuckets.entries()].map(([key, e]) => ({
					key,
					label: e.label,
					value: e.value,
				}));
			}
		} else if (timeframe === "weekly") {
			const map = new Map<
				string,
				{ label: string; value: number; ts: number }
			>();
			for (const d of deltas) {
				const dt = new Date(d.ts * 1000);
				const jan1 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
				const week = Math.ceil(
					((dt.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) /
						7,
				);
				const key = `${dt.getUTCFullYear()}-W${week}`;
				const entry = map.get(key) ?? {
					label: `W${week}`,
					value: 0,
					ts: d.ts,
				};
				entry.value += d.delta;
				entry.ts = d.ts;
				map.set(key, entry);
			}
			buckets = [...map.values()]
				.sort((a, b) => a.ts - b.ts)
				.slice(-12)
				.map((e) => ({ key: e.label, label: e.label, value: e.value }));
		} else {
			const map = new Map<
				string,
				{ label: string; value: number; ts: number }
			>();
			for (const d of deltas) {
				const dt = new Date(d.ts * 1000);
				const key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`;
				const ts = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1);
				const label = dt.toLocaleDateString("en-US", {
					month: "short",
					year: "numeric",
					timeZone: "UTC",
				});
				const entry = map.get(key) ?? { label, value: 0, ts };
				entry.value += d.delta;
				map.set(key, entry);
			}
			buckets = [...map.values()]
				.sort((a, b) => a.ts - b.ts)
				.slice(-12)
				.map((e) => ({ key: e.label, label: e.label, value: e.value }));
		}
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
	}, [closed, currency, timeframe, mode]);

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
								className="size-6 text-muted-foreground hover:text-white"
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
									if (!active || !payload || payload.length === 0) return null;
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
							<ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.5} />
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
