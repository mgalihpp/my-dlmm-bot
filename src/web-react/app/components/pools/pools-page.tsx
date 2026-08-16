import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { DashboardShell } from "~/components/dashboard-shell";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { TIMEFRAMES, type PoolsPayload } from "~/lib/pools";

export function PoolsPage() {
	const data = useLoaderData<PoolsPayload>();
	const { revalidate, state } = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();
	const timeframe = searchParams.get("timeframe") ?? data.timeframe;

	useEffect(() => {
		const onVisibility = () => {
			if (!document.hidden) revalidate();
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () =>
			document.removeEventListener("visibilitychange", onVisibility);
	}, [revalidate]);

	const onTimeframeChange = (value: string) =>
		setSearchParams(value === data.timeframe ? {} : { timeframe: value });

	return (
		<DashboardShell title="Pool Radar">
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
					<div>
						<h1 className="text-2xl font-bold tracking-tight">Pool Radar</h1>
						<p className="text-sm text-muted-foreground">
							{data.ok
								? `${data.pools.length} shown / ${data.total} pools · ${timeframe}`
								: "Screening unavailable"}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Select value={timeframe} onValueChange={onTimeframeChange}>
							<SelectTrigger className="h-9" aria-label="Timeframe">
								<SelectValue placeholder="Timeframe" />
							</SelectTrigger>
							<SelectContent>
								{TIMEFRAMES.map((tf) => (
									<SelectItem key={tf} value={tf}>
										{tf}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
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
				</div>

				{!data.ok ? (
					<Card className="mx-4 lg:mx-6">
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-destructive">
								<AlertCircleIcon className="size-5" />
								Failed to load pools
							</CardTitle>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							{data.error ?? "Unknown error"} — check the backend connection and
							try refreshing.
						</CardContent>
					</Card>
				) : data.pools.length === 0 ? (
					<Card className="mx-4 lg:mx-6">
						<CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
							No pools found for the {timeframe} timeframe.
						</CardContent>
					</Card>
				) : (
					<div className="px-4 lg:px-6">
						<p className="text-sm text-muted-foreground">
							Charts, stat cards, and table land in the next tasks.
						</p>
					</div>
				)}
			</div>
		</DashboardShell>
	);
}