import type { ScoreSummary } from "@vexis/shared/agent-journal.js";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

function AvgRow({
	label,
	value,
	tone,
}: {
	label: string;
	value: number | null;
	tone: string;
}) {
	return (
		<div className="flex items-center gap-2.5">
			<span className="w-16 shrink-0 text-xs text-muted-foreground">
				{label}
			</span>
			<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
				{value !== null ? (
					<div
						className={`h-full rounded-full ${tone}`}
						style={{ width: `${Math.min(100, Math.max(2, value))}%` }}
					/>
				) : null}
			</div>
			<span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums">
				{value ?? "–"}
			</span>
		</div>
	);
}

export function ScoreCard({ scores }: { scores: ScoreSummary }) {
	const maxBand = scores.bands.reduce((n, b) => Math.max(n, b.count), 0);
	return (
		<Card className="h-full gap-3">
			<CardHeader className="flex flex-row items-baseline justify-between gap-2 space-y-0">
				<div>
					<CardTitle className="text-sm">Score signal</CardTitle>
					<p className="text-xs text-muted-foreground">
						Avg heuristic score per outcome
					</p>
				</div>
				<span className="font-mono text-xs text-muted-foreground tabular-nums">
					{scores.scored} scored
				</span>
			</CardHeader>
			<CardContent className="space-y-3">
				{scores.scored === 0 ? (
					<div className="flex h-32 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
						No scored candidates yet.
					</div>
				) : (
					<>
						<div className="space-y-2">
							<AvgRow
								label="Opens"
								value={scores.avgOpen}
								tone="bg-sky-500/80"
							/>
							<AvgRow
								label="Holds"
								value={scores.avgHold}
								tone="bg-muted-foreground/60"
							/>
							<AvgRow
								label="Blocked"
								value={scores.avgBlocked}
								tone="bg-destructive/70"
							/>
						</div>
						<div className="flex items-end gap-1.5 pt-1">
							{scores.bands.map((band) => (
								<div
									key={band.label}
									className="flex min-w-0 flex-1 flex-col items-center gap-1"
								>
									<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
										{band.count}
									</span>
									<div className="flex h-16 w-full items-end rounded-md bg-muted/60 px-1 pt-1 pb-0">
										<div
											className="w-full rounded-t-sm bg-primary/70"
											style={{
												height: `${maxBand > 0 ? Math.max(3, (band.count / maxBand) * 100) : 0}%`,
											}}
										/>
									</div>
									<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
										{band.label}
									</span>
								</div>
							))}
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
