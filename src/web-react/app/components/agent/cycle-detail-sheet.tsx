import type { OperationalPoint } from "@vexis/shared/agent-analytics.js";
import { memo, useMemo } from "react";
import { Badge } from "~/components/ui/badge";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import { tsLocal } from "~/lib/format";
import { CandidateRow } from "./candidate-row";

export const CycleDetailSheet = memo(function CycleDetailSheet({
	cycle,
	points,
	onOpenChange,
}: {
	cycle: number | null;
	points: readonly OperationalPoint[];
	onOpenChange: (open: boolean) => void;
}) {
	// rerender-derived-state-no-effect: derive entry during render with memo
	const entry = useMemo(
		() =>
			cycle == null ? null : (points.find((p) => p.cycle === cycle) ?? null),
		[cycle, points],
	);
	const open = cycle != null;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="overflow-y-auto sm:max-w-md">
				<SheetHeader>
					<SheetTitle>{entry ? `Cycle #${entry.cycle}` : "Cycle"}</SheetTitle>
					<SheetDescription>
						{entry ? tsLocal(entry.ts) : "No cycle selected"}
						{entry ? ` • ${entry.candidates.length} candidate(s)` : ""}
					</SheetDescription>
				</SheetHeader>
				{entry ? (
					<div className="flex flex-col gap-2 px-4 pb-6">
						<div className="flex flex-wrap items-center gap-2">
							<Badge
								variant={
									entry.llmStatus === "failed" ? "destructive" : "outline"
								}
							>
								LLM{" "}
								{entry.llmStatus === "failed"
									? "FAILED"
									: entry.llmStatus.toUpperCase()}
							</Badge>
							<Badge variant="outline">{entry.opens} open</Badge>
							<Badge variant="outline">{entry.blocked} blocked</Badge>
							<Badge variant="outline">{entry.successRate}% success</Badge>
						</div>
						<div className="divide-y divide-border border-l pl-3">
							{entry.candidates.length === 0 ? (
								<p className="py-2 text-sm text-muted-foreground">
									No candidates in this cycle.
								</p>
							) : (
								entry.candidates.map((candidate, i) => (
									<CandidateRow
										// biome-ignore lint/suspicious/noArrayIndexKey: per-cycle candidate list is static
										key={`${entry.cycle}-${candidate.pool}-${candidate.action}-${i}`}
										candidate={candidate}
									/>
								))
							)}
						</div>
					</div>
				) : null}
			</SheetContent>
		</Sheet>
	);
});
