import { lazy, Suspense, useEffect, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { useAutoRefresh } from "~/hooks/use-auto-refresh";
import type { Currency } from "~/lib/currency";
import {
	PORTFOLIO_CURRENCY_STORAGE_KEY,
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "~/lib/currency";
import type { PortfolioPayload } from "~/lib/server/portfolio.server";
import type { loader as openRangesLoader } from "~/routes/api.open-ranges";
import type { loader as poolIconsLoader } from "~/routes/api.pool-icons";
import { PortfolioHeader } from "./portfolio-header";
import type { RangeFilter } from "./portfolio-page";
import { PositionsTableSkeleton } from "./portfolio-table-skeletons";

const PositionsTable = lazy(() =>
	import("./positions-table-grid").then((m) => ({ default: m.PositionsTable })),
);

export function PortfolioActivePage() {
	useAutoRefresh(10_000);
	const data = useLoaderData<PortfolioPayload>();
	const [searchParams, setSearchParams] = useSearchParams();
	const [storedCurrency, setStoredCurrency] = useState<Currency | null>(null);
	const [rangeFilter, setRangeFilter] = useState<RangeFilter>("all");
	const { revalidate, state } = useRevalidator();
	const currency = resolveCurrency(searchParams.get("currency"), storedCurrency);
	const [pools, setPools] = useState(() => data.pools ?? []);

	const rangesFetcher = useFetcher<typeof openRangesLoader>();
	const iconsFetcher = useFetcher<typeof poolIconsLoader>();
	const rangesLoading = rangesFetcher.state !== "idle";

	useEffect(() => {
		setPools((prev) => {
			const incoming = data.pools ?? [];
			if (prev.length === 0) return incoming;
			return incoming.map((p) => {
				const prevPool = prev.find((x) => x.poolAddress === p.poolAddress);
				const incomingHasRange = (p as { positionsRange?: unknown }).positionsRange != null;
				const prevHasRange = (prevPool as { positionsRange?: unknown } | undefined)?.positionsRange != null;
				const incomingHasIcon = (p as { tokenXIcon?: unknown }).tokenXIcon != null;
				const prevHasIcon = (prevPool as { tokenXIcon?: unknown } | undefined)?.tokenXIcon != null;
				let merged: typeof p = p;
				if (!incomingHasRange && prevHasRange) {
					merged = { ...merged, positionsRange: (prevPool as { positionsRange: unknown }).positionsRange } as typeof p;
				}
				if (!incomingHasIcon && prevHasIcon) {
					merged = {
						...merged,
						tokenXIcon: (prevPool as { tokenXIcon: unknown }).tokenXIcon,
						tokenYIcon: (prevPool as { tokenYIcon: unknown }).tokenYIcon,
						mcap: (prevPool as { mcap: unknown }).mcap,
					} as typeof p;
				}
				return merged;
			});
		});
	}, [data.pools]);

	useEffect(() => {
		setStoredCurrency(readStoredCurrency(window.localStorage, PORTFOLIO_CURRENCY_STORAGE_KEY));
	}, []);

	useEffect(() => {
		if (!data.pools || data.pools.length === 0) return;
		const hasRanges = data.pools.some((p) => (p as { positionsRange?: unknown }).positionsRange != null);
		if (hasRanges) return;
		const addrs = data.pools.map((p) => p.poolAddress).join(",");
		rangesFetcher.load(`/api/open-ranges?pools=${encodeURIComponent(addrs)}`);
	}, [data.pools]);

	useEffect(() => {
		if (!data.pools || data.pools.length === 0) return;
		const needsIcons = data.pools.some((p) => (p as { tokenXIcon?: unknown }).tokenXIcon == null);
		if (!needsIcons) return;
		const addrs = data.pools.map((p) => p.poolAddress).join(",");
		iconsFetcher.load(`/api/pool-icons?pools=${encodeURIComponent(addrs)}`);
	}, [data.pools]);

	useEffect(() => {
		const d = rangesFetcher.data as { ok?: boolean; ranges?: Record<string, unknown> } | undefined;
		if (!d?.ok || !d.ranges) return;
		setPools((prev) =>
			prev.map((p) => {
				const r = (d.ranges as Record<string, unknown>)[p.poolAddress];
				if (!r) return p;
				return { ...p, positionsRange: r } as typeof p;
			}),
		);
	}, [rangesFetcher.data]);

	useEffect(() => {
		const d = iconsFetcher.data as { ok?: boolean; icons?: { poolAddress: string; tokenXIcon: string | null; tokenYIcon: string | null; mcap: number | null }[] } | undefined;
		if (!d?.ok || !Array.isArray(d.icons)) return;
		const map = new Map(d.icons.map((x) => [x.poolAddress, x]));
		setPools((prev) =>
			prev.map((p) => {
				const hit = map.get(p.poolAddress);
				if (!hit) return p;
				return { ...p, tokenXIcon: hit.tokenXIcon, tokenYIcon: hit.tokenYIcon, mcap: hit.mcap } as typeof p;
			}),
		);
	}, [iconsFetcher.data]);

	const setCurrency = (value: Currency) => {
		writeStoredCurrency(window.localStorage, PORTFOLIO_CURRENCY_STORAGE_KEY, value);
		setStoredCurrency(value);
		const next = new URLSearchParams(searchParams);
		next.set("currency", value);
		setSearchParams(next, { preventScrollReset: true });
	};

	if (!data.ok) {
		return (
			<DashboardShell title="Portfolio" wallet={data.wallet} rpc={data.rpc}>
				<div className="px-4 py-6 lg:px-6">
					<LoadErrorCard message={data.error ?? "Failed to load"} onRetry={revalidate} />
				</div>
			</DashboardShell>
		);
	}

	return (
		<DashboardShell title="Portfolio" wallet={data.wallet} rpc={data.rpc}>
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<PortfolioHeader
					title="Active Positions"
					currency={currency}
					onCurrencyChange={setCurrency}
					onRefresh={revalidate}
					refreshing={state === "loading"}
				/>
				<Suspense fallback={<PositionsTableSkeleton />}>
					<PositionsTable
						pools={pools}
						rangeFilter={rangeFilter}
						onRangeFilterChange={setRangeFilter}
						currency={currency}
						solPrice={data.solPrice}
						rangesLoading={rangesLoading}
					/>
				</Suspense>
			</div>
		</DashboardShell>
	);
}
