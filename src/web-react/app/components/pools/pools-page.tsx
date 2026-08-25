import type { ScreenedPool } from "@vexis/domain/index.js";
import { useEffect, useState } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { PoolsContent } from "~/components/pools/pools-content";
import { PoolsHeader } from "~/components/pools/pools-header";
import { Card, CardContent } from "~/components/ui/card";
import {
	POOLS_CURRENCY_STORAGE_KEY,
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "~/lib/currency";
import type { PoolsPayload } from "~/lib/pools";

type LoaderData = PoolsPayload;

function PoolsPageContent({ payload }: { payload: PoolsPayload }) {
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
	const [displayPools, setDisplayPools] = useState<ScreenedPool[]>(
		() => payload.pools as ScreenedPool[],
	);

	useEffect(() => {
		setStoredCurrency(
			readStoredCurrency(window.localStorage, POOLS_CURRENCY_STORAGE_KEY),
		);
	}, []);

	useEffect(() => {
		setDisplayPools(payload.pools as ScreenedPool[]);
	}, [payload.pools]);

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
						setDisplayPools(data.pools);
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
					for (const line of lines) {
						if (!line.trim() || line.includes('"_error"')) continue;
						try {
							const pool = JSON.parse(line) as ScreenedPool;
							if (cancelled) break;
							setDisplayPools((prev) =>
								prev.map((p) => (p.pool === pool.pool ? { ...p, ...pool } : p)),
							);
							setSelectedPool((prev) =>
								prev && prev.pool === pool.pool
									? ({ ...prev, ...pool } as ScreenedPool)
									: prev,
							);
						} catch {}
					}
				}
				if (buffer.trim() && !cancelled) {
					try {
						const pool = JSON.parse(buffer) as ScreenedPool;
						setDisplayPools((prev) =>
							prev.map((p) => (p.pool === pool.pool ? { ...p, ...pool } : p)),
						);
					} catch {}
				}
			} catch {}
		})();
		return () => {
			cancelled = true;
			controller.abort();
		};
	}, [timeframe, payload.ok, payload.pools.length]);

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
		writeStoredCurrency(
			window.localStorage,
			POOLS_CURRENCY_STORAGE_KEY,
			currency,
		);
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
					<PoolsContent
						pools={displayPools}
						currency={currency}
						solPrice={payload.solPrice}
						selectedPool={selectedPool}
						onSelect={setSelectedPool}
						onClose={() => setSelectedPool(null)}
					/>
				)}
			</div>
		</DashboardShell>
	);
}

export function PoolsPage() {
	const data = useLoaderData<LoaderData>();

	return <PoolsPageContent payload={data} />;
}
