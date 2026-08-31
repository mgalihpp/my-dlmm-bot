import type { ScreenedPool } from "@vexis/domain/index.js";
import {
	lazy,
	Suspense,
	startTransition,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { ChartGridSkeleton } from "~/components/page-skeletons";
import { PoolsHeader } from "~/components/pools/pools-header";
import { Card, CardContent } from "~/components/ui/card";
import { useStoredCurrency } from "~/hooks/use-stored-currency";
import type { PoolsPayload } from "~/lib/pools";

const PoolsContent = lazy(() =>
	import("~/components/pools/pools-content").then((m) => ({
		default: m.PoolsContent,
	})),
);

type LoaderData = PoolsPayload;

function PoolsPageContent({ payload }: { payload: PoolsPayload }) {
	const { revalidate, state } = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();
	const timeframe = searchParams.get("timeframe") ?? payload.timeframe;
	const [currency, setCurrency] = useStoredCurrency("pools");
	const [selectedPool, setSelectedPool] = useState<ScreenedPool | null>(null);
	const [enrichedPools, setEnrichedPools] = useState<
		Record<string, ScreenedPool>
	>({});
	const displayPools = useMemo(() => {
		const base = payload.pools as ScreenedPool[];
		if (Object.keys(enrichedPools).length === 0) return base;
		return base.map((p) => enrichedPools[p.pool] ?? p);
	}, [payload.pools, enrichedPools]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: P0 waterfall fix - deps primitive timeframe only, batch NDJSON
	useEffect(() => {
		if (!payload.ok || payload.pools.length === 0) return;
		let cancelled = false;
		const controller = new AbortController();
		(async () => {
			try {
				const res = await fetch(
					`/api/pools-enriched?timeframe=${encodeURIComponent(timeframe)}`,
					{
						signal: controller.signal,
						credentials: "same-origin",
						headers: { Accept: "application/x-ndjson" },
					},
				);
				if (!res.ok || !res.body) {
					const data = (await res.json()) as {
						ok?: boolean;
						pools?: ScreenedPool[];
					};
					if (!cancelled && data.ok && Array.isArray(data.pools)) {
						const map: Record<string, ScreenedPool> = {};
						for (const p of data.pools) map[p.pool] = p;
						startTransition(() => setEnrichedPools(map));
					}
					return;
				}
				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					if (cancelled) break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					// Batch per NDJSON chunk: accumulate then single setState
					const batch: Record<string, ScreenedPool> = {};
					for (const line of lines) {
						if (!line.trim() || line.includes('"_error"')) continue;
						try {
							const pool = JSON.parse(line) as ScreenedPool;
							if (cancelled) break;
							batch[pool.pool] = pool;
						} catch {}
					}
					if (Object.keys(batch).length > 0) {
						const toFlush = { ...batch };
						startTransition(() => {
							setEnrichedPools((prev) => ({ ...prev, ...toFlush }));
							setSelectedPool((prev) =>
								prev && toFlush[prev.pool]
									? ({ ...prev, ...toFlush[prev.pool] } as ScreenedPool)
									: prev,
							);
						});
					}
				}
				if (buffer.trim() && !cancelled) {
					try {
						const pool = JSON.parse(buffer) as ScreenedPool;
						startTransition(() =>
							setEnrichedPools((prev) => ({ ...prev, [pool.pool]: pool })),
						);
					} catch {}
				}
			} catch {}
		})();
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [timeframe]);

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
		setCurrency(value as "usd" | "sol");
	};

	return (
		<DashboardShell
			title="Pool Radar"
			wallet={payload.wallet}
			rpc={payload.rpc}
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
				) : displayPools.length === 0 ? (
					<Card className="mx-4 lg:mx-6">
						<CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
							No pools found for the {timeframe} timeframe.
						</CardContent>
					</Card>
				) : (
					<Suspense fallback={<ChartGridSkeleton />}>
						<PoolsContent
							pools={displayPools}
							currency={currency}
							solPrice={payload.solPrice}
							selectedPool={selectedPool}
							onSelect={setSelectedPool}
							onClose={() => setSelectedPool(null)}
						/>
					</Suspense>
				)}
			</div>
		</DashboardShell>
	);
}

export function PoolsPage() {
	const data = useLoaderData<LoaderData>();

	return <PoolsPageContent payload={data} />;
}
