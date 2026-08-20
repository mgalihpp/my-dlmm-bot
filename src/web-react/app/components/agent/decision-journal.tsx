import type {
	JournalFilter,
	TimelineGroup,
} from "@vexis/shared/agent-journal.js";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { tsLocal } from "~/lib/format";
import { CandidateRow } from "./candidate-row";

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
										group.rows.map((row) =>
											row.candidate === null ? (
												<p
													key={`${row.cycle}-empty`}
													className="py-2 text-xs text-muted-foreground"
												>
													No candidates
												</p>
											) : (
												<CandidateRow
													key={`${row.cycle}-${row.candidate.pool}-${row.candidate.action}`}
													candidate={row.candidate}
												/>
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
