"use client";

import { useMemo } from "react";
import type { Currency } from "~/lib/currency";
import { DailyChartShareCard } from "./daily-chart-share-card.js";
import { PnlShareShell } from "./pnl-share-shell.js";

export function DailyChartShareDialog({
	open,
	onOpenChange,
	rangeLabel,
	timeframe,
	mode,
	total,
	points,
	currency,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	rangeLabel: string;
	timeframe: "daily" | "weekly" | "monthly";
	mode: "fees" | "total";
	total: number;
	points: readonly { key: string; label: string; value: number }[];
	currency: Currency;
}) {
	const filename = useMemo(() => {
		const safe = rangeLabel.replace(/[^A-Z0-9]+/gi, "-").toLowerCase();
		return `pnl-chart-${safe || "all"}.png`;
	}, [rangeLabel]);

	return (
		<PnlShareShell
			open={open}
			onOpenChange={onOpenChange}
			title="Share PnL Chart"
			description="Export daily PnL chart as image"
			filename={filename}
			renderCard={(theme, ref) => (
				<DailyChartShareCard
					ref={ref}
					rangeLabel={rangeLabel}
					timeframe={timeframe}
					mode={mode}
					total={total}
					points={points}
					currency={currency}
					theme={theme}
				/>
			)}
		/>
	);
}
