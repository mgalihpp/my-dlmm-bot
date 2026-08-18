import type { ScreenedPool } from "@vexis/domain/index.js";
import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { CurrencyIcon } from "~/components/currency-icon";
import { DashboardShell } from "~/components/dashboard-shell";
import {
	ChartGridSkeleton,
	PageSkeleton,
	useIsNavigating,
} from "~/components/page-skeletons";
import { PoolDetailSheet } from "~/components/pools/pool-detail-sheet";
import { PoolsTable } from "~/components/pools/pools-table";
import { StatCards } from "~/components/pools/stat-cards";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "~/lib/currency";
import { type PoolsPayload, TIMEFRAMES } from "~/lib/pools";

const MarketCharts = lazy(() =>
	import("~/components/pools/market-charts").then((m) => ({
		default: m.MarketCharts,
	})),
);

export function PoolsPage() {
	const data = useLoaderData<PoolsPayload>();
	const { revalidate, state } = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();
	const isNavigating = useIsNavigating();
	const timeframe = searchParams.get("timeframe") ?? data.timeframe;
	const [storedCurrency, setStoredCurrency] = useState<"usd" | "sol" | null>(
		null,
	);
	const currency = resolveCurrency(
		searchParams.get("currency"),
		storedCurrency,
	);
	const [selectedPool, setSelectedPool] = useState<ScreenedPool | null>(null);

	useEffect(() => {
		setStoredCurrency(readStoredCurrency(window.localStorage));
	}, []);

	useEffect(() => {
		const onVisibility = () => {
			if (!document.hidden) revalidate();
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	}, [revalidate]);

	const onTimeframeChange = (value: string) =>
		setSearchParams((current) => {
			const next = new URLSearchParams(current);
			if (value === data.timeframe) next.delete("timeframe");
			else next.set("timeframe", value);
			return next;
		});
	const onCurrencyChange = (value: string) => {
		const currency = value as "usd" | "sol";
		writeStoredCurrency(window.localStorage, currency);
		setStoredCurrency(currency);
		setSearchParams((current) => {
			const next = new URLSearchParams(current);
			if (value === "usd") next.delete("currency");
			else next.set("currency", value);
			return next;
		});
	};

	return (
		<DashboardShell title="Pool Radar" wallet={data.wallet} rpc={data.rpc}>
			{isNavigating ? (
				<PageSkeleton />
			) : (
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
							<Tabs value={currency} onValueChange={onCurrencyChange}>
								<TabsList>
									<TabsTrigger value="usd" aria-label="USD / USDC">
										<CurrencyIcon currency="usd" decorative />
									</TabsTrigger>
									<TabsTrigger value="sol" aria-label="SOL / Solana">
										<CurrencyIcon currency="sol" decorative />
									</TabsTrigger>
								</TabsList>
							</Tabs>
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
								{data.error ?? "Unknown error"} — check the backend connection
								and try refreshing.
							</CardContent>
						</Card>
					) : data.pools.length === 0 ? (
						<Card className="mx-4 lg:mx-6">
							<CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
								No pools found for the {timeframe} timeframe.
							</CardContent>
						</Card>
					) : (
						<>
							<StatCards
								pools={data.pools}
								currency={currency}
								solPrice={data.solPrice}
							/>
							<Suspense fallback={<ChartGridSkeleton />}>
								<MarketCharts
									pools={data.pools}
									currency={currency}
									solPrice={data.solPrice}
								/>
							</Suspense>
							<PoolsTable
								pools={data.pools}
								currency={currency}
								solPrice={data.solPrice}
								onSelect={setSelectedPool}
							/>
							<PoolDetailSheet
								pool={selectedPool}
								currency={currency}
								solPrice={data.solPrice}
								onOpenChange={(open) => !open && setSelectedPool(null)}
							/>
						</>
					)}
				</div>
			)}
		</DashboardShell>
	);
}
