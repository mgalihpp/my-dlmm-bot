import { CurrencyIcon } from "~/components/currency-icon";
import { RefreshButton } from "~/components/dashboard-page-parts";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { Currency } from "~/lib/currency";
import type { DateFilterState } from "~/lib/date-range";
import { DateRangePicker } from "./date-range-picker";

function greeting() {
	const hour = new Date().getHours();
	if (hour >= 5 && hour < 11) return "Good morning!";
	if (hour >= 11 && hour < 15) return "Good afternoon!";
	if (hour >= 15 && hour < 18) return "Good evening!";
	return "Good night!";
}

export function PortfolioHeader({
	currency,
	onCurrencyChange,
	dateFilter,
	onDateFilterApply,
	onRefresh,
	refreshing,
	title,
}: {
	currency: Currency;
	onCurrencyChange: (currency: Currency) => void;
	dateFilter?: DateFilterState;
	onDateFilterApply?: (value: DateFilterState) => void;
	onRefresh: () => void;
	refreshing: boolean;
	title?: string;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
			<h1 className="text-2xl font-bold tracking-tight">
				{title ?? greeting()}
			</h1>
			<div className="flex items-center gap-2">
				{dateFilter && onDateFilterApply ? (
					<DateRangePicker value={dateFilter} onApply={onDateFilterApply} />
				) : null}
				<Tabs
					value={currency}
					onValueChange={(value) => onCurrencyChange(value as Currency)}
				>
					<TabsList>
						<TabsTrigger value="usd" aria-label="USD / USDC">
							<CurrencyIcon currency="usd" decorative />
						</TabsTrigger>
						<TabsTrigger value="sol" aria-label="SOL / Solana">
							<CurrencyIcon currency="sol" decorative />
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<RefreshButton loading={refreshing} onClick={onRefresh} />
			</div>
		</div>
	);
}
