import type {
	JournalFilter,
	TimelineGroup,
} from "@vexis/shared/agent-journal.js";
import type { JournalCandidate } from "@vexis/telegram/agent/journal.js";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	ExternalLinkIcon,
	ShieldXIcon,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { shortAddr, solscanUrl, tsLocal } from "~/lib/format";
import { cn } from "~/lib/utils";

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
	const failed = candidate.execution === "failed";
	return (
		<div
			className={cn(
				"rounded-md border px-3 py-2.5",
				blocked
					? "border-destructive/30 bg-destructive/[0.04]"
					: "border-border/70 bg-card",
			)}
		>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
				<span className="text-sm font-semibold">
					{candidate.poolName || candidate.pool}
				</span>
				<Badge variant={actionVariant(candidate.action)}>
					{candidate.action}
				</Badge>
				{blocked ? (
					<Badge variant="destructive" className="gap-1">
						<ShieldXIcon />
						Blocked
					</Badge>
				) : (
					<Badge variant="outline">Pass</Badge>
				)}
				{failed ? (
					<Badge variant="destructive">Exec failed</Badge>
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
				{candidate.heuristicScore > 0 ? (
					<span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
						score {candidate.heuristicScore}
					</span>
				) : null}
			</div>
			{candidate.rationale ? (
				<p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
					{candidate.rationale}
				</p>
			) : null}
			{candidate.blockedReason ? (
				<p className="mt-1.5 border-l-2 border-destructive/50 pl-2 text-xs leading-relaxed text-destructive">
					{candidate.blockedReason}
				</p>
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
		<Card className="min-w-0 gap-0 overflow-hidden py-0">
			<CardHeader className="gap-3 border-b py-4">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<div>
						<CardTitle className="text-sm">Decision journal</CardTitle>
						<p className="text-xs text-muted-foreground">
							{total} decision{total === 1 ? "" : "s"} · newest cycle first
						</p>
					</div>
					<span className="font-mono text-xs text-muted-foreground tabular-nums">
						{from}–{to} of {total}
					</span>
				</div>
				<Tabs value={filter} onValueChange={onFilterChange}>
					<TabsList className="h-8 w-full justify-start gap-0.5 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						{FILTER_TABS.map((tab) => (
							<TabsTrigger
								key={tab.value}
								value={tab.value}
								className="shrink-0 flex-none px-3 text-xs"
							>
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			</CardHeader>
			<CardContent className="px-0 pb-0">
				{groups.length === 0 ? (
					<div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
						<p className="text-sm font-medium">No journal entries</p>
						<p className="text-xs text-muted-foreground">
							{filter !== "all"
								? `Nothing tagged "${filter}" on this page. Try All.`
								: "Run the agent once and decisions land here."}
						</p>
					</div>
				) : (
					<ol className="divide-y divide-border">
						{groups.map((group) => {
							const troubled =
								group.llmStatus === "failed" ||
								group.rows.some(
									(r) =>
										r.candidate?.guardrail === "blocked" ||
										r.candidate?.execution === "failed",
								);
							return (
								<li key={group.cycle} className="flex gap-3 px-4 py-3.5">
									<div className="flex w-12 shrink-0 flex-col items-center">
										<span
											className={cn(
												"flex size-2.5 rounded-full ring-4",
												troubled
													? "bg-destructive ring-destructive/10"
													: "bg-emerald-500 ring-emerald-500/10",
											)}
										/>
										<span className="mt-1.5 font-mono text-[11px] font-bold tabular-nums">
											#{group.cycle}
										</span>
										<span className="max-w-full truncate text-[11px] text-muted-foreground">
											{tsLocal(group.ts)}
										</span>
									</div>
									<div className="min-w-0 flex-1 space-y-2">
										{group.llmStatus === "failed" ? (
											<Badge variant="destructive" className="w-fit">
												LLM failed this cycle
											</Badge>
										) : null}
										{group.rows.length === 0 ||
										group.rows.every((r) => r.candidate === null) ? (
											<p className="rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
												No candidates this cycle. Agent scanned and stood down.
											</p>
										) : (
											group.rows.map((row) =>
												row.candidate === null ? null : (
													<CandidateRow
														key={`${row.cycle}-${row.candidate.pool}-${row.candidate.action}`}
														candidate={row.candidate}
													/>
												),
											)
										)}
									</div>
								</li>
							);
						})}
					</ol>
				)}
				{total > 0 ? (
					<div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
						<span className="text-xs text-muted-foreground tabular-nums">
							Page {page} of {pages}
						</span>
						<div className="flex items-center gap-1.5">
							<Button
								variant="outline"
								size="sm"
								disabled={page <= 1}
								onClick={() => onPageChange(page - 1)}
							>
								<ChevronLeftIcon />
								Prev
							</Button>
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
