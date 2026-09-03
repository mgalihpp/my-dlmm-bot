import { RefreshButton } from "~/components/dashboard-page-parts";
import { Badge } from "~/components/ui/badge";
import type { AgentStateSummary } from "~/lib/server/agent.server";
import { cn } from "~/lib/utils";

export function AgentHeader({
	onRefresh,
	refreshing,
	state,
}: {
	onRefresh: () => void;
	refreshing: boolean;
	state?: AgentStateSummary;
}) {
	const running = state?.running ?? false;
	return (
		<div className="flex flex-wrap items-end justify-between gap-3 px-4 lg:px-6">
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
						Automation / DLMM engine
					</p>
					{state ? (
						<Badge
							variant={running ? "default" : "outline"}
							className={cn(running && "bg-emerald-600 hover:bg-emerald-600")}
						>
							<span
								className={cn(
									"size-1.5 rounded-full",
									running ? "animate-pulse bg-white" : "bg-muted-foreground",
								)}
							/>
							{running ? "Live" : "Stopped"}
						</Badge>
					) : null}
				</div>
				<h1 className="mt-1 text-2xl font-bold tracking-tight">
					Agent Console
				</h1>
				<p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
					Read-only log of every scan, guardrail block, and exit. Nothing here
					trades.
				</p>
			</div>
			<RefreshButton loading={refreshing} onClick={onRefresh} />
		</div>
	);
}
