import type { ScreenedPool } from "@vexis/domain/index.js";
import { lazy, Suspense } from "react";
import { ChartGridSkeleton } from "~/components/page-skeletons";
import { PoolDetailSheet } from "~/components/pools/pool-detail-sheet";
import { PoolsTable } from "~/components/pools/pools-table";
import { StatCards } from "~/components/pools/stat-cards";

const MarketCharts = lazy(() =>
	import("~/components/pools/market-charts").then((m) => ({
		default: m.MarketCharts,
	})),
);

export function PoolsContent({
	pools,
	currency,
	solPrice,
	selectedPool,
	onSelect,
	onClose,
}: {
	pools: Parameters<typeof StatCards>[0]["pools"];
	currency: "usd" | "sol";
	solPrice: number | null;
	selectedPool: ScreenedPool | null;
	onSelect: (pool: ScreenedPool) => void;
	onClose: () => void;
}) {
	return (
		<>
			<StatCards pools={pools} currency={currency} solPrice={solPrice} />
			<Suspense fallback={<ChartGridSkeleton />}>
				<MarketCharts pools={pools} currency={currency} solPrice={solPrice} />
			</Suspense>
			<PoolsTable
				pools={pools}
				currency={currency}
				solPrice={solPrice}
				onSelect={onSelect}
			/>
			<PoolDetailSheet
				pool={selectedPool}
				currency={currency}
				solPrice={solPrice}
				onOpenChange={(open) => !open && onClose()}
			/>
		</>
	);
}
