import type { AgentStats } from "@vexis/shared/agent-journal.js";
import type { NarrativeResult } from "@vexis/shared/agent-narrative.js";
import { BrainIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function NarrativeCard({
	narrative,
	stats,
}: {
	narrative: NarrativeResult;
	stats: AgentStats;
}) {
	const sourceLabel =
		narrative.source === "llm" ? "LLM briefing" : "Waiting for briefing";
	return (
		<Card className="h-full gap-3">
			<CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
				<div className="flex items-center gap-2">
					<span className="flex size-7 items-center justify-center rounded-md bg-primary/10">
						<BrainIcon className="size-4 text-primary" />
					</span>
					<div>
						<CardTitle className="text-sm">Latest briefing</CardTitle>
						<p className="text-xs text-muted-foreground">
							What the agent was thinking
						</p>
					</div>
				</div>
				<Badge variant="outline" className="shrink-0">
					{sourceLabel}
				</Badge>
			</CardHeader>
			<CardContent className="space-y-3">
				<blockquote className="border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-foreground/90">
					{narrative.text}
				</blockquote>
				{stats.blocked > 0 ? (
					<p className="flex items-start gap-1.5 rounded-md bg-destructive/8 px-2.5 py-2 text-xs text-destructive">
						<TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
						{stats.blocked} candidate{stats.blocked === 1 ? "" : "s"} stopped by
						guardrails. See Blocked tab in the journal.
					</p>
				) : (
					<p className="text-xs text-muted-foreground">
						Guardrails passed everything in scope. Read-only analysis.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
