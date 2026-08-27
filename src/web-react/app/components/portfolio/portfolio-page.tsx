import { useCallback, useEffect, useState } from "react";
import { useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { LoadErrorCard } from "~/components/dashboard-page-parts";
import { DashboardShell } from "~/components/dashboard-shell";
import { PageSkeleton, useIsNavigating } from "~/components/page-skeletons";
import { PnlCardDialog } from "~/components/pnl-card/pnl-card-dialog";
import { PortfolioContent } from "~/components/portfolio/portfolio-content";
import { useAutoRefresh } from "~/hooks/use-auto-refresh";
import {
	type Currency,
	PORTFOLIO_CURRENCY_STORAGE_KEY,
	readStoredCurrency,
	resolveCurrency,
	writeStoredCurrency,
} from "~/lib/currency";
import type { PortfolioPayload } from "~/lib/server/portfolio.server";
import { createPnlCardDataFromTotal } from "../../../../pnl-card/render.js";
import type { PnlCardData } from "../../../../pnl-card/types.js";
import { PortfolioHeader } from "./portfolio-header";

export type { Currency } from "~/lib/currency";
export type RangeFilter = "all" | "in-range" | "oor";

export function PortfolioPage() {
	useAutoRefresh(10_000);
	const data = useLoaderData<PortfolioPayload>();
	const isNavigating = useIsNavigating();
	const [searchParams, setSearchParams] = useSearchParams();
	const [storedCurrency, setStoredCurrency] = useState<Currency | null>(null);
	const [rangeFilter, setRangeFilter] = useState<RangeFilter>("all");
	const { revalidate, state } = useRevalidator();
	const [pnlCardData, setPnlCardData] = useState<PnlCardData | null>(null);
	const [pnlCardOpen, setPnlCardOpen] = useState(false);
	const currency = resolveCurrency(
		searchParams.get("currency"),
		storedCurrency,
	);

	useEffect(() => {
		setStoredCurrency(
			readStoredCurrency(window.localStorage, PORTFOLIO_CURRENCY_STORAGE_KEY),
		);
	}, []);

	const setCurrency = (value: Currency) => {
		writeStoredCurrency(
			window.localStorage,
			PORTFOLIO_CURRENCY_STORAGE_KEY,
			value,
		);
		setStoredCurrency(value);
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

	const onClosedPageChange = (page: number) =>
		setSearchParams(
			(current) => {
				const next = new URLSearchParams(current);
				if (page > 1) next.set("closedPage", String(page));
				else next.delete("closedPage");
				return next;
			},
			{ preventScrollReset: true },
		);

	const handleOpenTotalPnlCard = useCallback(() => {
		if (!data.wallet || !data.total) return;
		const closedPools = data.closed?.pools ?? [];
		const cardData = createPnlCardDataFromTotal({
			wallet: data.wallet,
			total: data.total,
			closedPools,
		});
		setPnlCardData(cardData);
		setPnlCardOpen(true);
	}, [data.wallet, data.total, data.closed]);

	const handleOpenPnlCard = useCallback((cardData: PnlCardData) => {
		setPnlCardData(cardData);
		setPnlCardOpen(true);
	}, []);

	if (isNavigating) {
		return (
			<DashboardShell title="Portfolio">
				<PageSkeleton />
			</DashboardShell>
		);
	}
	if (!data.ok) {
		return (
			<DashboardShell title="Portfolio">
				<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
					<PortfolioHeader
						currency={currency}
						onCurrencyChange={() => {}}
						onRefresh={revalidate}
						refreshing={state === "loading"}
					/>
					<LoadErrorCard title="Failed to load portfolio" error={data.error} />
				</div>
			</DashboardShell>
		);
	}

	return (
		<DashboardShell title="Portfolio" wallet={data.wallet} rpc={data.rpc}>
			<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
				<PortfolioHeader
					currency={currency}
					onCurrencyChange={setCurrency}
					onRefresh={revalidate}
					refreshing={state === "loading"}
					onSharePnl={handleOpenTotalPnlCard}
				/>
				<PortfolioContent
					data={data}
					currency={currency}
					rangeFilter={rangeFilter}
					onRangeFilterChange={setRangeFilter}
					onClosedPageChange={onClosedPageChange}
					onPnlCard={handleOpenPnlCard}
				/>
			</div>
			<PnlCardDialog
				open={pnlCardOpen}
				onOpenChange={setPnlCardOpen}
				data={pnlCardData}
			/>
		</DashboardShell>
	);
}
