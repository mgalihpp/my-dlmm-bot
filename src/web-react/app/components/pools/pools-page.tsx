import type { ScreenedPool } from "@vexis/domain/index.js";
import { useEffect, useState } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { PageSkeleton, useIsNavigating } from "~/components/page-skeletons";
import { PoolsContent } from "~/components/pools/pools-content";
import { PoolsHeader } from "~/components/pools/pools-header";
import { Card, CardContent } from "~/components/ui/card";
import {
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "~/lib/currency";
import type { PoolsPayload } from "~/lib/pools";

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

	const onTimeframeChange = (value: string) =>
		setSearchParams(
			(current) => {
				const next = new URLSearchParams(current);
				if (value === data.timeframe) next.delete("timeframe");
				else next.set("timeframe", value);
				return next;
			},
			{ preventScrollReset: true },
		);
	const onCurrencyChange = (value: string) => {
		const currency = value as "usd" | "sol";
		writeStoredCurrency(window.localStorage, currency);
		setStoredCurrency(currency);
		setSearchParams(
			(current) => {
				const next = new URLSearchParams(current);
				if (value === "usd") next.delete("currency");
				else next.set("currency", value);
				return next;
			},
			{ preventScrollReset: true },
		);
	};

	return (
		<DashboardShell
			title="Pool Radar"
			wallet={data.wallet}
			rpc={data.rpc}
			realtimeMs={60_000}
		>
			{isNavigating ? (
				<PageSkeleton />
			) : (
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
					<PoolsHeader
						total={data.total}
						ok={data.ok}
						timeframe={timeframe}
						currency={currency}
						onCurrencyChange={onCurrencyChange}
						onTimeframeChange={onTimeframeChange}
						onRefresh={revalidate}
						refreshing={state === "loading"}
					/>

					{!data.ok ? (
						<LoadErrorCard title="Failed to load pools" error={data.error} />
					) : data.pools.length === 0 ? (
						<Card className="mx-4 lg:mx-6">
							<CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
								No pools found for the {timeframe} timeframe.
							</CardContent>
						</Card>
					) : (
						<PoolsContent
							pools={data.pools}
							currency={currency}
							solPrice={data.solPrice}
							selectedPool={selectedPool}
							onSelect={setSelectedPool}
							onClose={() => setSelectedPool(null)}
						/>
					)}
				</div>
			)}
		</DashboardShell>
	);
}
