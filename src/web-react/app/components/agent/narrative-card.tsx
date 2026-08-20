import type { AgentStats } from "@vexis/shared/agent-journal.js";
import type { NarrativeResult } from "@vexis/shared/agent-narrative.js";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function NarrativeCard({
	narrative,
	stats,
}: {
	narrative: NarrativeResult;
	stats: AgentStats;
}) {
	return (
		<Card className="mx-4 h-full lg:mx-6">
			<CardHeader>
				<div>
					<CardTitle>Decision context</CardTitle>
					<p className="text-sm text-muted-foreground">Latest run briefing</p>
				</div>
			</CardHeader>
			<CardContent>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{narrative.text}
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<span className={stats.blocked > 0 ? "text-destructive" : ""}>
						{stats.blocked} blocked
					</span>
					<span>Read-only journal analysis</span>
				</div>
			</CardContent>
		</Card>
	);
}
