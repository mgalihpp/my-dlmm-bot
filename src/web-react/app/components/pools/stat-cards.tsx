import type { ScreenedPool } from "@vexis/domain/index.js";
import {
	CircleDollarSignIcon,
	LayersIcon,
	RadarIcon,
	ShieldAlertIcon,
	WalletIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { CurrencyIcon } from "~/components/currency-icon";
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { type Currency, fmtAmount } from "~/lib/pools";

function CurrencyAmount({
	value,
	currency,
}: {
	value: string;
	currency: Currency;
}) {
	const amount = currency === "sol" ? value.replace(/ SOL$/, "") : value;
	return amount === "-" ? (
		amount
	) : (
		<span className="inline-flex items-center gap-1">
			<span>{amount}</span>
			<CurrencyIcon currency={currency} decorative />
		</span>
	);
}

function StatCard({
	icon: Icon,
	label,
	value,
	sub,
}: {
	icon: ComponentType<{ className?: string }>;
	label: string;
	value: ReactNode;
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
				value={
					<CurrencyAmount
						value={fmtAmount(tvl, currency, solPrice)}
						currency={currency}
					/>
				}
				sub="across shown pools"
			/>
			<StatCard
				icon={WalletIcon}
				label="Volume"
				value={
					<CurrencyAmount
						value={fmtAmount(volume, currency, solPrice)}
						currency={currency}
					/>
				}
				sub="in the selected timeframe"
			/>
			<StatCard
				icon={CircleDollarSignIcon}
				label="Fees"
				value={
					<CurrencyAmount
						value={fmtAmount(fees, currency, solPrice)}
						currency={currency}
					/>
				}
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
