import type { AnalyticsPayload } from "@vexis/shared/agent-analytics.js";

export function FinancialCharts({
	data,
}: {
	data: AnalyticsPayload["financial"];
}) {
	void data;
	return (
		<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
			Financial charts
		</div>
	);
}
