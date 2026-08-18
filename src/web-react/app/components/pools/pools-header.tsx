import { CurrencyIcon } from "~/components/currency-icon";
import { RefreshButton } from "~/components/dashboard-page-parts";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { TIMEFRAMES } from "~/lib/pools";

export function PoolsHeader({
	total,
	ok,
	timeframe,
	currency,
	onCurrencyChange,
	onTimeframeChange,
	onRefresh,
	refreshing,
}: {
	total: number;
	ok: boolean;
	timeframe: string;
	currency: "usd" | "sol";
	onCurrencyChange: (value: string) => void;
	onTimeframeChange: (value: string) => void;
	onRefresh: () => void;
	refreshing: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">Pool Radar</h1>
				<p className="text-sm text-muted-foreground">
					{ok ? `${total} pools · ${timeframe}` : "Screening unavailable"}
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
						{TIMEFRAMES.map((value) => (
							<SelectItem key={value} value={value}>
								{value}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<RefreshButton loading={refreshing} onClick={onRefresh} />
			</div>
		</div>
	);
}
