import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { tsLocal } from "~/lib/format";
import type { AgentStateSummary } from "~/lib/server/agent.server";
import { cn } from "~/lib/utils";

export function StatusBanner({ state }: { state: AgentStateSummary }) {
	const running = state.running;
	const llmFailed = state.llmStatus === "failed";
	return (
		<Card className="mx-4 overflow-hidden py-0 lg:mx-6">
			<CardContent className="grid grid-cols-2 divide-x divide-border p-0 lg:grid-cols-4">
				<div className="flex items-center gap-3 p-4 md:p-5">
					<span className="relative flex size-2.5 shrink-0">
						{running && (
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
						)}
						<span
							className={cn(
								"relative inline-flex size-2.5 rounded-full",
								running ? "bg-emerald-500" : "bg-muted-foreground/50",
							)}
						/>
					</span>
					<div className="min-w-0">
						<p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
							Engine
						</p>
						<p className="truncate text-sm font-semibold">
							{running ? "Running" : "Stopped"}
						</p>
						<p className="text-xs text-muted-foreground">
							{state.enabled ? "Automation on" : "Automation off"}
						</p>
					</div>
				</div>
				<div className="p-4 md:p-5">
					<p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
						Cycle
					</p>
					<p className="font-mono text-2xl font-bold tabular-nums">
						{String(state.cycle).padStart(3, "0")}
					</p>
					<p className="text-xs text-muted-foreground">latest completed</p>
				</div>
				<div className="border-t border-border p-4 md:p-5 lg:border-t-0">
					<p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
						Last run
					</p>
					<p className="truncate text-sm font-semibold">
						{state.lastCycleAt ? tsLocal(state.lastCycleAt) : "Never"}
					</p>
					<p className="truncate font-mono text-xs text-muted-foreground">
						{state.lastCycleAt ?? "no cycles recorded"}
					</p>
				</div>
				<div className="border-t border-border p-4 md:p-5 lg:border-t-0">
					<p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
						Brain
					</p>
					<div className="mt-1 flex flex-wrap items-center gap-1.5">
						<Badge variant={llmFailed ? "destructive" : "outline"}>
							{llmFailed ? "LLM failed" : "LLM ok"}
						</Badge>
						<Badge variant={state.enabled ? "secondary" : "outline"}>
							{state.enabled ? "Enabled" : "Disabled"}
						</Badge>
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						{llmFailed ? "check briefing source" : "heuristic + LLM fused"}
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
