import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { DashboardShell } from "~/components/dashboard-shell";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { PortfolioPayload } from "~/lib/server/portfolio.server";
import { AllocationDonut } from "./allocation-donut";
import { ClosedTable } from "./closed-table";
import { EquityChart } from "./equity-chart";
import { PositionsTable } from "./positions-table";
import { StatCards } from "./stat-cards";

const REFRESH_MS = 30_000;

export type Currency = "usd" | "sol";
export type RangeFilter = "all" | "in-range" | "oor";

function greeting() {
	const h = new Date().getHours();
	if (h >= 5 && h < 11) return "Selamat pagi!";
	if (h >= 11 && h < 15) return "Selamat siang!";
	if (h >= 15 && h < 18) return "Selamat sore!";
	return "Selamat malam!";
}

export function PortfolioPage() {
	const data = useLoaderData<PortfolioPayload>();
	const { revalidate, state } = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();
	const currency = searchParams.get("currency") === "sol" ? "sol" : "usd";
	const setCurrency = (v: Currency) =>
		setSearchParams(v === "usd" ? {} : { currency: v });
	const [rangeFilter, setRangeFilter] = useState<RangeFilter>("all");

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

	return (
		<DashboardShell title="Portfolio" wallet={data.wallet} rpc={data.rpc}>
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
					<h1 className="text-2xl font-bold tracking-tight">{greeting()}</h1>
					<div className="flex items-center gap-2">
						<Tabs
							value={currency}
							onValueChange={(v) => setCurrency(v as Currency)}
						>
							<TabsList>
								<TabsTrigger value="usd">USD</TabsTrigger>
								<TabsTrigger value="sol">SOL</TabsTrigger>
							</TabsList>
						</Tabs>
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
								Failed to load portfolio
							</CardTitle>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							{data.error ?? "Unknown error"} — check the backend connection and
							try refreshing.
						</CardContent>
					</Card>
				) : (
					<>
						<StatCards
							summary={data.summary!}
							total={data.total!}
							history={data.history!}
							currency={currency}
							rangeFilter={rangeFilter}
							onRangeFilterChange={setRangeFilter}
						/>
						<div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @4xl/main:grid-cols-3">
							<div className="@4xl/main:col-span-2">
								<EquityChart history={data.history!} currency={currency} />
							</div>
							<AllocationDonut
								pools={data.pools!}
								summary={data.summary!}
								currency={currency}
							/>
						</div>
						<PositionsTable
							pools={data.pools!}
							rangeFilter={rangeFilter}
							onRangeFilterChange={setRangeFilter}
						/>
						<ClosedTable closed={data.closed!} />
					</>
				)}
			</div>
		</DashboardShell>
	);
}
