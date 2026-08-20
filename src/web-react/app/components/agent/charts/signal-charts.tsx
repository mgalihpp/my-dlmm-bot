import type { AnalyticsPayload } from "@vexis/shared/agent-analytics.js";

export function SignalCharts({ data }: { data: AnalyticsPayload["signals"] }) {
	void data;
	return (
		<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
			Signal charts
		</div>
	);
}
