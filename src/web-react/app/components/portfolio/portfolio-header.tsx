import { CurrencyIcon } from "~/components/currency-icon";
import { RefreshButton } from "~/components/dashboard-page-parts";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { Currency } from "~/lib/currency";

function greeting() {
	const hour = new Date().getHours();
	if (hour >= 5 && hour < 11) return "Selamat pagi!";
	if (hour >= 11 && hour < 15) return "Selamat siang!";
	if (hour >= 15 && hour < 18) return "Selamat sore!";
	return "Selamat malam!";
}

export function PortfolioHeader({
	currency,
	onCurrencyChange,
	onRefresh,
	refreshing,
}: {
	currency: Currency;
	onCurrencyChange: (currency: Currency) => void;
	onRefresh: () => void;
	refreshing: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
			<h1 className="text-2xl font-bold tracking-tight">{greeting()}</h1>
			<div className="flex items-center gap-2">
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
