"use client";

import type { PositionPnLData } from "@vexis/domain/position.js";
import { useMemo } from "react";
import type { Currency } from "~/lib/currency";
import { CumulativeChartShareCard } from "./cumulative-chart-share-card.js";
import { DailyChartShareCard } from "./daily-chart-share-card.js";
import { buildDailyStats, DailyPnlCard } from "./daily-pnl-card.js";
import { PnlShareShell } from "./pnl-share-shell.js";

export function DailyPnlShareDialog({
	open,
	onOpenChange,
	date,
	closed,
	currency,
	variant,
	chartPoints,
	chartRangeLabel,
	chartTimeframe,
	chartMode,
	chartTotal,
	cumulativePoints,
	cumulativeRangeLabel,
	cumulativeMode,
	cumulativeTotal,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	date: Date;
	closed: readonly PositionPnLData[];
	currency: Currency;
	variant?: "daily" | "chart" | "cumulative";
	chartPoints?: readonly { key: string; label: string; value: number }[];
	chartRangeLabel?: string;
	chartTimeframe?: "daily" | "weekly" | "monthly";
	chartMode?: "fees" | "total";
	chartTotal?: number;
	cumulativePoints?: readonly { key: string; label: string; value: number }[];
	cumulativeRangeLabel?: string;
	cumulativeMode?: "fees" | "total";
	cumulativeTotal?: number;
}) {
	const stats = useMemo(
		() => buildDailyStats(closed, date, currency),
		[closed, date, currency],
	);
	const isChart = variant === "chart";
	const isCumulative = variant === "cumulative";
	const chartFilename = useMemo(() => {
		if (isChart && chartRangeLabel) {
			const safe = chartRangeLabel.replace(/[^A-Z0-9]+/gi, "-").toLowerCase();
			return `pnl-chart-${safe || "all"}.png`;
		}
		if (isCumulative && cumulativeRangeLabel) {
			const safe = cumulativeRangeLabel
				.replace(/[^A-Z0-9]+/gi, "-")
				.toLowerCase();
			return `pnl-cumulative-${safe || "all"}.png`;
		}
		return "";
	}, [isChart, isCumulative, chartRangeLabel, cumulativeRangeLabel]);

	const dateKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
	const filename =
		isChart || isCumulative ? chartFilename : `pnl-daily-${dateKey}.png`;

	return (
		<PnlShareShell
			open={open}
			onOpenChange={onOpenChange}
			title={
				isChart
					? "Share PnL Chart"
					: isCumulative
						? "Share Cumulative PnL"
						: "Share Daily PnL"
			}
			description={
				isChart
					? "Preview and export your PnL chart card"
					: isCumulative
						? "Preview and export your cumulative PnL card"
						: "Preview and export your daily PnL card"
			}
			filename={filename}
		>
			{(cardRef, theme) =>
				isChart && chartPoints && chartRangeLabel && chartTotal != null ? (
					<DailyChartShareCard
						ref={cardRef}
						rangeLabel={chartRangeLabel}
						timeframe={chartTimeframe ?? "daily"}
						mode={chartMode ?? "total"}
						total={chartTotal}
						points={chartPoints}
						currency={currency}
						theme={theme}
					/>
				) : isCumulative &&
					cumulativePoints &&
					cumulativeRangeLabel &&
					cumulativeTotal != null ? (
					<CumulativeChartShareCard
						ref={cardRef}
						rangeLabel={cumulativeRangeLabel}
						mode={cumulativeMode ?? "total"}
						total={cumulativeTotal}
						points={cumulativePoints}
						currency={currency}
						theme={theme}
					/>
				) : (
					<DailyPnlCard
						ref={cardRef}
						date={date}
						stats={stats}
						currency={currency}
						theme={theme}
					/>
				)
			}
		</PnlShareShell>
	);
}
