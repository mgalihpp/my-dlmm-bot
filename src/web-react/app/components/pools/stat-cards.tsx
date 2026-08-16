import type { ScreenedPool } from "@vexis/domain/index.js";
import {
	CircleDollarSignIcon,
	LayersIcon,
	RadarIcon,
	ShieldAlertIcon,
	WalletIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { type Currency, fmtAmount } from "~/lib/pools";

function StatCard({
	icon: Icon,
	label,
	value,
	sub,
}: {
	icon: ComponentType<{ className?: string }>;
	label: string;
	value: string;
	sub: string;
}) {
	return (
		<Card className="@container/card">
			<CardHeader>
				<CardDescription className="flex items-center gap-1.5">
					<Icon className="size-3.5" />
					{label}
				</CardDescription>
				<CardTitle className="text-2xl font-semibold tabular-nums">
					{value}
				</CardTitle>
			</CardHeader>
			<CardFooter className="mt-auto">
				<span className="text-xs text-muted-foreground">{sub}</span>
			</CardFooter>
		</Card>
	);
}

export function StatCards({
	pools,
	currency,
	solPrice,
}: {
	pools: readonly ScreenedPool[];
	currency: Currency;
	solPrice: number | null;
}) {
	const tvl = pools.reduce((s, p) => s + p.tvl, 0);
	const volume = pools.reduce((s, p) => s + p.volume, 0);
	const fees = pools.reduce((s, p) => s + p.fee, 0);
	const rugFlagged = pools.filter(
		(p) => p.rugScore != null && p.rugScore >= 1250,
	).length;

	return (
		<div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-5 dark:*:data-[slot=card]:bg-card">
			<StatCard
				icon={RadarIcon}
				label="Pools shown"
				value={String(pools.length)}
				sub="after screening filters"
			/>
			<StatCard
				icon={LayersIcon}
				label="Combined TVL"
				value={fmtAmount(tvl, currency, solPrice)}
				sub="across shown pools"
			/>
			<StatCard
				icon={WalletIcon}
				label="Volume"
				value={fmtAmount(volume, currency, solPrice)}
				sub="in the selected timeframe"
			/>
			<StatCard
				icon={CircleDollarSignIcon}
				label="Fees"
				value={fmtAmount(fees, currency, solPrice)}
				sub="accrued by LPs"
			/>
			<StatCard
				icon={ShieldAlertIcon}
				label="Rug flagged"
				value={String(rugFlagged)}
				sub="score ≥ 1250"
			/>
		</div>
	);
}
