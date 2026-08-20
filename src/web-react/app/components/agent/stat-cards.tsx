import type { AgentStats } from "@vexis/shared/agent-journal.js";
import {
	BanIcon,
	CircleCheckBigIcon,
	RefreshCwIcon,
	ShieldAlertIcon,
	TargetIcon,
	TrophyIcon,
} from "lucide-react";
import { memo, useMemo } from "react";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";

const ICONS = {
	cycles: RefreshCwIcon,
	opens: TrophyIcon,
	blocked: BanIcon,
	rate: TargetIcon,
	tp: CircleCheckBigIcon,
	sl: ShieldAlertIcon,
} as const;

// rerender-memo: extract static card so it doesn't re-create on parent render
const StatCard = memo(function StatCard({
	label,
	value,
	sub,
	iconKey,
}: {
	label: string;
	value: string | number;
	sub: string;
	iconKey: keyof typeof ICONS;
}) {
	const Icon = ICONS[iconKey];
	return (
		<Card className="@container/card">
			<CardHeader>
				<CardDescription className="flex items-center gap-1.5">
					<Icon className="size-3.5" />
					{label}
				</CardDescription>
				<CardTitle className="text-2xl font-semibold tabular-nums">
					{value}
				</CardTitle>
			</CardHeader>
			<CardFooter className="mt-auto">
				<span className="text-xs text-muted-foreground">{sub}</span>
			</CardFooter>
		</Card>
	);
});

export const StatCards = memo(function StatCards({
	stats,
}: {
	stats: AgentStats;
}) {
	// rerender-memo: hoist derived array into useMemo with primitive deps
	const cards = useMemo(
		() =>
			[
				{
					key: "cycles" as const,
					label: "Cycles",
					value: stats.cycles,
					sub: `cycle ${stats.cycles}`,
				},
				{
					key: "opens" as const,
					label: "Opens",
					value: stats.opens,
					sub: `${stats.successRate}% of decisions`,
				},
				{
					key: "blocked" as const,
					label: "Blocked",
					value: stats.blocked,
					sub: "guardrail prevented",
				},
				{
					key: "rate" as const,
					label: "Success rate",
					value: `${stats.successRate}%`,
					sub: "open decision rate",
				},
				{
					key: "tp" as const,
					label: "Take profit",
					value: stats.tp,
					sub: "target hit",
				},
				{
					key: "sl" as const,
					label: "Stop loss",
					value: stats.sl,
					sub: "risk cut",
				},
			] as const,
		[
			stats.cycles,
			stats.opens,
			stats.blocked,
			stats.successRate,
			stats.tp,
			stats.sl,
		],
	);

	return (
		<div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-6 dark:*:data-[slot=card]:bg-card">
			{cards.map((card) => (
				<StatCard
					key={card.key}
					iconKey={card.key}
					label={card.label}
					value={card.value}
					sub={card.sub}
				/>
			))}
		</div>
	);
});
