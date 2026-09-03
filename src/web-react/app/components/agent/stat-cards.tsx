import type { AgentStats } from "@vexis/shared/agent-journal.js";
import { BanIcon, CircleCheckBigIcon, TargetIcon, ZapIcon } from "lucide-react";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { cn } from "~/lib/utils";

export function StatCards({ stats }: { stats: AgentStats }) {
	const exits = stats.tp + stats.sl + stats.closes;
	const cards = [
		{
			key: "rate",
			label: "Open rate",
			value: `${stats.successRate}%`,
			sub: `${stats.opens} opens · ${stats.holds} holds`,
			Icon: TargetIcon,
			accent: "text-sky-500",
		},
		{
			key: "blocked",
			label: "Guardrail blocks",
			value: stats.blocked,
			sub:
				stats.failed > 0
					? `${stats.failed} executions failed`
					: "risk filter held the line",
			Icon: BanIcon,
			accent: stats.blocked > 0 ? "text-destructive" : "text-muted-foreground",
		},
		{
			key: "exits",
			label: "Exits secured",
			value: exits,
			sub: `${stats.tp} TP · ${stats.sl} SL · ${stats.closes} close`,
			Icon: CircleCheckBigIcon,
			accent: "text-emerald-500",
		},
		{
			key: "cycles",
			label: "Cycles scanned",
			value: stats.cycles,
			sub: "journal entries indexed",
			Icon: ZapIcon,
			accent: "text-muted-foreground",
		},
	];
	return (
		<div className="grid grid-cols-2 gap-3 px-4 lg:px-6 @4xl/main:grid-cols-4">
			{cards.map((card) => (
				<Card key={card.key} className="gap-1 py-4">
					<CardHeader className="gap-0.5">
						<CardDescription className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] uppercase">
							<card.Icon className={cn("size-3.5", card.accent)} />
							{card.label}
						</CardDescription>
						<CardTitle className="text-2xl font-bold tabular-nums md:text-[1.7rem]">
							{card.value}
						</CardTitle>
					</CardHeader>
					<CardFooter>
						<span className="truncate text-xs text-muted-foreground">
							{card.sub}
						</span>
					</CardFooter>
				</Card>
			))}
		</div>
	);
}
