import type {
	AnalyticsPayload,
	AnalyticsRange,
} from "@vexis/shared/agent-analytics.js";
import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router";
import { ChartCardSkeleton } from "~/components/page-skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { CycleDetailSheet } from "./cycle-detail-sheet";

const OperationalCharts = lazy(() =>
	import("./charts/operational-charts").then((m) => ({
		default: m.OperationalCharts,
	})),
);
const FinancialCharts = lazy(() =>
	import("./charts/financial-charts").then((m) => ({
		default: m.FinancialCharts,
	})),
);
const SignalCharts = lazy(() =>
	import("./charts/signal-charts").then((m) => ({ default: m.SignalCharts })),
);

const RANGE_ITEMS: { value: AnalyticsRange; label: string }[] = [
	{ value: "7d", label: "7D" },
	{ value: "30d", label: "30D" },
	{ value: "90d", label: "90D" },
	{ value: "all", label: "All" },
];

export function PerformanceTabs({
	analytics,
	range,
}: {
	analytics: AnalyticsPayload;
	range: AnalyticsRange;
}) {
	const [, setSearchParams] = useSearchParams();
	const [selected, setSelected] = useState<number | null>(null);

	const onRangeChange = (value: string) => {
		if (!value) return;
		const params = new URLSearchParams(window.location.search);
		if (value === "30d") params.delete("range");
		else params.set("range", value);
		setSearchParams(Object.fromEntries(params.entries()), {
			preventScrollReset: true,
		});
	};

	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
				<div>
					<CardTitle>Performance Analytics</CardTitle>
					<p className="text-sm text-muted-foreground">
						Operational • Financial • Signals
					</p>
				</div>
				<ToggleGroup
					type="single"
					value={range}
					onValueChange={onRangeChange}
					variant="outline"
					size="sm"
				>
					{RANGE_ITEMS.map((item) => (
						<ToggleGroupItem key={item.value} value={item.value}>
							{item.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</CardHeader>
			<CardContent>
				<Tabs defaultValue="operational">
					<TabsList>
						<TabsTrigger value="operational">Operational</TabsTrigger>
						<TabsTrigger value="financial">Financial</TabsTrigger>
						<TabsTrigger value="signals">Signals</TabsTrigger>
					</TabsList>
					<TabsContent value="operational">
						<Suspense
							fallback={<ChartCardSkeleton blockClassName="h-64 w-full" />}
						>
							<OperationalCharts
								data={analytics.operational}
								onCycleClick={setSelected}
							/>
						</Suspense>
					</TabsContent>
					<TabsContent value="financial">
						<Suspense
							fallback={<ChartCardSkeleton blockClassName="h-64 w-full" />}
						>
							<FinancialCharts data={analytics.financial} />
						</Suspense>
					</TabsContent>
					<TabsContent value="signals">
						<Suspense
							fallback={<ChartCardSkeleton blockClassName="h-64 w-full" />}
						>
							<SignalCharts data={analytics.signals} />
						</Suspense>
					</TabsContent>
				</Tabs>
			</CardContent>
			<CycleDetailSheet
				cycle={selected}
				onOpenChange={(open) => {
					if (!open) setSelected(null);
				}}
			/>
		</Card>
	);
}
