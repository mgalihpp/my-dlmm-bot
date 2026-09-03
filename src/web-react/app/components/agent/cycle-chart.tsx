import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "~/components/ui/chart";
import type { CyclePoint } from "~/lib/server/agent.server";

const chartConfig = {
	open: { label: "Open", color: "var(--chart-1)" },
	tp: { label: "TP", color: "var(--color-emerald-500)" },
	sl: { label: "SL", color: "var(--color-red-500)" },
	close: { label: "Close", color: "var(--chart-4)" },
} satisfies ChartConfig;

const SERIES_ORDER = ["open", "tp", "sl", "close"] as const;

type SeriesKey = (typeof SERIES_ORDER)[number];

export interface CycleTooltipRow {
	readonly key: SeriesKey;
	readonly label: string;
	readonly value: number;
}

export function cycleTooltipRows(
	datum: Partial<Record<SeriesKey | "cycle", unknown>> | null | undefined,
): CycleTooltipRow[] {
	if (datum === null || datum === undefined) return [];
	const rows: CycleTooltipRow[] = [];
	for (const key of SERIES_ORDER) {
		const raw = Number(datum[key]);
		if (!Number.isFinite(raw) || raw <= 0) continue;
		rows.push({ key, label: String(chartConfig[key].label), value: raw });
	}
	return rows;
}

function CycleTooltipContent({
	active,
	payload,
	label,
}: {
	readonly active?: boolean;
	readonly payload?: readonly { readonly payload?: unknown }[];
	readonly label?: unknown;
}) {
	const datum = payload?.[0]?.payload as
		| Partial<Record<SeriesKey | "cycle", unknown>>
		| null
		| undefined;
	const rows = cycleTooltipRows(datum);
	if (!active || rows.length === 0) return null;
	const cycle = datum?.cycle ?? label;
	return (
		<div className="grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs/relaxed shadow-xl">
			<div className="font-medium">Cycle {String(cycle)}</div>
			<div className="grid gap-1.5">
				{rows.map((row) => (
					<div
						key={row.key}
						className="flex w-full flex-wrap items-center gap-2"
					>
						<div
							className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
							style={{
								backgroundColor: `var(--color-${row.key})`,
								borderColor: `var(--color-${row.key})`,
							}}
						/>
						<div className="flex flex-1 items-center justify-between leading-none">
							<span className="text-muted-foreground">{row.label}</span>
							<span className="font-mono font-medium text-foreground tabular-nums">
								{row.value.toLocaleString()}
							</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function CycleChart({ data }: { data: readonly CyclePoint[] }) {
	const total = data.reduce((n, d) => n + d.open + d.tp + d.sl + d.close, 0);
	return (
		<Card className="h-full gap-3">
			<CardHeader className="flex flex-row items-baseline justify-between gap-2 space-y-0">
				<div>
					<CardTitle className="text-sm">Activity per cycle</CardTitle>
					<p className="text-xs text-muted-foreground">
						Successful executions · {data.length} cycles
					</p>
				</div>
				<span className="font-mono text-xs text-muted-foreground tabular-nums">
					{total} exec
				</span>
			</CardHeader>
			<CardContent>
				{data.length === 0 ? (
					<div className="flex h-56 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-sm text-muted-foreground">
						No cycles recorded yet.
						<span className="text-xs">
							Run the agent once and activity shows up here.
						</span>
					</div>
				) : (
					<ChartContainer config={chartConfig} className="h-56 w-full">
						<BarChart accessibilityLayer data={[...data]} barCategoryGap="28%">
							<CartesianGrid vertical={false} strokeDasharray="3 3" />
							<XAxis
								dataKey="cycle"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								tick={{ fontSize: 11 }}
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								width={24}
								allowDecimals={false}
								tick={{ fontSize: 11 }}
							/>
							<ChartTooltip content={<CycleTooltipContent />} />
							<Bar dataKey="open" stackId="a" fill="var(--color-open)" />
							<Bar dataKey="tp" stackId="a" fill="var(--color-tp)" />
							<Bar dataKey="sl" stackId="a" fill="var(--color-sl)" />
							<Bar
								dataKey="close"
								stackId="a"
								fill="var(--color-close)"
								radius={[3, 3, 0, 0]}
							/>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
