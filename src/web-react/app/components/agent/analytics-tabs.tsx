import type {
	BlockedBreakdown,
	ScoreSummary,
} from "@vexis/shared/agent-journal.js";
import { lazy, Suspense } from "react";
import { ChartCardSkeleton } from "~/components/page-skeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { CyclePoint } from "~/lib/server/agent.server";
import { BlockedReasonsCard } from "./blocked-reasons-card";
import { ScoreCard } from "./score-card";

const CycleChart = lazy(() =>
	import("./cycle-chart").then((m) => ({ default: m.CycleChart })),
);

const TAB_LIST_CLASS =
	"h-8 justify-start gap-0.5 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const TAB_TRIGGER_CLASS = "shrink-0 flex-none px-3 text-xs";

export function AnalyticsTabs({
	chart,
	blocked,
	scores,
}: {
	chart: readonly CyclePoint[];
	blocked: BlockedBreakdown;
	scores: ScoreSummary;
}) {
	return (
		<Tabs defaultValue="activity" className="gap-3">
			<div className="flex flex-wrap items-center justify-between gap-2 px-4 lg:px-6">
				<p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
					Analytics
				</p>
				<TabsList className={TAB_LIST_CLASS}>
					<TabsTrigger value="activity" className={TAB_TRIGGER_CLASS}>
						Activity
					</TabsTrigger>
					<TabsTrigger value="blocks" className={TAB_TRIGGER_CLASS}>
						Blocks
					</TabsTrigger>
					<TabsTrigger value="scores" className={TAB_TRIGGER_CLASS}>
						Scores
					</TabsTrigger>
				</TabsList>
			</div>
			<div className="px-4 lg:px-6">
				<TabsContent value="activity">
					<Suspense
						fallback={<ChartCardSkeleton blockClassName="h-56 w-full" />}
					>
						<CycleChart data={chart} />
					</Suspense>
				</TabsContent>
				<TabsContent value="blocks">
					<BlockedReasonsCard blocked={blocked} />
				</TabsContent>
				<TabsContent value="scores">
					<ScoreCard scores={scores} />
				</TabsContent>
			</div>
		</Tabs>
	);
}
