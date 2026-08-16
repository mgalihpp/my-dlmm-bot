import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { tsLocal } from "~/lib/format";
import type { AgentStateSummary } from "~/lib/server/agent.server";
import { cn } from "~/lib/utils";

export function StatusBanner({ state }: { state: AgentStateSummary }) {
	const running = state.running;
	return (
		<Card className="mx-4 overflow-hidden lg:mx-6">
			<CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:p-6">
				<div className="flex items-center gap-3">
					<span className="relative flex size-2.5">
						{running && (
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
						)}
						<span
							className={cn(
								"relative inline-flex size-2.5 rounded-full",
								running ? "bg-emerald-500" : "bg-muted-foreground",
							)}
						/>
					</span>
					<div>
						<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							Automation engine
						</p>
						<h2 className="text-lg leading-tight font-semibold">
							{running ? "Agent is running" : "Agent is stopped"}
						</h2>
						<p className="text-sm text-muted-foreground">
							{state.lastCycleAt
								? `Last cycle completed ${tsLocal(state.lastCycleAt)}`
								: "No cycles recorded yet"}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Badge
						variant={state.llmStatus === "failed" ? "destructive" : "outline"}
					>
						{state.llmStatus === "failed" ? "LLM FAILED" : "LLM OK"}
					</Badge>
					<Badge variant={running ? "default" : "outline"}>
						{running ? "LIVE" : "STOPPED"}
					</Badge>
				</div>
			</CardContent>
		</Card>
	);
}
