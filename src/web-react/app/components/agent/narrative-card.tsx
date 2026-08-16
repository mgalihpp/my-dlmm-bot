import type { NarrativeResult } from "@vexis/shared/agent-narrative.js";
import type { AgentStats } from "@vexis/shared/agent-journal.js";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function NarrativeCard({
	narrative,
	stats,
}: {
	narrative: NarrativeResult;
	stats: AgentStats;
}) {
	return (
		<Card className="h-full">
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<div>
					<CardTitle>Decision context</CardTitle>
					<p className="text-sm text-muted-foreground">Latest run briefing</p>
				</div>
				<Badge variant={narrative.source === "llm" ? "default" : "outline"}>
					{narrative.source === "llm" ? "GENERATED" : "FALLBACK"}
				</Badge>
			</CardHeader>
			<CardContent>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{narrative.text}
				</p>
				<div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<Badge variant={stats.blocked > 0 ? "destructive" : "outline"}>
						{stats.blocked} blocked
					</Badge>
					<span>Read-only journal analysis</span>
				</div>
			</CardContent>
		</Card>
	);
}
