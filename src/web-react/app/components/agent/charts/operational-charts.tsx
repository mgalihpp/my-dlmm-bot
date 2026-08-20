import type { AnalyticsPayload } from "@vexis/shared/agent-analytics.js";

export function OperationalCharts({
	data,
	onCycleClick,
}: {
	data: AnalyticsPayload["operational"];
	onCycleClick: (cycle: number) => void;
}) {
	void data;
	void onCycleClick;
	return (
		<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
			Operational charts
		</div>
	);
}
