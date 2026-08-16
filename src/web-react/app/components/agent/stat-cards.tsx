import type { AgentStats } from "@vexis/shared/agent-journal.js";
import {
	BanIcon,
	CircleCheckBigIcon,
	RefreshCwIcon,
	ShieldAlertIcon,
	TargetIcon,
	TrophyIcon,
} from "lucide-react";
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
};

export function StatCards({ stats }: { stats: AgentStats }) {
	const cards = [
		{
			key: "cycles",
			label: "Cycles",
			value: stats.cycles,
			sub: `cycle ${stats.cycles}`,
		},
		{
			key: "opens",
			label: "Opens",
			value: stats.opens,
			sub: `${stats.successRate}% of decisions`,
		},
		{
			key: "blocked",
			label: "Blocked",
			value: stats.blocked,
			sub: "guardrail prevented",
		},
		{
			key: "rate",
			label: "Success rate",
			value: `${stats.successRate}%`,
			sub: "open decision rate",
		},
		{ key: "tp", label: "Take profit", value: stats.tp, sub: "target hit" },
		{ key: "sl", label: "Stop loss", value: stats.sl, sub: "risk cut" },
	];
	return (
		<div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-6 dark:*:data-[slot=card]:bg-card">
			{cards.map((card) => {
				const Icon = ICONS[card.key as keyof typeof ICONS];
				return (
					<Card key={card.key} className="@container/card">
						<CardHeader>
							<CardDescription className="flex items-center gap-1.5">
								<Icon className="size-3.5" />
								{card.label}
							</CardDescription>
							<CardTitle className="text-2xl font-semibold tabular-nums">
								{card.value}
							</CardTitle>
						</CardHeader>
						<CardFooter className="mt-auto">
							<span className="text-xs text-muted-foreground">{card.sub}</span>
						</CardFooter>
					</Card>
				);
			})}
		</div>
	);
}
