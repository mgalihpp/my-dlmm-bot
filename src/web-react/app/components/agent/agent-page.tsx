import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { lazy, Suspense, useEffect } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { DashboardShell } from "~/components/dashboard-shell";
import {
	ChartCardSkeleton,
	PageSkeleton,
	useIsNavigating,
} from "~/components/page-skeletons";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { AgentPayload } from "~/lib/server/agent.server";
import { DecisionJournal } from "./decision-journal";
import { NarrativeCard } from "./narrative-card";
import { StatCards } from "./stat-cards";
import { StatusBanner } from "./status-banner";

const CycleChart = lazy(() =>
	import("./cycle-chart").then((m) => ({ default: m.CycleChart })),
);

const REFRESH_MS = 30_000;

export function AgentPage() {
	const data = useLoaderData<AgentPayload>();
	const { revalidate, state } = useRevalidator();
	const [, setSearchParams] = useSearchParams();
	const isNavigating = useIsNavigating();

	useEffect(() => {
		const timer = setInterval(() => {
			if (!document.hidden) revalidate();
		}, REFRESH_MS);
		const onVisibility = () => {
			if (!document.hidden) revalidate();
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [revalidate]);

	const onFilterChange = (value: string) =>
		setSearchParams(value === "all" ? {} : { action: value });
	const onPageChange = (next: number) => {
		const params: Record<string, string> = {};
		if (data.filter && data.filter !== "all") params.action = data.filter;
		if (next > 1) params.page = String(next);
		setSearchParams(params);
	};

	return (
		<DashboardShell title="Agent" wallet={data.wallet} rpc={data.rpc}>
			{isNavigating ? (
				<PageSkeleton />
			) : (
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
					<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
						<h1 className="text-2xl font-bold tracking-tight">Agent Console</h1>
						<Button
							variant="outline"
							size="sm"
							onClick={() => revalidate()}
							disabled={state === "loading"}
						>
							<RefreshCwIcon
								className={state === "loading" ? "animate-spin" : ""}
							/>
							Refresh
						</Button>
					</div>

					{!data.ok ? (
						<Card className="mx-4 lg:mx-6">
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-destructive">
									<AlertCircleIcon className="size-5" />
									Failed to load agent
								</CardTitle>
							</CardHeader>
							<CardContent className="text-sm text-muted-foreground">
								{data.error ?? "Unknown error"} — check the backend connection
								and try refreshing.
							</CardContent>
						</Card>
					) : (
						<>
							<StatusBanner state={data.state!} />
							<StatCards stats={data.stats!} />
							<div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-2">
								<NarrativeCard
									narrative={data.narrative!}
									stats={data.stats!}
								/>
								<Suspense
									fallback={<ChartCardSkeleton blockClassName="h-64 w-full" />}
								>
									<CycleChart data={data.chart!} />
								</Suspense>
							</div>
							<DecisionJournal
								filter={data.filter!}
								page={data.page!}
								pages={data.pages!}
								total={data.total!}
								groups={data.groups!}
								onFilterChange={onFilterChange}
								onPageChange={onPageChange}
							/>
						</>
					)}
				</div>
			)}
		</DashboardShell>
	);
}
