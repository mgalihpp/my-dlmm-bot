import {
	ChevronLeftIcon,
	ChevronRightIcon,
	ExternalLinkIcon,
} from "lucide-react";
import type { JournalCandidate } from "@vexis/telegram/agent/journal.js";
import type { JournalFilter, TimelineGroup } from "@vexis/web/pages/agent.js";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { shortAddr, solscanUrl, tsLocal } from "~/lib/format";

const FILTER_TABS: { value: JournalFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "open", label: "Open" },
	{ value: "hold", label: "Hold" },
	{ value: "tp", label: "TP" },
	{ value: "sl", label: "SL" },
	{ value: "close", label: "Close" },
	{ value: "blocked", label: "Blocked" },
];

const PAGE_SIZE = 20;

function actionVariant(
	action: JournalCandidate["action"],
): "default" | "secondary" | "destructive" | "outline" {
	switch (action) {
		case "open":
			return "default";
		case "hold":
			return "outline";
		case "tp":
			return "secondary";
		case "sl":
			return "destructive";
		case "close":
			return "secondary";
	}
}

function CandidateRow({ candidate }: { candidate: JournalCandidate }) {
	const blocked = candidate.guardrail === "blocked";
	return (
		<div className="flex flex-col gap-1 py-2 pl-2">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="font-medium text-sm">
					{candidate.poolName || candidate.pool}
				</span>
				<Badge variant={actionVariant(candidate.action)}>
					{candidate.action}
				</Badge>
				<Badge variant={blocked ? "destructive" : "outline"}>
					{blocked ? "BLOCKED" : "PASS"}
				</Badge>
				{candidate.execution === "failed" ? (
					<Badge variant="destructive">FAILED</Badge>
				) : candidate.execution === "ok" && candidate.txSignature ? (
					<a
						href={solscanUrl(candidate.txSignature)}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-0.5 font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
					>
						{shortAddr(candidate.txSignature)}
						<ExternalLinkIcon className="size-3" />
					</a>
				) : null}
			</div>
			{candidate.rationale ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<p className="line-clamp-1 cursor-help text-xs text-muted-foreground">
							{candidate.rationale}
						</p>
					</TooltipTrigger>
					<TooltipContent className="max-w-sm">
						{candidate.rationale}
					</TooltipContent>
				</Tooltip>
			) : null}
			{candidate.blockedReason ? (
				<p className="text-xs text-destructive">{candidate.blockedReason}</p>
			) : null}
		</div>
	);
}

export function DecisionJournal({
	filter,
	page,
	pages,
	total,
	groups,
	onFilterChange,
	onPageChange,
}: {
	filter: JournalFilter;
	page: number;
	pages: number;
	total: number;
	groups: readonly TimelineGroup[];
	onFilterChange: (f: string) => void;
	onPageChange: (p: number) => void;
}) {
	const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
	const to = Math.min(page * PAGE_SIZE, total);
	return (
		<Card className="mx-4 lg:mx-6">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
				<div>
					<CardTitle>Decision Journal</CardTitle>
					<p className="text-sm text-muted-foreground">{total} entries</p>
				</div>
				<Tabs value={filter} onValueChange={onFilterChange}>
					<TabsList>
						{FILTER_TABS.map((tab) => (
							<TabsTrigger key={tab.value} value={tab.value}>
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				{groups.length === 0 ? (
					<div className="px-4 py-10 text-center text-sm text-muted-foreground">
						No journal entries
						{filter !== "all" ? ` matching filter "${filter}"` : ""}.
					</div>
				) : (
					<div className="divide-y divide-border">
						{groups.map((group) => (
							<div key={group.cycle} className="px-4 py-2">
								<div className="flex flex-wrap items-center gap-2 py-1">
									<span className="font-mono text-xs font-semibold">
										#{group.cycle}
									</span>
									{group.llmStatus === "failed" ? (
										<Badge variant="destructive">LLM FAILED</Badge>
									) : null}
									<span className="text-xs text-muted-foreground">
										{tsLocal(group.ts)}
									</span>
								</div>
								<div className="border-l pl-3">
									{group.rows.length === 0 ? (
										<p className="py-2 text-xs text-muted-foreground">
											No candidates
										</p>
									) : (
										group.rows.map((row, i) =>
											row.candidate === null ? (
												<p
													key={i}
													className="py-2 text-xs text-muted-foreground"
												>
													No candidates
												</p>
											) : (
												<CandidateRow key={i} candidate={row.candidate} />
											),
										)
									)}
								</div>
							</div>
						))}
					</div>
				)}
				{total > 0 ? (
					<div className="flex items-center justify-between px-4 py-3">
						<span className="text-sm text-muted-foreground">
							Showing {from}–{to} of {total}
						</span>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={page <= 1}
								onClick={() => onPageChange(page - 1)}
							>
								<ChevronLeftIcon />
								Prev
							</Button>
							<span className="text-sm tabular-nums">
								Page {page} of {pages}
							</span>
							<Button
								variant="outline"
								size="sm"
								disabled={page >= pages}
								onClick={() => onPageChange(page + 1)}
							>
								Next
								<ChevronRightIcon />
							</Button>
						</div>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}