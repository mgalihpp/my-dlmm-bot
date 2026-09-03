import type { BlockedBreakdown } from "@vexis/shared/agent-journal.js";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export function BlockedReasonsCard({ blocked }: { blocked: BlockedBreakdown }) {
	const max = blocked.groups[0]?.count ?? 0;
	return (
		<Card className="h-full gap-3">
			<CardHeader className="flex flex-row items-baseline justify-between gap-2 space-y-0">
				<div>
					<CardTitle className="text-sm">Top block reasons</CardTitle>
					<p className="text-xs text-muted-foreground">
						What stops the agent most
					</p>
				</div>
				<span className="font-mono text-xs text-muted-foreground tabular-nums">
					{blocked.total} blocked
				</span>
			</CardHeader>
			<CardContent>
				{blocked.groups.length === 0 ? (
					<div className="flex h-32 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-sm text-muted-foreground">
						No blocks recorded.
						<span className="text-xs">
							Guardrails passed everything in scope.
						</span>
					</div>
				) : (
					<ul className="space-y-2.5">
						{blocked.groups.map((group) => (
							<li key={group.reason}>
								<div className="flex items-baseline justify-between gap-2 text-xs">
									<span className="min-w-0 truncate font-medium">
										{group.reason}
									</span>
									<span className="shrink-0 font-mono text-muted-foreground tabular-nums">
										{group.count} ·{" "}
										{blocked.total > 0
											? Math.round((group.count / blocked.total) * 100)
											: 0}
										%
									</span>
								</div>
								<div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-destructive/70"
										style={{
											width: `${max > 0 ? Math.max(4, (group.count / max) * 100) : 0}%`,
										}}
									/>
								</div>
							</li>
						))}
					</ul>
				)}
				{blocked.others > 0 ? (
					<p className="mt-2.5 text-xs text-muted-foreground">
						+{blocked.others} more under other reasons
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
