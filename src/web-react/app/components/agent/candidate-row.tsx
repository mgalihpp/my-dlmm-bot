import type { JournalCandidate } from "@vexis/telegram/agent/journal.js";
import { ExternalLinkIcon } from "lucide-react";
import { memo } from "react";
import { Badge } from "~/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { shortAddr, solscanUrl } from "~/lib/format";

export type CandidateLike = Pick<
	JournalCandidate,
	| "pool"
	| "poolName"
	| "action"
	| "guardrail"
	| "blockedReason"
	| "execution"
	| "txSignature"
	| "rationale"
>;

export function actionVariant(
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

export const CandidateRow = memo(function CandidateRow({
	candidate,
}: {
	candidate: CandidateLike;
}) {
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
});
