import type { ScreenedPool } from "@vexis/domain/index.js";
import { Suspense, useEffect, useState } from "react";
import {
	Await,
	useLoaderData,
	useRevalidator,
	useSearchParams,
} from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { PageSkeleton, useIsNavigating } from "~/components/page-skeletons";
import { PoolsPageSkeleton } from "~/components/page-skeletons/pools";
import { PoolsContent } from "~/components/pools/pools-content";
import { PoolsHeader } from "~/components/pools/pools-header";
import { Card, CardContent } from "~/components/ui/card";
import {
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "~/lib/currency";
import type { PoolsPayload } from "~/lib/pools";

type LoaderData = {
	critical: Promise<PoolsPayload>;
	deferred: Promise<readonly ScreenedPool[]>;
};

function PoolsPageContent({
	payload,
	deferred,
}: {
	payload: PoolsPayload;
	deferred: Promise<readonly ScreenedPool[]>;
}) {
	const { revalidate, state } = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();
	const timeframe = searchParams.get("timeframe") ?? payload.timeframe;
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
				if (value === payload.timeframe) next.delete("timeframe");
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
			wallet={payload.wallet}
			rpc={payload.rpc}
			realtimeMs={60_000}
		>
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<PoolsHeader
					total={payload.total}
					ok={payload.ok}
					timeframe={timeframe}
					currency={currency}
					onCurrencyChange={onCurrencyChange}
					onTimeframeChange={onTimeframeChange}
					onRefresh={revalidate}
					refreshing={state === "loading"}
				/>

				{!payload.ok ? (
					<LoadErrorCard title="Failed to load pools" error={payload.error} />
				) : payload.pools.length === 0 ? (
					<Card className="mx-4 lg:mx-6">
						<CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
							No pools found for the {timeframe} timeframe.
						</CardContent>
					</Card>
				) : (
					<Suspense
						fallback={
							<PoolsContent
								pools={payload.pools}
								currency={currency}
								solPrice={payload.solPrice}
								selectedPool={selectedPool}
								onSelect={setSelectedPool}
								onClose={() => setSelectedPool(null)}
							/>
						}
					>
						<Await
							resolve={deferred}
							errorElement={
								<PoolsContent
									pools={payload.pools}
									currency={currency}
									solPrice={payload.solPrice}
									selectedPool={selectedPool}
									onSelect={setSelectedPool}
									onClose={() => setSelectedPool(null)}
								/>
							}
						>
							{(enriched: readonly ScreenedPool[]) => (
								<PoolsContent
									pools={enriched.length > 0 ? enriched : payload.pools}
									currency={currency}
									solPrice={payload.solPrice}
									selectedPool={selectedPool}
									onSelect={setSelectedPool}
									onClose={() => setSelectedPool(null)}
								/>
							)}
						</Await>
					</Suspense>
				)}
			</div>
		</DashboardShell>
	);
}

export function PoolsPage() {
	const data = useLoaderData<LoaderData>();
	const isNavigating = useIsNavigating();

	// During client navigation the old route stays mounted for 1 frame —
	// show skeleton for target route instantly (same trick as agent/settings).
	if (isNavigating) {
		return (
			<DashboardShell title="Pool Radar" realtimeMs={60_000}>
				<PageSkeleton />
			</DashboardShell>
		);
	}

	return (
		<Suspense
			fallback={
				<DashboardShell title="Pool Radar" realtimeMs={60_000}>
					<PoolsPageSkeleton />
				</DashboardShell>
			}
		>
			<Await
				resolve={data.critical}
				errorElement={
					<DashboardShell title="Pool Radar" realtimeMs={60_000}>
						<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
							<LoadErrorCard
								title="Failed to load pools"
								error="Loader failed"
							/>
						</div>
					</DashboardShell>
				}
			>
				{(payload: PoolsPayload) => (
					<PoolsPageContent payload={payload} deferred={data.deferred} />
				)}
			</Await>
		</Suspense>
	);
}
