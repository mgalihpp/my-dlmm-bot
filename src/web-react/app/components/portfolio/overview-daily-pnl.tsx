import type { ClosedPool } from "@vexis/domain/portfolio.js";
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

export const DailyPnlChart = memo(function DailyPnlChart({
	closed,
	currency,
}: {
	closed: readonly ClosedPool[];
	currency: Currency;
}) {
	const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">(
		"daily",
	);
	const [mode, setMode] = useState<"fees" | "total">("total");
	const { points, config } = useMemo(() => {
		const getVal = (p: ClosedPool) => {
			if (mode === "fees")
				return (
					Number(
						currency === "sol" ? (p.totalFeeSol ?? p.totalFee) : p.totalFee,
					) || 0
				);
			return Number(currency === "sol" ? p.pnlSol : p.pnlUsd) || 0;
		};
		const deltas = closed
			.filter(
				(p): p is ClosedPool & { lastClosedAt: number } =>
					p.lastClosedAt != null,
			)
			.map((p) => ({ ts: p.lastClosedAt, delta: getVal(p) }));
		let buckets: { key: string; label: string; value: number }[] = [];
		if (timeframe === "daily") {
			const now = new Date();
			const dayBuckets = new Map<string, { label: string; value: number }>();
			for (let i = 29; i >= 0; i--) {
				const dt = new Date(now);
				dt.setHours(0, 0, 0, 0);
				dt.setDate(dt.getDate() - i);
				const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
				const label = dt.toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
				});
				dayBuckets.set(key, { label, value: 0 });
			}
			for (const d of deltas) {
				const dt = new Date(d.ts * 1000);
				const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
				const entry = dayBuckets.get(key);
				if (entry) entry.value += d.delta;
			}
			buckets = [...dayBuckets.entries()].map(([key, e]) => ({
				key,
				label: e.label,
				value: e.value,
			}));
		} else if (timeframe === "weekly") {
			const map = new Map<
				string,
				{ label: string; value: number; ts: number }
			>();
			for (const d of deltas) {
				const dt = new Date(d.ts * 1000);
				const jan1 = new Date(dt.getFullYear(), 0, 1);
				const week = Math.ceil(
					((dt.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7,
				);
				const key = `${dt.getFullYear()}-W${week}`;
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
			const now = new Date();
			const monthBuckets = new Map<string, { label: string; value: number }>();
			for (let i = 11; i >= 0; i--) {
				const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
				const key = `${dt.getFullYear()}-${dt.getMonth()}`;
				const label = dt.toLocaleDateString("en-US", {
					month: "short",
					year: "numeric",
				});
				monthBuckets.set(key, { label, value: 0 });
			}
			for (const d of deltas) {
				const dt = new Date(d.ts * 1000);
				const key = `${dt.getFullYear()}-${dt.getMonth()}`;
				const entry = monthBuckets.get(key);
				if (entry) entry.value += d.delta;
			}
			buckets = [...monthBuckets.entries()].map(([key, e]) => ({
				key,
				label: e.label,
				value: e.value,
			}));
		}
		const points = buckets.map((b) => ({ label: b.label, value: b.value }));
		const config = {
			value: {
				label: mode === "fees" ? "Fees" : "PnL",
				color: "var(--chart-1)",
			},
		} satisfies ChartConfig;
		return { points, config };
	}, [closed, currency, timeframe, mode]);

	return (
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
							className="size-6"
							aria-label="Share"
						>
							<ShareIcon className="size-4" />
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
									key={p.label}
									fill={p.value >= 0 ? "#10b981" : "#ef4444"}
								/>
							))}
						</Bar>
					</BarChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
});
